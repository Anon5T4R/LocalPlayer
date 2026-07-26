//! FFI mínima da libmpv, carregada por `dlopen` — DE PROPÓSITO, não por falta
//! do crate.
//!
//! O crate `libmpv2` LINKA (`-lmpv`), e linkar amarra o binário a um SONAME:
//! o runner do CI é Ubuntu 22.04 com `libmpv.so.1`, o Arch de hoje tem
//! `libmpv.so.2` — um binário linkado no runner nem abre no Arch, e quebraria
//! justamente o pacote pacman, que é o canal que o Hub prefere. Com `dlopen`
//! tentamos os dois sonames em runtime: quem tem o mpv instalado (que o player
//! já exige) tem a lib; quem não tem cai no fallback de sempre (janela própria
//! — e sem mpv nenhum, o front já mostra o estado "no-mpv").
//!
//! A superfície é só o que o `gl_video` usa: criar/configurar/inicializar o
//! handle, mandar comando, e a render API OpenGL. Structs e constantes vêm do
//! `client.h`/`render.h` do mpv, estáveis há anos (a render API existe desde o
//! 0.29; os dois sonames que carregamos têm os mesmos campos).

#![cfg(target_os = "linux")]
#![allow(non_camel_case_types)]

use std::ffi::{c_char, c_int, c_void, CString};

// ── tipos opacos e assinaturas (client.h / render.h) ─────────────────────────

pub enum mpv_handle {}
pub enum mpv_render_context {}

// mpv_render_param_type — só os que usamos.
const MPV_RENDER_PARAM_INVALID: c_int = 0;
const MPV_RENDER_PARAM_API_TYPE: c_int = 1;
const MPV_RENDER_PARAM_OPENGL_INIT_PARAMS: c_int = 2;
const MPV_RENDER_PARAM_OPENGL_FBO: c_int = 3;
const MPV_RENDER_PARAM_FLIP_Y: c_int = 4;

#[repr(C)]
struct mpv_render_param {
    kind: c_int,
    data: *mut c_void,
}

#[repr(C)]
struct mpv_opengl_init_params {
    get_proc_address: extern "C" fn(*mut c_void, *const c_char) -> *mut c_void,
    get_proc_address_ctx: *mut c_void,
}

#[repr(C)]
struct mpv_opengl_fbo {
    fbo: c_int,
    w: c_int,
    h: c_int,
    internal_format: c_int,
}

type fn_create = extern "C" fn() -> *mut mpv_handle;
type fn_initialize = extern "C" fn(*mut mpv_handle) -> c_int;
type fn_set_option_string =
    extern "C" fn(*mut mpv_handle, *const c_char, *const c_char) -> c_int;
type fn_command = extern "C" fn(*mut mpv_handle, *mut *const c_char) -> c_int;
type fn_error_string = extern "C" fn(c_int) -> *const c_char;
type fn_rc_create = extern "C" fn(
    *mut *mut mpv_render_context,
    *mut mpv_handle,
    *mut mpv_render_param,
) -> c_int;
type fn_rc_render = extern "C" fn(*mut mpv_render_context, *mut mpv_render_param) -> c_int;
type fn_rc_set_update_callback =
    extern "C" fn(*mut mpv_render_context, extern "C" fn(*mut c_void), *mut c_void);

/// A biblioteca aberta + os símbolos resolvidos. Vive num `Box::leak` no
/// `gl_video` (a instância acompanha o processo), então nada aqui fecha o
/// handle do `dlopen`.
pub struct LibMpv {
    create: fn_create,
    initialize: fn_initialize,
    set_option_string: fn_set_option_string,
    command: fn_command,
    error_string: fn_error_string,
    rc_create: fn_rc_create,
    rc_render: fn_rc_render,
    rc_set_update_callback: fn_rc_set_update_callback,
}

