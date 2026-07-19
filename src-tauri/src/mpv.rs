//! Motor do LocalPlayer: o mpv roda como PROCESSO SEPARADO e é controlado pelo
//! JSON IPC oficial dele (`--input-ipc-server`). Escolha idêntica à do LocalMedia
//! (ffmpeg CLI) e do LocalScribe (whisper-cli): zero build nativo no CI, crash do
//! mpv não derruba o app, e o código do app segue MIT (o binário GPL do mpv é só
//! um processo ao lado).
//!
//! No Windows o vídeo é EMBUTIDO numa child window (embed.rs, `--wid`); a UI/HTML
//! fica ao redor. No Linux (v0.1) o mpv abre em janela PRÓPRIA (Plano B) e o app
//! é um controle remoto bonito — mesma IPC, mesmos comandos.
//!
//! O Rust é um "cano burro": manda `{"command":[...]}` e repassa cada linha de
//! evento do mpv pro front (evento Tauri `mpv-event`). Quem observa propriedades
//! e interpreta os eventos é o TypeScript (src/lib/mpvEvents.ts).
//!
//! Gotcha do Windows (pago em 2026-07-14): NÃO dá pra ter uma thread leitora
//! bloqueada num ReadFile e escrever no MESMO named pipe por um handle clonado —
//! I/O síncrono no mesmo file object serializa e a escrita fica presa atrás da
//! leitura bloqueada (deadlock: mpv só manda dados depois que a gente pede, mas
//! pedir é escrever, que está bloqueado). Por isso no Windows usamos um handle
//! único com leitura NÃO-bloqueante (PeekNamedPipe antes do ReadFile), tudo sob
//! um Mutex. No Unix o socket full-duplex não tem esse problema.

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{Emitter, Manager, State};

#[cfg(windows)]
use crate::embed;

/// Estado global do mpv gerenciado pelo Tauri.
pub struct MpvState {
    proc: Mutex<Option<Proc>>,
    /// HWND (isize) da child window de vídeo no Windows; 0 = não criada.
    child_hwnd: AtomicIsize,
    /// Embed ativo (Windows + modo embutido). Governa se `stage_rect` age.
    embed_active: AtomicBool,
    /// Sequência da última `stage_rect` aplicada. Os comandos do Tauri são
    /// `async` (thread pool) e podem chegar FORA DE ORDEM — um "esconde" antigo
    /// aterrissando depois do "mostra" deixava o vídeo invisível (lição paga na
    /// v0.1.2). Chamadas com seq menor são descartadas.
    stage_seq: AtomicU64,
}

impl Default for MpvState {
    fn default() -> Self {
        Self {
            proc: Mutex::new(None),
            child_hwnd: AtomicIsize::new(0),
            embed_active: AtomicBool::new(false),
            stage_seq: AtomicU64::new(0),
        }
    }
}

struct Proc {
    child: Child,
    writer: Box<dyn IpcWriter>,
    /// Caminho do socket UNIX pra limpar no fim (vazio no Windows — named pipe some sozinho).
    sock_path: String,
}

/// Abstração de escrita na IPC do mpv (uma linha JSON por comando).
trait IpcWriter: Send {
    fn send(&mut self, line: &str) -> std::io::Result<()>;
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartResult {
    /// true = vídeo embutido na janela do app (Windows). false = janela própria do mpv.
    pub embedded: bool,
}

const MPV_BIN_WIN: &str = "mpv.exe";

/// Resolve o executável do mpv. Override do usuário tem prioridade (Linux/config).
/// Windows: binário embarcado (binaries/mpv/mpv.exe). Linux: `mpv` do PATH.
/// `pub(crate)`: o thumbs.rs usa o MESMO binário em modo headless pras miniaturas.
pub(crate) fn resolve_mpv(app: &tauri::AppHandle, override_path: &str) -> Result<PathBuf, String> {
    let over = override_path.trim();
    if !over.is_empty() {
        let p = PathBuf::from(over);
        if p.exists() {
            return Ok(p);
        }
        return Err(format!("mpv informado não existe: {}", over));
    }

    if cfg!(windows) {
        let rel = format!("binaries/mpv/{}", MPV_BIN_WIN);
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join(&rel));
        }
        if let Ok(res) = app.path().resource_dir() {
            candidates.push(res.join(&rel));
            candidates.push(res.join(format!("mpv/{}", MPV_BIN_WIN)));
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                candidates.push(dir.join(&rel));
                candidates.push(dir.join(format!("mpv/{}", MPV_BIN_WIN)));
            }
        }
        for c in candidates {
            if c.exists() {
                return Ok(c);
            }
        }
        Err("mpv.exe não encontrado (runtime ausente)".into())
    } else {
        // Linux/macOS: mpv do sistema.
        Ok(PathBuf::from("mpv"))
    }
}

