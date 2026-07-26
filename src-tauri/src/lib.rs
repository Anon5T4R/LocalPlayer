mod embed;
mod mpv;
mod resume;
mod storage;
mod thumbs;

use std::path::Path;

use tauri::{Emitter, Manager};

/// Caminho passado no launch ("Abrir com" num vídeo/áudio), se houver.
#[tauri::command(async)]
fn get_startup_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && Path::new(a).is_file())
}

/// Lista os ARQUIVOS (não pastas) de um diretório, caminhos completos.
/// O filtro por extensão de mídia e a ordenação natural ficam no front (testáveis).
#[tauri::command(async)]
fn list_dir(dir: String) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let rd = std::fs::read_dir(&dir).map_err(|e| format!("ler pasta {}: {}", dir, e))?;
    for entry in rd.flatten() {
        let path = entry.path();
        if path.is_file() {
            out.push(path.to_string_lossy().to_string());
        }
    }
    Ok(out)
}

/// Diretório-pai de um caminho (pra montar a playlist da pasta do arquivo aberto).
#[tauri::command(async)]
fn parent_dir(path: String) -> Option<String> {
    Path::new(&path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
}

fn open_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ── Contorno da tela branca do webkit: REMOVIDO, e o porquê importa ──────
    //
    // Este bloco desligava o renderer DMABUF, desligava o compositing e forçava
    // XWayland, porque o webkit2gtk pintava a janela inteira de branco em
    // Arch/GNOME. Era mitigação às cegas — o comentário dizia "branco é pior que
    // lento" — e custava a aceleração do WebView.
    //
    // A CAUSA foi encontrada em 26/07/2026 e é de EMPACOTAMENTO, não de código:
    // o AppDir do AppImage levava `libwayland-*` do Ubuntu do CI, que brigavam
    // com o Mesa do host e derrubavam o EGL (`EGL_BAD_PARAMETER`). Corrigido em
    // `Anon5T4R/linux-packaging`: as libs que falam com driver/compositor agora
    // vêm do host, e o pacote nativo (pacman/apt) usa o webkit do sistema.
    // Tratar o sintoma deixou de fazer sentido.
    //
    // Remover o forçamento NÃO tira a saída de emergência: estas variáveis são
    // lidas pelo próprio webkitgtk, não por este código. Se a tela branca voltar
    // em alguma combinação de driver, rodar com
    // `WEBKIT_DISABLE_DMABUF_RENDERER=1` continua funcionando — e aí é sinal de
    // que sobrou lib de host em algum AppDir, que é onde se deve olhar.
    //
    // Isto também é PRÉ-REQUISITO do vídeo em janela única: sem compositing o
    // webkit não faz transparência, e sem transparência não há como pôr os
    // controles em HTML sobre o vídeo.

    tauri::Builder::default()
        // single-instance primeiro: um 2º launch ("abrir com" num vídeo) encaminha
        // o caminho pra janela viva (ela adiciona/toca).
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(file) = argv.iter().skip(1).find(|a| Path::new(a).is_file()) {
                let _ = app.emit("open-file", file.clone());
            }
            open_main(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(mpv::MpvState::default())
        .manage(thumbs::ThumbsState::default())
        .setup(|app| {
            // Libera a pasta de miniaturas no protocolo asset: (SÓ ela).
            // Falhar aqui não derruba o app: fica sem prévia, o tooltip degrada
            // pra só-tempo.
            let _ = thumbs::allow_thumbs_dir(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_startup_file,
            list_dir,
            parent_dir,
            mpv::mpv_available,
            mpv::mpv_start,
            mpv::mpv_command,
            mpv::mpv_stop,
            mpv::stage_rect,
            resume::resume_load,
            resume::resume_save,
            thumbs::thumbs_start,
            thumbs::thumbs_cancel,
            storage::storage_info,
            storage::storage_clear_stale,
            storage::storage_clear_missing,
            storage::storage_clear_tmp,
            storage::storage_clear_all_thumbs
        ])
        .build(tauri::generate_context!())
        .expect("erro ao construir o app Tauri")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Encerra o mpv e destrói a child window de vídeo (já estamos na
                // thread principal aqui, então a chamada Win32 é segura).
                if let Some(state) = app_handle.try_state::<mpv::MpvState>() {
                    mpv::stop(&state);
                }
            }
        });
}