fn dlopen_primeiro() -> Result<*mut c_void, String> {
    // `.so.2` primeiro (mpv >= 0.35: Arch, Debian 12, Ubuntu 24.04), `.so.1`
    // depois (Ubuntu 22.04/Debian 11), e o link de dev por último.
    for nome in ["libmpv.so.2", "libmpv.so.1", "libmpv.so"] {
        let c = CString::new(nome).unwrap();
        let h = unsafe { libc::dlopen(c.as_ptr(), libc::RTLD_NOW | libc::RTLD_GLOBAL) };
        if !h.is_null() {
            return Ok(h);
        }
    }
    Err("libmpv não encontrada (nem .so.2, nem .so.1) — o pacote do mpv está instalado?".into())
}

macro_rules! simbolo {
    ($h:expr, $nome:literal) => {{
        let c = CString::new($nome).unwrap();
        let p = unsafe { libc::dlsym($h, c.as_ptr()) };
        if p.is_null() {
            return Err(concat!("símbolo ausente na libmpv: ", $nome).to_string());
        }
        unsafe { std::mem::transmute(p) }
    }};
}

impl LibMpv {
    pub fn abrir() -> Result<&'static LibMpv, String> {
        let h = dlopen_primeiro()?;
        Ok(Box::leak(Box::new(LibMpv {
            create: simbolo!(h, "mpv_create"),
            initialize: simbolo!(h, "mpv_initialize"),
            set_option_string: simbolo!(h, "mpv_set_option_string"),
            command: simbolo!(h, "mpv_command"),
            error_string: simbolo!(h, "mpv_error_string"),
            rc_create: simbolo!(h, "mpv_render_context_create"),
            rc_render: simbolo!(h, "mpv_render_context_render"),
            rc_set_update_callback: simbolo!(h, "mpv_render_context_set_update_callback"),
        })))
    }

    fn erro(&self, code: c_int, contexto: &str) -> String {
        let s = unsafe { std::ffi::CStr::from_ptr((self.error_string)(code)) };
        format!("{}: {}", contexto, s.to_string_lossy())
    }
}

/// Handle do mpv já inicializado, com as opções do modo embutido.
pub struct Mpv {
    lib: &'static LibMpv,
    h: *mut mpv_handle,
}

// O handle do mpv é thread-safe por contrato da API (client.h: "concurrent
// calls are allowed"); os comandos chegam de threads de worker do Tauri.
unsafe impl Send for Mpv {}
unsafe impl Sync for Mpv {}

impl Mpv {
    /// `opts` são pares opção=valor aplicados ANTES do `mpv_initialize` — é o
    /// que faz `input-ipc-server` e `vo=libmpv` valerem desde o arranque.
    pub fn criar(opts: &[(&str, &str)]) -> Result<Mpv, String> {
        let lib = LibMpv::abrir()?;
        let h = (lib.create)();
        if h.is_null() {
            return Err("mpv_create devolveu nulo".into());
        }
        for (k, v) in opts {
            let ck = CString::new(*k).map_err(|_| "opção com NUL")?;
            let cv = CString::new(*v).map_err(|_| "valor com NUL")?;
            let r = (lib.set_option_string)(h, ck.as_ptr(), cv.as_ptr());
            if r < 0 {
                return Err(lib.erro(r, k));
            }
        }
        let r = (lib.initialize)(h);
        if r < 0 {
            return Err(lib.erro(r, "mpv_initialize"));
        }
        Ok(Mpv { lib, h })
    }

    pub fn command(&self, args: &[&str]) -> Result<(), String> {
        let cs: Vec<CString> = args
            .iter()
            .map(|a| CString::new(*a).map_err(|_| "argumento com NUL".to_string()))
            .collect::<Result<_, _>>()?;
        let mut ptrs: Vec<*const c_char> = cs.iter().map(|c| c.as_ptr()).collect();
        ptrs.push(std::ptr::null());
        let r = (self.lib.command)(self.h, ptrs.as_mut_ptr());
        if r < 0 {
            return Err(self.lib.erro(r, args.first().unwrap_or(&"comando")));
        }
        Ok(())
    }
}