/// Configuração pura pra montar os argumentos do mpv (unit-testável).
pub struct MpvArgs {
    pub ipc: String,
    pub volume: f64,
    pub speed: f64,
    pub remember: bool,
    pub watch_dir: String,
    pub wid: Option<isize>,
}

/// Monta a linha de comando do mpv. Mantido puro e testado — a lógica de flags
/// não deveria mudar de comportamento sem um teste quebrando.
pub fn build_args(cfg: &MpvArgs) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--idle=yes".into(),
        "--force-window=yes".into(),
        "--keep-open=yes".into(),
        // Voz inteligível em velocidade alterada.
        "--af=scaletempo2".into(),
        "--hwdec=auto-safe".into(),
        // Silencioso: não lemos o stdout do mpv (só a IPC).
        "--msg-level=all=no".into(),
        format!("--input-ipc-server={}", cfg.ipc),
        format!("--volume={}", clamp_vol(cfg.volume)),
        format!("--speed={}", clamp_speed(cfg.speed)),
    ];

    if cfg.remember && !cfg.watch_dir.is_empty() {
        a.push(format!("--watch-later-directory={}", cfg.watch_dir));
        a.push("--save-position-on-quit=yes".into());
        a.push("--resume-playback=yes".into());
    } else {
        a.push("--save-position-on-quit=no".into());
        a.push("--resume-playback=no".into());
    }

    if let Some(wid) = cfg.wid {
        // Embed (experimental): mpv desenha dentro da nossa child window; a UI é
        // 100% nossa — o mpv não deve desenhar OSC nem capturar teclado.
        a.push(format!("--wid={}", wid));
        a.push("--no-osc".into());
        a.push("--no-osd-bar".into());
        a.push("--osd-level=0".into());
        a.push("--input-default-bindings=no".into());
        a.push("--input-vo-keyboard=no".into());
    } else {
        // Janela própria do mpv (padrão): a janela do vídeo é um player completo
        // por si (OSC + atalhos nativos do mpv LIGADOS) e o app soma playlist/
        // legendas/velocidade — o estado sincroniza pelos observe_property.
        a.push("--title=LocalPlayer — ${?media-title:${filename}}".into());
    }
    a
}

fn clamp_vol(v: f64) -> f64 {
    v.clamp(0.0, 130.0)
}
fn clamp_speed(s: f64) -> f64 {
    if s.is_finite() {
        s.clamp(0.25, 4.0)
    } else {
        1.0
    }
}

pub(crate) fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: sem console. Não afeta a janela de vídeo (child HWND).
        cmd.creation_flags(0x0800_0000);
    }
    let _ = cmd;
}

#[cfg(windows)]
fn ipc_path(pid: u32) -> String {
    format!(r"\\.\pipe\localplayer-mpv-{}", pid)
}
#[cfg(not(windows))]
fn ipc_path(pid: u32) -> String {
    format!("/tmp/localplayer-mpv-{}.sock", pid)
}

// ===================== IPC: Windows (named pipe) =====================
#[cfg(windows)]
mod winpipe {
    use std::io;
    use std::ptr;
    use std::sync::{Arc, Mutex};

