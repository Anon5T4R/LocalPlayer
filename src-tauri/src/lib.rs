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
