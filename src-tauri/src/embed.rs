//! Embed do vídeo no Windows (Plano A do plano de execução).
//!
//! Cria uma child window nativa (classe "Static", já existente no sistema —
//! não precisamos de WndProc próprio) sob a janela principal do Tauri e devolve
//! o HWND dela. Esse HWND vai pro mpv via `--wid`: o mpv reparenteia o seu
//! output de vídeo pra dentro dessa janela. A UI (WebView2) fica ao redor e os
//! controles são desenhados no HTML — sem depender de transparência do WebView2.
//!
//! Tudo aqui é `cfg(windows)`. No Linux o app usa o Plano B (janela própria do
//! mpv), então este módulo nem é compilado no CI Ubuntu.
#![cfg(windows)]

use std::ptr;

use winapi::shared::windef::HWND;
use winapi::um::libloaderapi::GetModuleHandleW;
use winapi::um::winuser::{
    CreateWindowExW, DestroyWindow, SetWindowPos, ShowWindow, SWP_NOACTIVATE, SWP_NOZORDER,
    SW_HIDE, SW_SHOWNOACTIVATE, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS, WS_VISIBLE,
};

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Cria a child window de vídeo sob `parent` (HWND da janela do Tauri, passado
/// como isize pra atravessar threads/limites de crate sem tipos !Send).
/// Retorna o HWND da child como isize (0 nunca — erro vira `Err`).
///
/// # Safety
/// Precisa rodar na thread de UI (a mesma dona de `parent`).
pub unsafe fn create_child(parent_isize: isize) -> Result<isize, String> {
    let parent = parent_isize as HWND;
    let hinstance = GetModuleHandleW(ptr::null());
    let class = wide("Static");
    let name = wide("");
    let hwnd = CreateWindowExW(
        0,
        class.as_ptr(),
        name.as_ptr(),
        WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
        0,
        0,
        16,
        16,
        parent,
        ptr::null_mut(),
        hinstance as _,
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
        SetWindowPos(child, ptr::null_mut(), x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE);
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
