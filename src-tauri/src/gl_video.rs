//! Vídeo DENTRO da janela, no Linux (Plano A também aqui).
//!
//! ─── Por que não dá pra fazer como no Windows ────────────────────────────────
//!
//! No Windows o embed é por `--wid`: criamos uma child window nativa e o mpv
//! reparenteia a saída de vídeo pra dentro dela (ver `embed.rs`). No Wayland
//! isso **não existe** — o protocolo não permite um processo enfiar sua
//! superfície na janela de outro, e não é limitação do mpv: a libVLC esbarra no
//! mesmo com `--drawable-xid`. Trocar de player não resolveria nada.
//!
//! ─── O que fazemos em vez disso ──────────────────────────────────────────────
//!
//! Não usamos janela nenhuma. O mpv entra como BIBLIOTECA (libmpv) e desenha os
//! frames num framebuffer que nós controlamos, dentro de um `GtkGLArea` da
//! própria janela do app. O WebView fica POR CIMA, com fundo transparente, e os
//! controles seguem sendo HTML. É o desenho que o Celluloid usa, e funciona
//! igual em Wayland e em X11.
//!
//! ─── O que isto exige, e que só ficou possível agora ─────────────────────────
//!
//! Transparência do WebView. Até 26/07/2026 o app subia com
//! `WEBKIT_DISABLE_COMPOSITING_MODE=1` como contorno da tela branca — e sem
//! compositing o webkit não faz transparência. O contorno saiu quando a causa
//! real (libs de host empacotadas no AppDir) foi corrigida no empacotamento.
//! Sem aquele conserto, este módulo não teria como funcionar.

//! ─── ESTADO: DESLIGADO (26/07/2026) ──────────────────────────────────────────
//!
//! A base funciona e está verificada: a libmpv inicia, o `GtkGLArea` cria
//! contexto, o contexto de render nasce e a IPC sobe na instância de dentro do
//! app — tudo confirmado rodando.
//!
//! O que NÃO funciona é a composição. No GTK3 o `GtkGLArea` pinta por cima dos
//! filhos de overlay, e a janela inteira fica preta. Medi as duas camadas com
//! o app rodando: `GLArea 1180x673 | WebView 1180x673 (visível=true)` — ou
//! seja, não é dimensionamento nem visibilidade, é ordem de desenho.
//!
//! Por isso o módulo está atrás da feature `video-na-janela`, desligada. O
//! caminho de produção segue sendo o mpv em janela própria.
//!
//! Para retomar, o problema a resolver é ESTE: como fazer o WebView ser
//! composto SOBRE uma superfície GL no GTK3. Caminhos plausíveis, nenhum
//! testado ainda: `gtk_gl_area_set_use_es` + `gdk_window_ensure_native` no
//! WebView, ou desenhar o vídeo no `draw` do próprio container em vez de num
//! GLArea, ou subir pra GTK4 (onde a composição de widgets GL é outra).

#![cfg(target_os = "linux")]

use std::cell::RefCell;
use std::ffi::{c_void, CString};
use std::rc::Rc;

use gtk::prelude::*;
use libmpv2::render::{OpenGLInitParams, RenderContext, RenderParam, RenderParamApiType};
use libmpv2::Mpv;

/// Resolve um símbolo de OpenGL já carregado NESTE processo.
///
/// `RTLD_DEFAULT` procura na ordem normal de resolução do processo — ou seja,
/// acha exatamente a libepoxy/libGL que o GTK já carregou pro `GtkGLArea`.
/// Abrir a lib por conta própria (`dlopen`) funcionaria e entregaria ponteiros
/// de OUTRO carregador: o tipo de erro que aparece como tela preta, sem
/// mensagem nenhuma.
fn sym(name: &str) -> *mut c_void {
    match CString::new(name) {
        Ok(n) => unsafe { libc::dlsym(libc::RTLD_DEFAULT, n.as_ptr()) },
        Err(_) => std::ptr::null_mut(),
    }
}

fn get_proc_address(_ctx: &(), name: &str) -> *mut c_void {
    sym(name)
}

/// O FBO em que o GTK está desenhando agora.
///
/// O `GtkGLArea` NÃO desenha no framebuffer 0 — ele tem o seu. Entregar 0 ao
/// mpv faria o vídeo ser pintado por cima da janela inteira, ignorando o
/// widget; por isso perguntamos ao GL qual está ligado.
fn fbo_atual() -> i32 {
    const DRAW_FRAMEBUFFER_BINDING: u32 = 0x8CA6;
    let p = sym("glGetIntegerv");
    if p.is_null() {
        return 0;
    }
    let get_integerv: extern "C" fn(u32, *mut i32) = unsafe { std::mem::transmute(p) };
    let mut id: i32 = 0;
    get_integerv(DRAW_FRAMEBUFFER_BINDING, &mut id);
    id
}

pub struct GlVideo {
    /// `&'static` de propósito. O `RenderContext<'a>` empresta o `Mpv`, e guardar
    /// os dois na mesma struct faria dela auto-referencial — que o Rust recusa.
    /// O mpv do player vive enquanto o app viver, então vazá-lo de propósito é
    /// honesto e evita um `Pin`/`unsafe` que não pagaria por si.
    mpv: &'static Mpv,
    render: RefCell<Option<RenderContext<'static>>>,
    area: gtk::GLArea,
}