    use winapi::shared::minwindef::DWORD;
    use winapi::um::fileapi::{CreateFileW, ReadFile, WriteFile, OPEN_EXISTING};
    use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
    use winapi::um::namedpipeapi::PeekNamedPipe;
    use winapi::um::winnt::{GENERIC_READ, GENERIC_WRITE, HANDLE};

    pub struct WinPipe {
        h: HANDLE,
    }
    // O HANDLE é dono do recurso; só é usado sob o Mutex de fora.
    unsafe impl Send for WinPipe {}

    impl Drop for WinPipe {
        fn drop(&mut self) {
            unsafe {
                if !self.h.is_null() && self.h != INVALID_HANDLE_VALUE {
                    CloseHandle(self.h);
                }
            }
        }
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Abre o named pipe do mpv como cliente (handle síncrono).
    pub fn open(name: &str) -> io::Result<Arc<Mutex<WinPipe>>> {
        let w = wide(name);
        let h = unsafe {
            CreateFileW(
                w.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                0,
                ptr::null_mut(),
                OPEN_EXISTING,
                0,
                ptr::null_mut(),
            )
        };
        if h == INVALID_HANDLE_VALUE || h.is_null() {
            return Err(io::Error::last_os_error());
        }
        Ok(Arc::new(Mutex::new(WinPipe { h })))
    }

    pub fn write_all(p: &WinPipe, data: &[u8]) -> io::Result<()> {
        let mut off = 0usize;
        while off < data.len() {
            let mut written: DWORD = 0;
            let ok = unsafe {
                WriteFile(
                    p.h,
                    data[off..].as_ptr() as *const _,
                    (data.len() - off) as DWORD,
                    &mut written,
                    ptr::null_mut(),
                )
            };
            if ok == 0 {
                return Err(io::Error::last_os_error());
            }
            off += written as usize;
        }
        Ok(())
    }

    /// Lê o que estiver disponível (0 se nada). NUNCA bloqueia — é isso que evita
    /// o deadlock de serialização de I/O síncrono no mesmo file object.
    pub fn read_available(p: &WinPipe, buf: &mut [u8]) -> io::Result<usize> {
        let mut avail: DWORD = 0;
        let ok = unsafe {
            PeekNamedPipe(p.h, ptr::null_mut(), 0, ptr::null_mut(), &mut avail, ptr::null_mut())
        };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        if avail == 0 {
            return Ok(0);
        }
        let to_read = (avail as usize).min(buf.len());
        let mut read: DWORD = 0;
        let ok = unsafe {
            ReadFile(p.h, buf.as_mut_ptr() as *mut _, to_read as DWORD, &mut read, ptr::null_mut())
        };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(read as usize)
    }
}

#[cfg(windows)]
type WinPipeRef = std::sync::Arc<std::sync::Mutex<winpipe::WinPipe>>;

#[cfg(windows)]
fn win_connect(pipe: &str) -> std::io::Result<WinPipeRef> {
    let mut last: Option<std::io::Error> = None;
    for _ in 0..100 {
        match winpipe::open(pipe) {
            Ok(p) => return Ok(p),
            Err(e) => {
                last = Some(e);
                std::thread::sleep(Duration::from_millis(60));
            }
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::other("named pipe do mpv não abriu")))
}

#[cfg(windows)]
struct WinWriter {
    pipe: WinPipeRef,
}
#[cfg(windows)]
impl IpcWriter for WinWriter {
    fn send(&mut self, line: &str) -> std::io::Result<()> {
        let guard = self.pipe.lock().map_err(|_| std::io::Error::other("ipc lock"))?;
        winpipe::write_all(&guard, line.as_bytes())
    }
}

#[cfg(windows)]
fn win_reader_loop(pipe: WinPipeRef, app: tauri::AppHandle) {
    let mut acc: Vec<u8> = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = {
            let guard = match pipe.lock() {
                Ok(g) => g,
                Err(_) => break,
            };
            match winpipe::read_available(&guard, &mut buf) {
                Ok(n) => n,
                Err(_) => break, // pipe quebrou = mpv saiu
            }
        };
        if n == 0 {
            std::thread::sleep(Duration::from_millis(15));
            continue;
        }
        acc.extend_from_slice(&buf[..n]);
        while let Some(pos) = acc.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = acc.drain(..=pos).collect();
            let s = String::from_utf8_lossy(&line[..line.len() - 1]);
            let s = s.trim();
            if !s.is_empty() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(s) {
                    let _ = app.emit("mpv-event", v);
                }
            }
        }
    }
    let _ = app.emit("mpv-exit", ());
}

