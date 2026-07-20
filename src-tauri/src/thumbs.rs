//! Miniaturas da timeline: quando um vídeo abre, uma thread gera ~50 thumbs
//! uniformes de 160px usando o PRÓPRIO mpv em modo headless. Variante validada
//! na build embarcada (mpv v0.41, 2026-07-19): `--vo=image --frames=1` produz
//! `00000001.jpg` no outdir e sai com código 0 (~0,7s por frame no teste).
//!
//! Cache em app_data/thumbs/<hash(caminho+mtime+tamanho)>/NNN.jpg — arquivo
//! editado/regravado muda o mtime e ganha pasta nova; a antiga vira lixo frio.
//! A pasta é liberada no escopo do protocolo `asset:` (SÓ ela — padrão
//! allow_thumbs_dir do LocalVideo, nada de $APPDATA/** no conf estático), e o
//! front pendura as `<img>` via convertFileSrc.
//!
//! Cancelamento: cada `thumbs_start` incrementa a geração; a thread confere a
//! geração entre um frame e outro e desiste se o arquivo trocou. E cada mpv
//! headless roda com TIMEOUT — a falha campeã de sonda/subprocesso é travar
//! calado, não errar (lição da suíte).

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{Emitter, Manager, State};

/// Quantidade de miniaturas por vídeo (uniformes, no meio de cada fatia).
pub const THUMB_COUNT: usize = 50;
/// Um frame que demore mais que isto está travado, não lento: mata e segue.
const THUMB_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Default)]
pub struct ThumbsState {
    /// Geração corrente. Thread com geração antiga = arquivo trocou = cancela.
    gen: AtomicU64,
}

/// Evento `thumbs-ready` (um por miniatura pronta; o front usa a mais próxima).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThumbReady {
    /// Caminho do VÍDEO de origem (o front descarta eventos de arquivo antigo).
    path: String,
    index: usize,
    /// Caminho do .jpg no cache (vira URL `asset:` via convertFileSrc).
    file: String,
    count: usize,
}

/// A pasta-raiz das miniaturas (cache NOSSO, dentro do app_data).
fn thumbs_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?
        .join("thumbs"))
}

/// Libera SÓ a pasta de miniaturas no escopo do protocolo de asset (padrão
/// allow_thumbs_dir do LocalVideo). Chamado uma vez, na subida do app.
/// Criar antes de liberar: o `allow_directory` canonicaliza o que existe, e uma
/// pasta que ainda não nasceu entraria pela forma não canônica — justamente a
/// que o `is_allowed` não compara no Windows.
pub fn allow_thumbs_dir(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = thumbs_root(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("criar pasta de thumbs: {}", e))?;
    app.asset_protocol_scope()
        .allow_directory(&dir, true)
        .map_err(|e| format!("liberar pasta de thumbs: {}", e))
}

/// Chave do cache: hash estável de caminho+mtime+tamanho (DefaultHasher::new()
/// tem chaves fixas — determinístico entre execuções). Vira NOME DE PASTA, por
/// isso hex puro: nada do caminho do usuário (com `..`, `:` etc.) vaza pro fs.
pub fn cache_key(path: &str, mtime_secs: u64, len: u64) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut h);
    mtime_secs.hash(&mut h);
    len.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// Ordem de geração "espalhada" (0, meio, quartos, …): com poucas thumbs prontas
/// o tooltip já cobre a barra inteira com vizinhas razoáveis, em vez de só o
/// comecinho do vídeo. Cobre todos os índices exatamente uma vez.
pub fn spread_order(n: usize) -> Vec<usize> {
    let mut seen = vec![false; n];
    let mut out = Vec::with_capacity(n);
    let mut step = n.max(1);
    while step > 0 {
        let mut i = 0;
        while i < n {
            if !seen[i] {
                seen[i] = true;
                out.push(i);
            }
            i += step;
        }
        step /= 2;
    }
    out
}

/// Instante (ms) da miniatura `i` de `count`: meio de cada fatia, nunca as
/// bordas (borda pega tela preta e créditos).
pub fn thumb_time_ms(duration_ms: u64, i: usize, count: usize) -> u64 {
    duration_ms * (2 * i as u64 + 1) / (2 * count as u64)
}