impl GlVideo {
    /// Enfileira um arquivo no mpv. Quem desenha é o sinal `render` do GLArea.
    pub fn load(&self, path: &str) -> Result<(), String> {
        self.mpv
            .command("loadfile", &[path, "replace"])
            .map_err(|e| format!("loadfile: {}", e))
    }

    pub fn command(&self, name: &str, args: &[&str]) -> Result<(), String> {
        self.mpv.command(name, args).map_err(|e| format!("{}: {}", name, e))
    }

    pub fn area(&self) -> &gtk::GLArea {
        &self.area
    }
}

/// Põe um `GtkGLArea` ATRÁS do conteúdo da janela e liga o mpv nele.
///
/// A janela do Tauri no Linux é uma `GtkApplicationWindow` cujo filho é a caixa
/// que contém o WebView. Para o vídeo ficar por baixo, trocamos esse filho por
/// um `GtkOverlay`: o `GLArea` vira o filho principal (o fundo) e a caixa
/// original entra como *overlay* (a camada de cima).
///
/// A ordem importa e não é estética: `GtkOverlay` desenha o filho principal
/// primeiro e os overlays depois. Invertida, o vídeo cobriria a interface.
pub fn attach(gtk_window: &gtk::ApplicationWindow) -> Result<Rc<GlVideo>, String> {
    let conteudo = gtk_window
        .child()
        .ok_or_else(|| "a janela do Tauri não tem filho — hierarquia inesperada".to_string())?;

    let area = gtk::GLArea::new();
    area.set_hexpand(true);
    area.set_vexpand(true);
    area.set_has_alpha(false);
    // Nós é que pedimos o redesenho, quando o mpv avisa que há frame novo.
    area.set_auto_render(false);

    let overlay = gtk::Overlay::new();
    gtk_window.remove(&conteudo);
    overlay.add(&area);
    // O filho de OVERLAY nao herda o tamanho do pai: por padrao ele fica no
    // tamanho natural e e posicionado pelo align. Sem forcar Fill+expand, o
    // WebView pode ficar com area zero — e ai a janela inteira mostra so o
    // GLArea, preta. Foi exatamente o que aconteceu na v0.5.10.
    conteudo.set_halign(gtk::Align::Fill);
    conteudo.set_valign(gtk::Align::Fill);
    conteudo.set_hexpand(true);
    conteudo.set_vexpand(true);
    overlay.add_overlay(&conteudo);
    // O WebView é a camada de cima e precisa RECEBER clique; sem isto o evento
    // atravessaria pro GLArea e a interface ficaria morta.
    overlay.set_overlay_pass_through(&conteudo, false);
    gtk_window.add(&overlay);
    overlay.show_all();

    // Diagnostico: se o WebView receber area zero, a janela mostra so o GLArea
    // (preta). Medir e o que separa "esta funcionando" de "nao deu erro".
    {
        let c = conteudo.clone();
        let a = area.clone();
        glib::timeout_add_local_once(std::time::Duration::from_secs(3), move || {
            eprintln!(
                "[gl_video] alocacao — GLArea {}x{} | WebView {}x{} (visivel={})",
                a.allocated_width(), a.allocated_height(),
                c.allocated_width(), c.allocated_height(), c.is_visible()
            );
        });
    }

    // A libmpv EXIGE `LC_NUMERIC=C` e se recusa a iniciar sem isso — ela avisa
    // no stderr ("Non-C locale detected") e devolve erro. O GTK, no arranque,
    // aplica o locale do sistema; num pt_BR o separador decimal vira vírgula e
    // o parser de opções do mpv quebra. Só o LC_NUMERIC é forçado: mexer no
    // locale inteiro trocaria o idioma de datas e textos do app.
    unsafe {
        libc::setlocale(libc::LC_NUMERIC, c"C".as_ptr());
    }

    // `vo=libmpv` é o que diz ao mpv "não abra janela, entregue os frames pra
    // quem chamou". Sem ele o mpv abre a janela dele — que é exatamente o
    // comportamento que este módulo existe pra eliminar.
    // A IPC continua existindo — e essa e a decisao central deste modulo.
    //
    // Migrar o controle pra chamada direta na libmpv obrigaria a reescrever a
    // camada de eventos inteira, e esbarraria num limite do crate: o
    // `PropertyData` dele so tem escalares, enquanto `track-list` e
    // `chapter-list` sao estruturas. Perderiamos faixas e capitulos, ou
    // precisariamos de FFI cru pra MPV_FORMAT_NODE.
    //
    // A libmpv aceita `input-ipc-server` como qualquer mpv. Abrindo o MESMO
    // socket que o caminho antigo usa, toda a camada de controle — comandos,
    // observadores, o `interpretEvent` do front e seus testes — segue valendo
    // sem uma linha alterada. O que muda e so ONDE o video e desenhado.
    let ipc = crate::mpv::ipc_path(std::process::id());
    let _ = std::fs::remove_file(&ipc);

    let mpv = Mpv::with_initializer(move |init| {
        init.set_property("vo", "libmpv")?;
        init.set_property("osc", false)?;
        init.set_property("input-default-bindings", false)?;
        init.set_property("input-vo-keyboard", false)?;
        // `set_option` porque `input-ipc-server` e uma OPCAO, lida pelo
        // `mpv_initialize` — e o inicializador roda antes dele. (`set_property`
        // tambem funciona aqui; `set_option` e que diz a intencao.)
        init.set_option("input-ipc-server", ipc.as_str())?;
        Ok(())
    })
    .map_err(|e| format!("não consegui iniciar o libmpv: {}", e))?;
    let mpv: &'static Mpv = Box::leak(Box::new(mpv));

    let video = Rc::new(GlVideo { mpv, render: RefCell::new(None), area: area.clone() });

    // O contexto de render só pode nascer com o contexto GL do GTK ATIVO, e
    // isso só é verdade dentro dos sinais do GLArea — daí ele ser criado no
    // `realize` e não aqui.
    {
        let video = video.clone();
        area.connect_realize(move |a| {
            a.make_current();
            if let Some(e) = a.error() {
                eprintln!("GLArea falhou ao criar contexto: {}", e);
                return;
            }
            match video.mpv.create_render_context(vec![
                RenderParam::ApiType(RenderParamApiType::OpenGl),
                RenderParam::InitParams(OpenGLInitParams { get_proc_address, ctx: () }),
            ]) {
                Ok(mut ctx) => {
                    // O mpv avisa daqui que há frame novo — e avisa da THREAD DE
                    // RENDER DELE. Por isso o callback precisa ser `Send`, e um
                    // widget GTK não é: capturar o GLArea aqui nem compila.
                    //
                    // O canal do glib é a ponte certa: o `Sender` é `Send` e
                    // atravessa a fronteira; o `Receiver`, anexado ao contexto
                    // principal, entrega na thread do GTK — que é a única onde o
                    // contexto GL existe e `queue_render` pode ser chamado.
                    let (tx, rx) = glib::MainContext::channel::<()>(glib::Priority::DEFAULT);
                    ctx.set_update_callback(move || {
                        let _ = tx.send(());
                    });
                    let a2 = a.clone();
                    rx.attach(None, move |_| {
                        a2.queue_render();
                        glib::ControlFlow::Continue
                    });
                    *video.render.borrow_mut() = Some(ctx);
                }
                Err(e) => eprintln!("não consegui criar o contexto de render do mpv: {}", e),
            }
        });
    }

    {
        let video = video.clone();
        area.connect_render(move |a, _| {
            if let Some(ctx) = video.render.borrow().as_ref() {
                let escala = a.scale_factor();
                let (w, h) = (a.allocated_width() * escala, a.allocated_height() * escala);
                let _ = ctx.render::<()>(fbo_atual(), w, h, true);
            }
            glib::Propagation::Stop
        });
    }

    Ok(video)
}