// ===================== IPC: Unix (socket) =====================
#[cfg(not(windows))]
struct UnixWriter(std::os::unix::net::UnixStream);
#[cfg(not(windows))]
impl IpcWriter for UnixWriter {
    fn send(&mut self, line: &str) -> std::io::Result<()> {
        use std::io::Write;
        self.0.write_all(line.as_bytes())?;
        self.0.flush()
    }
}

#[cfg(not(windows))]
fn unix_connect(path: &str) -> std::io::Result<std::os::unix::net::UnixStream> {
    use std::os::unix::net::UnixStream;
    let mut last: Option<std::io::Error> = None;
    for _ in 0..100 {
        match UnixStream::connect(path) {
            Ok(s) => return Ok(s),
            Err(e) => {
                last = Some(e);
                std::thread::sleep(Duration::from_millis(60));
            }
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::other("socket do mpv não abriu")))
}

#[cfg(not(windows))]
fn unix_reader_loop(stream: std::os::unix::net::UnixStream, app: tauri::AppHandle) {
    use std::io::{BufRead, BufReader};
    let buf = BufReader::new(stream);
    for line in buf.lines().map_while(Result::ok) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            let _ = app.emit("mpv-event", v);
        }
    }
    let _ = app.emit("mpv-exit", ());
}

/// Cria (uma vez) a child window de vídeo no Windows e guarda o HWND no estado.
#[cfg(windows)]
fn ensure_child(app: &tauri::AppHandle, state: &MpvState) -> Option<isize> {
    let existing = state.child_hwnd.load(Ordering::SeqCst);
    if existing != 0 {
        return Some(existing);
    }
    let win = app.get_webview_window("main")?;
    let parent_isize = win.hwnd().ok()?.0 as isize;
    let (tx, rx) = std::sync::mpsc::channel::<isize>();
    let _ = app.run_on_main_thread(move || {
        let r = unsafe { embed::create_child(parent_isize) };
        let _ = tx.send(r.unwrap_or(0));
    });
    let child = rx.recv_timeout(Duration::from_secs(3)).ok()?;
    if child == 0 {
        return None;
    }
    state.child_hwnd.store(child, Ordering::SeqCst);
    Some(child)
}

/// O runtime do mpv está disponível?
#[tauri::command(async)]
pub fn mpv_available(app: tauri::AppHandle, override_path: String) -> bool {
    match resolve_mpv(&app, &override_path) {
        Ok(p) => {
            if cfg!(windows) {
                p.exists()
            } else {
                Command::new(&p)
                    .arg("--version")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .map(|s| s.success())
                    .unwrap_or(false)
            }
        }
        Err(_) => false,
    }
}

