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

use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
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
}

impl Default for MpvState {
    fn default() -> Self {
        Self {
            proc: Mutex::new(None),
            child_hwnd: AtomicIsize::new(0),
            embed_active: AtomicBool::new(false),
        }
    }
}

struct Proc {
    child: Child,
    writer: Box<dyn Write + Send>,
    /// Caminho do socket UNIX pra limpar no fim (vazio no Windows — named pipe some sozinho).
    sock_path: String,
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
fn resolve_mpv(app: &tauri::AppHandle, override_path: &str) -> Result<PathBuf, String> {
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
        "--no-osc".into(),
        "--no-osd-bar".into(),
        "--osd-level=0".into(),
        "--keep-open=yes".into(),
        // Nós tratamos o teclado no HTML; o mpv não deve capturar nada.
        "--input-default-bindings=no".into(),
        "--input-vo-keyboard=no".into(),
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
        // Embed: mpv desenha dentro da nossa child window.
        a.push(format!("--wid={}", wid));
    } else {
        // Janela própria (Plano B): título e sem "ontop".
        a.push("--title=LocalPlayer — ${?media-title:${filename}}".into());
        a.push("--force-window=yes".into());
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

fn no_window(cmd: &mut Command) {
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
    // app_data seria melhor, mas /tmp evita caminho longo demais pro socket UNIX.
    format!("/tmp/localplayer-mpv-{}.sock", pid)
}

#[cfg(windows)]
fn connect_ipc(pipe: &str) -> std::io::Result<(Box<dyn Read + Send>, Box<dyn Write + Send>)> {
    use std::fs::OpenOptions;
    let mut last: Option<std::io::Error> = None;
    for _ in 0..100 {
        match OpenOptions::new().read(true).write(true).open(pipe) {
            Ok(f) => {
                let r = f.try_clone()?;
                return Ok((Box::new(r), Box::new(f)));
            }
            Err(e) => {
                last = Some(e);
                std::thread::sleep(Duration::from_millis(60));
            }
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::other("named pipe do mpv não abriu")))
}

#[cfg(not(windows))]
fn connect_ipc(path: &str) -> std::io::Result<(Box<dyn Read + Send>, Box<dyn Write + Send>)> {
    use std::os::unix::net::UnixStream;
    let mut last: Option<std::io::Error> = None;
    for _ in 0..100 {
        match UnixStream::connect(path) {
            Ok(s) => {
                let r = s.try_clone()?;
                return Ok((Box::new(r), Box::new(s)));
            }
            Err(e) => {
                last = Some(e);
                std::thread::sleep(Duration::from_millis(60));
            }
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::other("socket do mpv não abriu")))
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
                // Linux: confirmar que roda de verdade.
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
/// `separate_window` força o Plano B mesmo no Windows (toggle nas Configurações).
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
    // Socket UNIX antigo pode ter ficado pra trás — limpa antes.
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

    let (reader, writer) = match connect_ipc(&ipc) {
        Ok(rw) => rw,
        Err(e) => {
            // Não conectou: mata o mpv pra não ficar órfão.
            let mut c = child;
            let _ = c.kill();
            return Err(format!("mpv subiu mas a IPC não respondeu: {}", e));
        }
    };

    // Thread leitora: cada linha JSON do mpv vira um evento Tauri `mpv-event`.
    let app_ev = app.clone();
    std::thread::spawn(move || {
        let buf = BufReader::new(reader);
        for line in buf.lines().map_while(Result::ok) {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                let _ = app_ev.emit("mpv-event", v);
            }
        }
        // Pipe fechou = mpv saiu.
        let _ = app_ev.emit("mpv-exit", ());
    });

    state.embed_active.store(embedded, Ordering::SeqCst);
    *state.proc.lock().map_err(|_| "estado corrompido")? = Some(Proc {
        child,
        writer,
        sock_path: if cfg!(windows) { String::new() } else { ipc },
    });

    Ok(StartResult { embedded })
}

/// Envia um comando cru pro mpv: `args` é o array de `{"command": args}`.
/// Ex.: `["loadfile", "/x.mp4", "replace"]`, `["set_property","pause",true]`,
/// `["observe_property", 1, "time-pos"]`.
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
        .write_all(line.as_bytes())
        .map_err(|e| format!("falha ao falar com o mpv: {}", e))?;
    proc.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Move/redimensiona (ou esconde) a área de vídeo embutida. Pixels FÍSICOS,
/// relativos ao cliente da janela. No-op quando não há embed ativo.
#[tauri::command(async)]
pub fn stage_rect(
    app: tauri::AppHandle,
    state: State<'_, MpvState>,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    visible: bool,
) {
    if !state.embed_active.load(Ordering::SeqCst) {
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
            let quit = serde_json::json!({ "command": ["quit"] }).to_string();
            let _ = proc.writer.write_all(quit.as_bytes());
            let _ = proc.writer.write_all(b"\n");
            let _ = proc.writer.flush();
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
