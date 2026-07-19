//! Persistência do resume PRÓPRIO do app (independente do watch-later do mpv,
//! que só salva no quit e é opaco). O Rust aqui é um cofre burro: lê e grava a
//! string JSON que o front monta (a lógica de LRU/"deve retomar?" é pura e
//! testada em src/lib/resume.ts). Gravação atômica: .tmp + rename — nunca fica
//! um resume.json pela metade se o app cair no meio da escrita.

use std::path::PathBuf;

use tauri::Manager;

fn resume_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?
        .join("resume.json"))
}

/// Conteúdo bruto do resume.json ("{}" se não existir/ilegível — o front valida).
#[tauri::command(async)]
pub fn resume_load(app: tauri::AppHandle) -> String {
    match resume_path(&app) {
        Ok(p) => std::fs::read_to_string(p).unwrap_or_else(|_| "{}".into()),
        Err(_) => "{}".into(),
    }
}

/// Grava o resume.json de forma atômica (escreve num .tmp e renomeia por cima —
/// no Windows o `fs::rename` usa MOVEFILE_REPLACE_EXISTING, então substitui).
#[tauri::command(async)]
pub fn resume_save(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = resume_path(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("criar pasta: {}", e))?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, data.as_bytes()).map_err(|e| format!("gravar resume: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("renomear resume: {}", e))
}