/// Sobe o mpv ocioso (se ainda não estiver) e conecta a IPC.
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub fn mpv_start(
    app: tauri::AppHandle,
    state: State<'_, MpvState>,
    volume: f64,
    speed: f64,
    remember: bool,
    separate_window: bool,
    override_path: String,
) -> Result<StartResult, String> {
    // Já rodando? Só confirma o modo atual.
    {
        let guard = state.proc.lock().map_err(|_| "estado corrompido")?;
        if guard.is_some() {
            return Ok(StartResult {
                embedded: state.embed_active.load(Ordering::SeqCst),
            });
        }
    }

    let bin = resolve_mpv(&app, &override_path)?;

    // Embed só no Windows e só se o usuário não pediu janela separada.
    let mut wid: Option<isize> = None;
    #[cfg(windows)]
    {
        if !separate_window {
            wid = ensure_child(&app, &state);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = separate_window;
    }
    let embedded = wid.is_some();

    // Modo "janela separada" no Windows com uma child de embed já criada de antes:
    // esconde a child pra não sobrar um quadro congelado sobre a UI.
    #[cfg(windows)]
    {
        if !embedded {
            let child = state.child_hwnd.load(Ordering::SeqCst);
            if child != 0 {
                let _ = app.run_on_main_thread(move || unsafe {
                    embed::set_rect(child, 0, 0, 0, 0, false);
                });
            }
        }
    }

    let watch_dir = app
        .path()
        .app_data_dir()
        .map(|d| d.join("watch_later"))
        .ok()
        .map(|d| {
            let _ = std::fs::create_dir_all(&d);
            d.to_string_lossy().to_string()
        })
        .unwrap_or_default();

    let ipc = ipc_path(std::process::id());
    #[cfg(not(windows))]
    {
        let _ = std::fs::remove_file(&ipc);
    }

    let args = build_args(&MpvArgs {
        ipc: ipc.clone(),
        volume,
        speed,
        remember,
        watch_dir,
        wid,
    });

    let mut cmd = Command::new(&bin);
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    no_window(&mut cmd);

    let child = cmd
        .spawn()
        .map_err(|e| format!("não consegui iniciar o mpv: {}", e))?;

    // Conecta a IPC e sobe a thread leitora (repassa eventos pro front).
    let writer: Box<dyn IpcWriter>;
    #[cfg(windows)]
    {
        match win_connect(&ipc) {
            Ok(pipe) => {
                let rp = pipe.clone();
                let app_ev = app.clone();
                std::thread::spawn(move || win_reader_loop(rp, app_ev));
                writer = Box::new(WinWriter { pipe });
            }
            Err(e) => {
                let mut c = child;
                let _ = c.kill();
                return Err(format!("mpv subiu mas a IPC não respondeu: {}", e));
            }
        }
    }
    #[cfg(not(windows))]
    {
        match unix_connect(&ipc) {
            Ok(stream) => {
                let wr = match stream.try_clone() {
                    Ok(w) => w,
                    Err(e) => {
                        let mut c = child;
                        let _ = c.kill();
                        return Err(format!("clonar socket do mpv: {}", e));
                    }
                };
                let app_ev = app.clone();
                std::thread::spawn(move || unix_reader_loop(stream, app_ev));
                writer = Box::new(UnixWriter(wr));
            }
            Err(e) => {
                let mut c = child;
                let _ = c.kill();
                return Err(format!("mpv subiu mas a IPC não respondeu: {}", e));
            }
        }
    }

    state.embed_active.store(embedded, Ordering::SeqCst);
    *state.proc.lock().map_err(|_| "estado corrompido")? = Some(Proc {
        child,
        writer,
        sock_path: if cfg!(windows) { String::new() } else { ipc },
    });

    Ok(StartResult { embedded })
}

/// Envia um comando cru pro mpv: `args` é o array de `{"command": args}`.
#[tauri::command(async)]
pub fn mpv_command(
    state: State<'_, MpvState>,
    args: Vec<serde_json::Value>,
) -> Result<(), String> {
    let mut guard = state.proc.lock().map_err(|_| "estado corrompido")?;
    let proc = guard.as_mut().ok_or("mpv não está rodando")?;
    let payload = serde_json::json!({ "command": args });
    let mut line = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    line.push('\n');
    proc.writer
        .send(&line)
        .map_err(|e| format!("falha ao falar com o mpv: {}", e))?;
    Ok(())
}

/// Move/redimensiona (ou esconde) a área de vídeo embutida. Pixels FÍSICOS,
/// relativos ao cliente da janela. No-op quando não há embed ativo.
/// `seq` cresce monotonicamente no front; chamadas atrasadas (seq velho) são
/// ignoradas — ver o comentário em `MpvState::stage_seq`.
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub fn stage_rect(
    app: tauri::AppHandle,
    state: State<'_, MpvState>,
    seq: u64,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    visible: bool,
) {
    if !state.embed_active.load(Ordering::SeqCst) {
        return;
    }
    // fetch_max devolve o valor ANTERIOR: se ele já era >= seq, esta chamada é velha.
    if state.stage_seq.fetch_max(seq, Ordering::SeqCst) >= seq {
        return;
    }
    #[cfg(windows)]
    {
        let child = state.child_hwnd.load(Ordering::SeqCst);
        if child != 0 {
            let _ = app.run_on_main_thread(move || unsafe {
                embed::set_rect(child, x, y, w, h, visible);
            });
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (&app, x, y, w, h, visible);
    }
}

/// Encerra o mpv (quit limpo + kill de garantia) e destrói a child window.
pub fn stop(state: &MpvState) {
    if let Ok(mut guard) = state.proc.lock() {
        if let Some(mut proc) = guard.take() {
            let _ = proc.writer.send("{\"command\":[\"quit\"]}\n");
            std::thread::sleep(Duration::from_millis(80));
            let _ = proc.child.kill();
            let _ = proc.child.wait();
            if !proc.sock_path.is_empty() {
                let _ = std::fs::remove_file(&proc.sock_path);
            }
        }
    }
    state.embed_active.store(false, Ordering::SeqCst);
}

/// Comando pro front pedir o encerramento (troca de modo embed/separado exige
/// reiniciar o mpv com outros args).
#[tauri::command(async)]
pub fn mpv_stop(state: State<'_, MpvState>) {
    stop(&state);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args_embed_tem_wid_e_ipc() {
        let a = build_args(&MpvArgs {
            ipc: r"\\.\pipe\x".into(),
            volume: 80.0,
            speed: 1.0,
            remember: true,
            watch_dir: "C:/w".into(),
            wid: Some(12345),
        });
        assert!(a.iter().any(|s| s == "--wid=12345"));
        assert!(a.iter().any(|s| s == r"--input-ipc-server=\\.\pipe\x"));
        assert!(a.iter().any(|s| s == "--watch-later-directory=C:/w"));
        assert!(a.iter().any(|s| s == "--save-position-on-quit=yes"));
        assert!(a.iter().any(|s| s.starts_with("--volume=80")));
        // No embed a UI é nossa: OSC e teclado do mpv desligados.
        assert!(a.iter().any(|s| s == "--no-osc"));
        assert!(a.iter().any(|s| s == "--input-default-bindings=no"));
    }

    #[test]
    fn args_janela_propria_sem_wid_com_titulo() {
        let a = build_args(&MpvArgs {
            ipc: "/tmp/x.sock".into(),
            volume: 50.0,
            speed: 1.5,
            remember: false,
            watch_dir: String::new(),
            wid: None,
        });
        assert!(!a.iter().any(|s| s.starts_with("--wid=")));
        assert!(a.iter().any(|s| s.contains("--title=")));
        assert!(a.iter().any(|s| s == "--save-position-on-quit=no"));
        assert!(a.iter().any(|s| s.starts_with("--speed=1.5")));
        // Janela própria é um player completo: OSC/atalhos nativos LIGADOS.
        assert!(!a.iter().any(|s| s == "--no-osc"));
        assert!(!a.iter().any(|s| s == "--input-default-bindings=no"));
    }

    #[test]
    fn clamps() {
        assert_eq!(clamp_vol(999.0), 130.0);
        assert_eq!(clamp_vol(-5.0), 0.0);
        assert_eq!(clamp_speed(f64::NAN), 1.0);
        assert_eq!(clamp_speed(10.0), 4.0);
        assert_eq!(clamp_speed(0.1), 0.25);
    }
}