// ---------------------------------------------------------------------------
// Acesso a partir dos comandos do Tauri
//
// `GlVideo` guarda widgets GTK e um `Rc`, então NÃO é `Send`: não pode entrar
// no estado gerenciado do Tauri, que exige `Send + Sync`. Ele vive num
// `thread_local` da thread principal — que é a única onde tocá-lo é válido —
// e os comandos chegam nele por `run_on_main_thread`.
// ---------------------------------------------------------------------------

thread_local! {
    static VIDEO: RefCell<Option<Rc<GlVideo>>> = const { RefCell::new(None) };
}

pub fn guardar(v: Rc<GlVideo>) {
    VIDEO.with(|c| *c.borrow_mut() = Some(v));
}

fn com_video<R>(f: impl FnOnce(&GlVideo) -> R) -> Option<R> {
    VIDEO.with(|c| c.borrow().as_ref().map(|v| f(v)))
}

/// O vídeo na janela subiu? Consultado pelo `mpv_start` para decidir se precisa
/// lançar um processo mpv ou se já há um dentro do app.
pub fn ativo() -> bool {
    VIDEO.with(|c| c.borrow().is_some())
}

/// O vídeo na janela está disponível? O front usa isto pra decidir entre este
/// caminho e o do mpv em janela própria — em vez de adivinhar pelo sistema.
#[tauri::command]
pub fn gl_disponivel(app: tauri::AppHandle) -> bool {
    let (tx, rx) = std::sync::mpsc::channel();
    let _ = app.run_on_main_thread(move || {
        let _ = tx.send(com_video(|_| ()).is_some());
    });
    rx.recv_timeout(std::time::Duration::from_secs(2)).unwrap_or(false)
}

#[tauri::command]
pub fn gl_load(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let _ = app.run_on_main_thread(move || {
        let r = com_video(|v| v.load(&path))
            .unwrap_or_else(|| Err("vídeo na janela não está ativo".into()));
        let _ = tx.send(r);
    });
    rx.recv_timeout(std::time::Duration::from_secs(5))
        .unwrap_or_else(|_| Err("o mpv não respondeu a tempo".into()))
}
