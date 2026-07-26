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

//! ─── Por que o vídeo fica POR CIMA, e não por baixo ─────────────────────────
//!
//! O desenho óbvio (GLArea atrás, WebView transparente na frente) NÃO funciona
//! com webkit2gtk, e isso foi provado empiricamente, não suposto: com o mpv
//! rendendo Ok a 120 fps, geometria correta, furo de CSS atravessando a pilha
//! inteira e visual RGBA na janela, pintamos o clear do mpv de MAGENTA — e a
//! área continuou cinza. O webkit oclui o que está atrás dele de forma opaca,
//! não importa o alpha.
//!
//! Então as camadas são invertidas: o WebView é o fundo (a interface inteira)
//! e o GLArea fica POR CIMA, posicionado e recortado no retângulo do `.stage`
//! que o próprio front reporta (`stage_rect` — a MESMA infraestrutura do embed
//! do Windows, com ResizeObserver e tudo). Cliques atravessam o GLArea
//! (`set_overlay_pass_through`), então a interface continua inteira clicável;
//! o que fica sob o vídeo é exatamente o `.stage`, que já era só o palco.
//!
//! Lições pagas que continuam valendo aqui:
//! - o reparent do WebView TEM que acontecer antes do primeiro map (janela
//!   nasce com `visible: false`); depois de mapeado o webkit2gtk não pinta
//!   nunca mais.
//! - o wry sobe DOIS níveis do webview e exige a GtkWindow ali a cada clique
//!   (undecorated_resizing.rs) — o webview precisa ser filho direto do
//!   overlay, e o overlay filho direto da janela. Qualquer outra forma aborta
//!   o app no primeiro clique.

#![cfg(target_os = "linux")]

use std::cell::RefCell;
use std::ffi::{c_void, CString};
use std::rc::Rc;

use gtk::prelude::*;

use crate::mpv_ffi::{Mpv, RenderContext};

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
    /// `&'static` de propósito: a instância acompanha o processo (nasce no
    /// arranque, morre com o app), então vazá-la é honesto e simples.
    mpv: &'static Mpv,
    render: RefCell<Option<RenderContext>>,
    area: gtk::GLArea,
}

impl GlVideo {
    /// Enfileira um arquivo no mpv. Quem desenha é o sinal `render` do GLArea.
    pub fn load(&self, path: &str) -> Result<(), String> {
        self.mpv.command(&["loadfile", path, "replace"])
    }

    pub fn command(&self, args: &[&str]) -> Result<(), String> {
        self.mpv.command(args)
    }

    pub fn area(&self) -> &gtk::GLArea {
        &self.area
    }

    /// Posiciona o vídeo no retângulo do `.stage`. Recebe pixels FÍSICOS (o
    /// front multiplica por devicePixelRatio, herança do embed do Windows,
    /// onde a child window é endereçada assim); margens e size_request do GTK
    /// são LÓGICOS, daí a divisão pelo scale factor.
    pub fn set_rect(&self, x: i32, y: i32, w: i32, h: i32, visible: bool) {
        let esc = self.area.scale_factor().max(1);
        let (x, y, w, h) = (x / esc, y / esc, w / esc, h / esc);
        if !visible || w <= 0 || h <= 0 {
            self.area.hide();
            return;
        }
        self.area.set_margin_start(x);
        self.area.set_margin_top(y);
        self.area.set_size_request(w, h);
        self.area.show();
        self.area.queue_render();
    }
}

