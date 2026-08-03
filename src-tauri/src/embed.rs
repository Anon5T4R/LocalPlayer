//! Embed do vídeo no Windows (Plano A do plano de execução).
//!
//! Cria uma child window nativa sob a janela principal do Tauri e devolve o
//! HWND dela. Esse HWND vai pro mpv via `--wid`: o mpv reparenteia o seu output
//! de vídeo pra dentro dessa janela. A UI (WebView2) fica ao redor e os
//! controles são desenhados no HTML — sem depender de transparência do WebView2.
//!
//! A classe é NOSSA (não a "Static" do sistema), registrada com `CS_DBLCLKS`: o
//! duplo-clique sobre o vídeo — que o WebView nunca vê, a child window engole o
//! clique antes dele — vira o evento `video-dblclick` pro front, que alterna o
//! fullscreen. Se o registro da classe falhar, o fallback é a classe "Static"
//! de antes (sem duplo-clique no vídeo, mas nada quebra).
//!
//! Tudo aqui é `cfg(windows)`. No Linux o app usa o Plano B (janela própria do
//! mpv), então este módulo nem é compilado no CI Ubuntu.
#![cfg(windows)]

use std::ptr;
use std::sync::OnceLock;

use tauri::Emitter;
use winapi::shared::minwindef::{LPARAM, LRESULT, UINT, WPARAM};
use winapi::shared::windef::HWND;
use winapi::shared::winerror::ERROR_CLASS_ALREADY_EXISTS;
use winapi::um::errhandlingapi::GetLastError;
use winapi::um::libloaderapi::GetModuleHandleW;
use winapi::um::winuser::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassW, SetWindowPos, ShowWindow,
    WNDCLASSW, CS_DBLCLKS, HWND_TOP, SWP_NOACTIVATE, SW_HIDE, SW_SHOWNOACTIVATE, WM_LBUTTONDBLCLK,
    WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS, WS_VISIBLE,
};

/// AppHandle global: o WndProc é função livre, sem contexto — é por aqui que ele
/// alcança o `emit` do `video-dblclick`. Só de leitura depois de registrado.
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Duplo-clique sobre o vídeo embutido → `video-dblclick` (o front alterna o
/// fullscreen — ver App.tsx). O resto cai no DefWindowProc, janela genérica.
unsafe extern "system" fn video_wndproc(hwnd: HWND, msg: UINT, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if msg == WM_LBUTTONDBLCLK {
        if let Some(app) = APP.get() {
            let _ = app.emit("video-dblclick", ());
        }
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

/// Cria a child window de vídeo sob `parent` (HWND da janela do Tauri, passado
/// como isize pra atravessar threads/limites de crate sem tipos !Send).
/// Retorna o HWND da child como isize (0 nunca — erro vira `Err`).
///
/// # Safety
/// Precisa rodar na thread de UI (a mesma dona de `parent`).
pub unsafe fn create_child(parent_isize: isize, app: tauri::AppHandle) -> Result<isize, String> {
    let parent = parent_isize as HWND;
    let hinstance = GetModuleHandleW(ptr::null());
    let class_name = wide("LocalPlayerVideo");
    let class_static = wide("Static");

    // Registra a classe própria (CS_DBLCLKS) uma vez. Já registrada também é ok
    // (ERROR_CLASS_ALREADY_EXISTS); qualquer outro erro → fallback pra "Static",
    // o comportamento antigo: perde o duplo-clique no vídeo, não quebra nada.
    let our_class = {
        let mut cls: WNDCLASSW = std::mem::zeroed();
        cls.style = CS_DBLCLKS;
        cls.lpfnWndProc = Some(video_wndproc);
        cls.hInstance = hinstance;
        cls.hbrBackground = ptr::null_mut();
        cls.lpszClassName = class_name.as_ptr();
        let r = RegisterClassW(&cls);
        r != 0 || GetLastError() == ERROR_CLASS_ALREADY_EXISTS
    };

    if our_class {
        APP.get_or_init(|| app.clone());
    }
    let class = if our_class {
        class_name.as_ptr()
    } else {
        class_static.as_ptr()
    };

    let hwnd = CreateWindowExW(
        0,
        class,
        ptr::null(),
        WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
        0,
        0,
        16,
        16,
        parent,
        ptr::null_mut(),
        hinstance,
        ptr::null_mut(),
    );
    if hwnd.is_null() {
        return Err("CreateWindowExW falhou ao criar a janela de vídeo".into());
    }
    Ok(hwnd as isize)
}

/// Reposiciona/redimensiona (ou esconde) a child window de vídeo.
/// Coordenadas em pixels físicos, relativas ao cliente da janela do Tauri.
///
/// # Safety
/// `child_isize` tem que ser um HWND válido criado por `create_child`.
pub unsafe fn set_rect(child_isize: isize, x: i32, y: i32, w: i32, h: i32, visible: bool) {
    let child = child_isize as HWND;
    if visible && w > 0 && h > 0 {
        ShowWindow(child, SW_SHOWNOACTIVATE);
        // HWND_TOP (não NOZORDER): traz a child de vídeo pra cima do WebView2, senão
        // o webview opaco a cobre e o palco fica preto (lição paga em v0.1.2).
        SetWindowPos(child, HWND_TOP, x, y, w, h, SWP_NOACTIVATE);
    } else {
        ShowWindow(child, SW_HIDE);
    }
}

/// Destrói a child window de vídeo. Reservada — hoje a janela é destruída pelo
/// SO no encerramento do processo; mantida pra um futuro "trocar de janela".
///
/// # Safety
/// Precisa rodar na thread de UI dona da janela.
#[allow(dead_code)]
pub unsafe fn destroy(child_isize: isize) {
    let child = child_isize as HWND;
    if !child.is_null() {
        DestroyWindow(child);
    }
}