/// Dispara (em thread) a geração das miniaturas do arquivo. Retorna a pasta do
/// cache. Se já houver thumbs no cache, os eventos saem imediatamente.
#[tauri::command(async)]
pub fn thumbs_start(
    app: tauri::AppHandle,
    state: State<'_, ThumbsState>,
    path: String,
    duration_ms: u64,
    override_path: String,
) -> Result<String, String> {
    if duration_ms == 0 {
        return Err("duração desconhecida".into());
    }
    let mpv = crate::mpv::resolve_mpv(&app, &override_path)?;
    let meta = std::fs::metadata(&path).map_err(|e| format!("ler arquivo: {}", e))?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dir = thumbs_root(&app)?.join(cache_key(&path, mtime, meta.len()));
    std::fs::create_dir_all(&dir).map_err(|e| format!("criar cache: {}", e))?;
    // Etiqueta a pasta com o vídeo que a gerou. Do nome dela (hex do hash) não
    // dá pra voltar ao caminho, então sem isto o painel de armazenamento não
    // teria como distinguir cache útil de lixo — e chutar ali é apagar cache
    // bom. Best-effort de propósito: falhar aqui não pode impedir o vídeo de
    // tocar; a pasta só nasce "sem etiqueta", que é o balde conservador.
    crate::storage::write_label(
        &dir,
        &crate::storage::Label {
            path: path.clone(),
            name: Path::new(&path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            mtime,
            size: meta.len(),
        },
    );

    let my_gen = state.gen.fetch_add(1, Ordering::SeqCst) + 1;
    let dir_s = dir.to_string_lossy().to_string();
    let app2 = app.clone();
    std::thread::spawn(move || {
        let state = app2.state::<ThumbsState>();
        // Cada mpv escreve `00000001.jpg` num tmp próprio; renomeia pro nome
        // final só quando o frame saiu inteiro — nunca fica NNN.jpg meio-escrito.
        let tmp = dir.join(format!(".tmp-{}", my_gen));
        for i in spread_order(THUMB_COUNT) {
            if state.gen.load(Ordering::SeqCst) != my_gen {
                break; // arquivo trocou (ou cancelaram): desiste
            }
            let out = dir.join(format!("{:03}.jpg", i));
            if !out.exists() {
                let _ = std::fs::create_dir_all(&tmp);
                let t_ms = thumb_time_ms(duration_ms, i, THUMB_COUNT);
                let ok = run_mpv_thumb(&mpv, &path, t_ms, &tmp);
                let produced = tmp.join("00000001.jpg");
                if !(ok && produced.exists() && std::fs::rename(&produced, &out).is_ok()) {
                    continue; // frame falhou: buraco na régua é melhor que régua nenhuma
                }
            }
            let _ = app2.emit(
                "thumbs-ready",
                ThumbReady {
                    path: path.clone(),
                    index: i,
                    file: out.to_string_lossy().to_string(),
                    count: THUMB_COUNT,
                },
            );
        }
        let _ = std::fs::remove_dir_all(&tmp);
    });
    Ok(dir_s)
}

/// Cancela a geração em andamento (troca de arquivo pra áudio, volta pra home…).
#[tauri::command(async)]
pub fn thumbs_cancel(state: State<'_, ThumbsState>) {
    state.gen.fetch_add(1, Ordering::SeqCst);
}

/// Um frame: mpv headless `--vo=image` (variante testada; ver doc do módulo).
/// true = saiu com sucesso dentro do prazo.
fn run_mpv_thumb(mpv: &Path, path: &str, t_ms: u64, outdir: &Path) -> bool {
    let mut cmd = Command::new(mpv);
    cmd.args([
        "--no-config",
        "--msg-level=all=no",
        &format!("--start={}.{:03}", t_ms / 1000, t_ms % 1000),
        "--frames=1",
        "--vo=image",
        &format!("--vo-image-outdir={}", outdir.to_string_lossy()),
        "--vo-image-format=jpg",
        "--ytdl=no",
        "--audio=no",
        "--vf=scale=160:-2",
        path,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    crate::mpv::no_window(&mut cmd);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => return false,
    };
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(st)) => return st.success(),
            Ok(None) => {
                if start.elapsed() > THUMB_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return false;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(_) => return false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_deterministica_e_sensivel() {
        let a = cache_key("C:/v/a.mp4", 100, 5000);
        assert_eq!(a, cache_key("C:/v/a.mp4", 100, 5000));
        assert_ne!(a, cache_key("C:/v/a.mp4", 101, 5000)); // mtime mudou
        assert_ne!(a, cache_key("C:/v/b.mp4", 100, 5000)); // caminho mudou
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()) && a.len() == 16);
    }

    #[test]
    fn spread_order_cobre_tudo_uma_vez_e_espalha() {
        let o = spread_order(50);
        let mut sorted = o.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..50).collect::<Vec<_>>());
        assert_eq!(o[0], 0);
        // Os 4 primeiros já cobrem começo/meio (não são 0,1,2,3 sequenciais).
        assert!(o[1] >= 16, "espalhamento: segundo índice foi {}", o[1]);
    }

    #[test]
    fn thumb_time_no_meio_da_fatia() {
        // 100s, 50 thumbs: fatia 0 = [0,2s) → meio 1s; última = meio 99s.
        assert_eq!(thumb_time_ms(100_000, 0, 50), 1_000);
        assert_eq!(thumb_time_ms(100_000, 49, 50), 99_000);
        assert_eq!(thumb_time_ms(0, 10, 50), 0);
    }
}