/// Ponte do comando `stage_rect` (thread de worker) até o GLArea (thread do
/// GTK). Best-effort: se o vídeo na janela não subiu, não há o que posicionar.
pub fn aplicar_rect(app: &tauri::AppHandle, x: i32, y: i32, w: i32, h: i32, visible: bool) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        let _ = com_video(|v| v.set_rect(x, y, w, h, visible));
    });
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
    // ── A forma da árvore NÃO é escolha nossa ───────────────────────────────
    //
    // A cada clique no webview, o wry sobe EXATAMENTE dois níveis e exige a
    // janela ali (undecorated_resizing.rs:546):
    //
    //     webview.parent().and_then(|w| w.parent())
    //         .downcast::<gtk::Window>().unwrap()   // ← aborta se não for
    //
    // A árvore original é `webview → GtkBox → GtkWindow`. Se o overlay envolver
    // a caixa (`webview → caixa → Overlay → janela`), o app abre, TOCA VÍDEO —
    // e morre no primeiro clique. Aconteceu. A única forma que satisfaz o wry é
    // o overlay substituir a caixa, com o webview DIRETO nele:
    //
    //     webview → GtkOverlay → GtkWindow
    //
    // Por isso aqui se desmonta a caixa do Tauri e se pega o webview cru.
    let conteudo = gtk_window
        .child()
        .ok_or_else(|| "a janela do Tauri não tem filho — hierarquia inesperada".to_string())?;

    let webview: gtk::Widget = if conteudo.type_().name() == "WebKitWebView" {
        conteudo.clone()
    } else if let Ok(caixa) = conteudo.clone().downcast::<gtk::Container>() {
        let filhos = caixa.children();
        let wv = filhos
            .iter()
            .find(|c| c.type_().name() == "WebKitWebView")
            .cloned()
            .ok_or_else(|| {
                format!(
                    "não achei o WebKitWebView dentro de {} (filhos: {})",
                    conteudo.type_().name(),
                    filhos.iter().map(|c| c.type_().name().to_string()).collect::<Vec<_>>().join(", ")
                )
            })?;
        // Se a caixa tiver mais alguém (menu GTK?), desistir é mais seguro que
        // descartar um widget que não conhecemos: cai no mpv em janela própria.
        if filhos.len() != 1 {
            return Err(format!(
                "a caixa do Tauri tem {} filhos além do webview — estrutura desconhecida",
                filhos.len() - 1
            ));
        }
        caixa.remove(&wv);
        wv
    } else {
        return Err(format!("filho da janela é {} — estrutura desconhecida", conteudo.type_().name()));
    };

    let area = gtk::GLArea::new();
    area.set_hexpand(true);
    area.set_vexpand(true);
    area.set_has_alpha(false);
    // Nós é que pedimos o redesenho, quando o mpv avisa que há frame novo.
    area.set_auto_render(false);

    let overlay = gtk::Overlay::new();
    gtk_window.remove(&conteudo);
    // WebView é o FUNDO (filho principal): a interface inteira, sempre visível.
    overlay.add(&webview);
    // GLArea é o TOPO, ancorado no canto e dimensionado pelo stage_rect que o
    // front reporta. Nasce escondido: até o primeiro retângulo chegar, um
    // overlay com tamanho padrão cobriria a janela inteira.
    area.set_halign(gtk::Align::Start);
    area.set_valign(gtk::Align::Start);
    overlay.add_overlay(&area);
    // Cliques ATRAVESSAM o vídeo e chegam na interface embaixo — é o que deixa
    // o clique-no-vídeo do front (pausar, etc.) continuar funcionando.
    overlay.set_overlay_pass_through(&area, true);
    gtk_window.add(&overlay);
    overlay.show_all();
    area.hide();


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
    // Sufixo `.embed`: o caminho SEM sufixo pertence ao mpv em processo
    // separado. Se o usuário escolher "janela separada" nas configurações, os
    // dois modos coexistem — e no mesmo caminho o spawn faria `remove_file` no
    // socket desta instância, matando o modo embutido até o app reiniciar.
    let ipc = format!("{}.embed", crate::mpv::ipc_path(std::process::id()));
    let _ = std::fs::remove_file(&ipc);

    let mpv = Mpv::criar(&[
        ("vo", "libmpv"),
        ("osc", "no"),
        ("input-default-bindings", "no"),
        ("input-vo-keyboard", "no"),
        ("input-ipc-server", ipc.as_str()),
    ])
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
            match RenderContext::criar(video.mpv, sym) {
                Ok(ctx) => {
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
                let n = RENDERS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                match ctx.render(fbo_atual(), w, h, true) {
                    // Uma linha no primeiro frame: e o sinal positivo de que a
                    // cadeia inteira fechou (ausencia de erro nao prova nada).
                    Ok(()) if n == 0 => eprintln!("[gl_video] primeiro frame ok ({w}x{h})"),
                    Ok(()) => {}
                    Err(e) if n < 3 => eprintln!("[gl_video] render FALHOU: {e}"),
                    Err(_) => {}
                }
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

/// Espelho atômico do "o vídeo na janela subiu?".
///
/// Existe porque comando Tauri roda em THREAD DE WORKER, e `VIDEO` é
/// thread_local da principal: lido da thread do comando ele está sempre vazio.
/// Foi um bug real — `mpv_start` perguntava `ativo()`, recebia `false`, e
/// abria o mpv em janela separada mesmo com o embutido de pé.
static ATIVO: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static RENDERS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub fn guardar(v: Rc<GlVideo>) {
    VIDEO.with(|c| *c.borrow_mut() = Some(v));
    ATIVO.store(true, std::sync::atomic::Ordering::SeqCst);
}

fn com_video<R>(f: impl FnOnce(&GlVideo) -> R) -> Option<R> {
    VIDEO.with(|c| c.borrow().as_ref().map(|v| f(v)))
}

/// O vídeo na janela subiu? Consultado pelo `mpv_start` para decidir se precisa
/// lançar um processo mpv ou se já há um dentro do app. Lê o atômico — NUNCA o
/// thread_local, que da thread de um comando está sempre vazio.
pub fn ativo() -> bool {
    ATIVO.load(std::sync::atomic::Ordering::SeqCst)
}

/// O vídeo na janela está disponível? O front usa isto pra decidir entre este
/// caminho e o do mpv em janela própria — em vez de adivinhar pelo sistema.
#[tauri::command]
pub fn gl_disponivel() -> bool {
    ativo()
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