/// Contexto de render OpenGL ligado a um `Mpv`.
pub struct RenderContext {
    lib: &'static LibMpv,
    ctx: *mut mpv_render_context,
}

extern "C" fn trampolim_proc_address(ctx: *mut c_void, name: *const c_char) -> *mut c_void {
    // `ctx` é o ponteiro da função de resolução passada em `criar` (leaked).
    let f: &fn(&str) -> *mut c_void = unsafe { &*(ctx as *const fn(&str) -> *mut c_void) };
    let nome = unsafe { std::ffi::CStr::from_ptr(name) };
    f(nome.to_str().unwrap_or(""))
}

extern "C" fn trampolim_update(ctx: *mut c_void) {
    let f: &Box<dyn Fn() + Send> = unsafe { &*(ctx as *const Box<dyn Fn() + Send>) };
    f()
}

impl RenderContext {
    /// Cria o contexto. TEM que ser chamado com o contexto GL do GTK ativo
    /// (dentro do `realize` do GLArea) — o mpv resolve os símbolos GL na hora.
    pub fn criar(mpv: &Mpv, get_proc: fn(&str) -> *mut c_void) -> Result<RenderContext, String> {
        let api = CString::new("opengl").unwrap();
        // O ponteiro da função de resolução precisa sobreviver ao contexto
        // inteiro — leak deliberado, mesmo raciocínio do Mpv estático.
        let get_proc = Box::leak(Box::new(get_proc));
        let mut init = mpv_opengl_init_params {
            get_proc_address: trampolim_proc_address,
            get_proc_address_ctx: get_proc as *mut fn(&str) -> *mut c_void as *mut c_void,
        };
        let mut params = [
            mpv_render_param {
                kind: MPV_RENDER_PARAM_API_TYPE,
                data: api.as_ptr() as *mut c_void,
            },
            mpv_render_param {
                kind: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,
                data: &mut init as *mut _ as *mut c_void,
            },
            mpv_render_param { kind: MPV_RENDER_PARAM_INVALID, data: std::ptr::null_mut() },
        ];
        let mut ctx: *mut mpv_render_context = std::ptr::null_mut();
        let r = (mpv.lib.rc_create)(&mut ctx, mpv.h, params.as_mut_ptr());
        if r < 0 || ctx.is_null() {
            return Err(mpv.lib.erro(r, "mpv_render_context_create"));
        }
        Ok(RenderContext { lib: mpv.lib, ctx })
    }

    /// O callback chega da THREAD DE RENDER do mpv — daí o `Send`.
    pub fn set_update_callback(&self, cb: impl Fn() + Send + 'static) {
        let cb: Box<dyn Fn() + Send> = Box::new(cb);
        let cb = Box::leak(Box::new(cb));
        (self.lib.rc_set_update_callback)(
            self.ctx,
            trampolim_update,
            cb as *mut Box<dyn Fn() + Send> as *mut c_void,
        );
    }

    pub fn render(&self, fbo: i32, w: i32, h: i32, flip: bool) -> Result<(), String> {
        let mut alvo = mpv_opengl_fbo { fbo, w, h, internal_format: 0 };
        let mut flip_y: c_int = if flip { 1 } else { 0 };
        let mut params = [
            mpv_render_param {
                kind: MPV_RENDER_PARAM_OPENGL_FBO,
                data: &mut alvo as *mut _ as *mut c_void,
            },
            mpv_render_param {
                kind: MPV_RENDER_PARAM_FLIP_Y,
                data: &mut flip_y as *mut _ as *mut c_void,
            },
            mpv_render_param { kind: MPV_RENDER_PARAM_INVALID, data: std::ptr::null_mut() },
        ];
        let r = (self.lib.rc_render)(self.ctx, params.as_mut_ptr());
        if r < 0 {
            return Err(self.lib.erro(r, "render"));
        }
        Ok(())
    }
}
