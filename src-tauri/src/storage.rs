//! Painel "Dados e armazenamento": mede o cache de miniaturas e oferece
//! limpezas que dizem exatamente o que apagam.
//!
//! Regra central: o que este app guarda de VALIOSO é a **posição de retomada**
//! (`resume.json`) — onde você parou em cada vídeo. Isso não se recupera de
//! lugar nenhum, e nenhuma limpeza desta tela encosta nele. As miniaturas, ao
//! contrário, são cache puro: apagou, o app regera na próxima vez que o vídeo
//! abrir. Por isso aqui existe um "limpar tudo" que no LocalScribe e no
//! TaylorChat seria impensável.
//!
//! ## O problema do caminho, na versão do LocalPlayer
//!
//! A chave do cache é `hash(caminho + mtime + tamanho)` e vira NOME DE PASTA
//! (hex puro). Do nome não dá pra voltar ao caminho — então, sem ajuda, o app
//! não sabe a que vídeo uma pasta pertence e QUALQUER varredura seria chute.
//! Por isso cada pasta ganha uma etiqueta `source.json` com caminho, nome,
//! mtime e tamanho do vídeo de origem.
//!
//! Com a etiqueta, as categorias se separam por quanto dá pra PROVAR:
//!
//! - **obsoleta** — o vídeo está lá, no mesmo caminho, mas com outro
//!   mtime/tamanho: foi reeditado ou regravado, e estas miniaturas são de uma
//!   versão que não existe mais. Isso é prova, não palpite: risco zero.
//! - **sumida** — o caminho não responde. Pode ser arquivo apagado… ou a
//!   biblioteca inteira que mudou de pasta/de letra de unidade. O app **não
//!   tem como distinguir**, então o botão diz isso em vez de fingir precisão.
//! - **sem etiqueta** — pasta criada por uma versão anterior a esta, sem
//!   `source.json`. Não classificamos o que não dá pra ler: ela NUNCA entra em
//!   "obsoleta" nem em "sumida", e só sai pelo "limpar tudo". Sem essa regra, a
//!   primeira execução depois da atualização chamaria o cache inteiro de
//!   "sumido" — a mesma armadilha do caminho obsoleto que mordeu o LocalScribe,
//!   só que vestida de migração.

use std::path::{Path, PathBuf};

use tauri::Manager;

/// Nome da etiqueta que amarra uma pasta de cache ao vídeo que a gerou.
pub const LABEL: &str = "source.json";

/// Resultado de qualquer limpeza — em arquivos E bytes.
#[derive(serde::Serialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Freed {
    pub files: u64,
    pub bytes: u64,
}

/// Etiqueta de uma pasta de cache. O `name` existe porque o caminho envelhece e
/// o nome do arquivo não: ele é o que a UI mostra quando lista o que vai sair.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct Label {
    pub path: String,
    pub name: String,
    pub mtime: u64,
    pub size: u64,
}

/// Em que estado está uma pasta de cache. A ordem importa: cada pasta cai em
/// exatamente um balde, e o painel soma balde por balde.
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Kind {
    /// O vídeo está lá e bate com a etiqueta — cache útil.
    Live,
    /// O vídeo está lá mas mudou: miniaturas de uma versão que não existe mais.
    Stale,
    /// O caminho não responde (apagado OU biblioteca movida — indistinguível).
    Missing,
    /// Sem `source.json`: versão antiga do app. Não dá pra classificar.
    Unlabeled,
}

/// Soma recursiva (bytes, arquivos) de uma árvore.
pub fn tree_stats(dir: &Path) -> (u64, u64) {
    let mut bytes = 0u64;
    let mut files = 0u64;
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let (b, f) = tree_stats(&path);
                bytes += b;
                files += f;
            } else if let Ok(meta) = entry.metadata() {
                bytes += meta.len();
                files += 1;
            }
        }
    }
    (bytes, files)
}

/// Apaga a árvore e devolve o que ela pesava (medido ANTES, porque depois não
/// dá pra perguntar).
fn remove_tree(dir: &Path) -> Freed {
    let (bytes, files) = tree_stats(dir);
    if std::fs::remove_dir_all(dir).is_ok() {
        Freed { files, bytes }
    } else {
        Freed::default()
    }
}

fn remove_trees(dirs: &[PathBuf]) -> Freed {
    let mut total = Freed::default();
    for d in dirs {
        let f = remove_tree(d);
        total.files += f.files;
        total.bytes += f.bytes;
    }
    total
}

/// Lê a etiqueta de uma pasta de cache (None = sem etiqueta ou ilegível).
pub fn read_label(dir: &Path) -> Option<Label> {
    let raw = std::fs::read_to_string(dir.join(LABEL)).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Grava a etiqueta. Chamado pelo `thumbs_start` ao abrir/criar a pasta —
/// best-effort: falhar aqui não pode impedir o vídeo de tocar, só faz a pasta
/// nascer "sem etiqueta" (o balde conservador).
pub fn write_label(dir: &Path, label: &Label) {
    if let Ok(json) = serde_json::to_string(label) {
        let _ = std::fs::write(dir.join(LABEL), json);
    }
}

/// Estado atual do arquivo de origem: `None` se não existe no caminho.
fn source_state(path: &str) -> Option<(u64, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Some((mtime, meta.len()))
}

/// Classifica uma pasta de cache. `probe` responde "o arquivo deste caminho
/// existe? com que mtime/tamanho?" — parametrizado pra o teste poder montar o
/// mundo sem tocar em disco de verdade.
pub fn classify_with(label: Option<&Label>, probe: impl Fn(&str) -> Option<(u64, u64)>) -> Kind {
    let Some(l) = label else {
        return Kind::Unlabeled;
    };
    match probe(&l.path) {
        None => Kind::Missing,
        Some((mtime, size)) if mtime == l.mtime && size == l.size => Kind::Live,
        Some(_) => Kind::Stale,
    }
}

pub fn classify(label: Option<&Label>) -> Kind {
    classify_with(label, source_state)
}

/// Pastas de cache (1º nível de `thumbs/`), já classificadas.
pub fn scan(root: &Path) -> Vec<(PathBuf, Kind)> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(root) {
        for entry in rd.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let label = read_label(&path);
                out.push((path, classify(label.as_ref())));
            }
        }
    }
    out
}

/// Sobras de geração interrompida: as pastas `.tmp-<gen>` que o
/// `thumbs.rs` só remove no fim do laço — o app fechado no meio as deixa pra
/// trás. São lixo provado (o frame de dentro nunca foi promovido a `NNN.jpg`),
/// e limpá-las nunca tira uma miniatura boa.
pub fn tmp_leftovers(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(root) {
        for entry in rd.flatten() {
            let cache_dir = entry.path();
            if !cache_dir.is_dir() {
                continue;
            }
            if let Ok(inner) = std::fs::read_dir(&cache_dir) {
                for e in inner.flatten() {
                    let p = e.path();
                    if p.is_dir()
                        && p.file_name()
                            .map(|n| n.to_string_lossy().starts_with(".tmp-"))
                            .unwrap_or(false)
                    {
                        out.push(p);
                    }
                }
            }
        }
    }
    out
}

fn dirs_of(root: &Path, want: Kind) -> Vec<PathBuf> {
    scan(root).into_iter().filter(|(_, k)| *k == want).map(|(p, _)| p).collect()
}

// ---------------------------------------------------------------------------
// comandos
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    dir: String,
    thumbs_bytes: u64,
    thumbs_files: u64,
    /// Quantas pastas de cache existem (uma por versão de vídeo).
    cached_videos: u64,
    live_count: u64,
    stale_bytes: u64,
    stale_count: u64,
    missing_bytes: u64,
    missing_count: u64,
    unlabeled_bytes: u64,
    unlabeled_count: u64,
    tmp_bytes: u64,
    tmp_count: u64,
    /// resume.json — onde você parou. Medido, nunca apagado por esta tela.
    resume_bytes: u64,
    resume_entries: u64,
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| format!("app_data_dir: {}", e))
}

fn thumbs_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("thumbs"))
}

/// Quantos vídeos têm posição salva (só pra o painel mostrar o que preserva).
fn resume_entries(path: &Path) -> u64 {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.as_object().map(|o| o.len() as u64))
        .unwrap_or(0)
}

#[tauri::command(async)]
pub fn storage_info(app: tauri::AppHandle) -> Result<StorageInfo, String> {
    let dir = data_dir(&app)?;
    let root = dir.join("thumbs");
    let resume = dir.join("resume.json");

    let (thumbs_bytes, thumbs_files) = tree_stats(&root);
    let entries = scan(&root);

    let acc = |want: Kind| -> (u64, u64) {
        let mut bytes = 0;
        let mut count = 0;
        for (p, _) in entries.iter().filter(|(_, k)| *k == want) {
            bytes += tree_stats(p).0;
            count += 1;
        }
        (bytes, count)
    };
    let (stale_bytes, stale_count) = acc(Kind::Stale);
    let (missing_bytes, missing_count) = acc(Kind::Missing);
    let (unlabeled_bytes, unlabeled_count) = acc(Kind::Unlabeled);
    let live_count = entries.iter().filter(|(_, k)| *k == Kind::Live).count() as u64;

    let tmps = tmp_leftovers(&root);

    Ok(StorageInfo {
        dir: dir.to_string_lossy().into_owned(),
        thumbs_bytes,
        thumbs_files,
        cached_videos: entries.len() as u64,
        live_count,
        stale_bytes,
        stale_count,
        missing_bytes,
        missing_count,
        unlabeled_bytes,
        unlabeled_count,
        tmp_bytes: tmps.iter().map(|p| tree_stats(p).0).sum(),
        tmp_count: tmps.len() as u64,
        resume_bytes: std::fs::metadata(&resume).map(|m| m.len()).unwrap_or(0),
        resume_entries: resume_entries(&resume),
    })
}

/// Miniaturas de versões antigas de vídeos que ainda existem. Risco zero.
#[tauri::command(async)]
pub fn storage_clear_stale(app: tauri::AppHandle) -> Result<Freed, String> {
    let root = thumbs_root(&app)?;
    Ok(remove_trees(&dirs_of(&root, Kind::Stale)))
}

/// Miniaturas cujo vídeo não está mais no caminho de origem.
#[tauri::command(async)]
pub fn storage_clear_missing(app: tauri::AppHandle) -> Result<Freed, String> {
    let root = thumbs_root(&app)?;
    Ok(remove_trees(&dirs_of(&root, Kind::Missing)))
}

/// Sobras de geração interrompida.
#[tauri::command(async)]
pub fn storage_clear_tmp(app: tauri::AppHandle) -> Result<Freed, String> {
    let root = thumbs_root(&app)?;
    Ok(remove_trees(&tmp_leftovers(&root)))
}

/// Todo o cache de miniaturas. A pasta-raiz é recriada: ela está liberada no
/// escopo do protocolo `asset:` desde a subida do app, e sumir com ela deixaria
/// o escopo apontando pra o nada até o próximo reinício.
#[tauri::command(async)]
pub fn storage_clear_all_thumbs(app: tauri::AppHandle) -> Result<Freed, String> {
    let root = thumbs_root(&app)?;
    let freed = remove_tree(&root);
    std::fs::create_dir_all(&root).map_err(|e| format!("recriar pasta de thumbs: {}", e))?;
    Ok(freed)
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static SEQ: AtomicU32 = AtomicU32::new(0);

    fn tmp(tag: &str) -> PathBuf {
        let n = SEQ.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("localplayer-storage-{tag}-{n}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn label(path: &str, mtime: u64, size: u64) -> Label {
        Label {
            path: path.into(),
            name: Path::new(path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            mtime,
            size,
        }
    }

    /// Cria uma pasta de cache com N miniaturas e (opcionalmente) etiqueta.
    fn cache(root: &Path, key: &str, thumbs: usize, l: Option<&Label>) -> PathBuf {
        let dir = root.join(key);
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..thumbs {
            std::fs::write(dir.join(format!("{i:03}.jpg")), vec![b'x'; 100]).unwrap();
        }
        if let Some(l) = l {
            write_label(&dir, l);
        }
        dir
    }

    /// "Mundo" de arquivos pro `classify_with`, montado à mão.
    fn world<'a>(items: &'a [(&'a str, u64, u64)]) -> impl Fn(&str) -> Option<(u64, u64)> + 'a {
        move |p: &str| items.iter().find(|(q, _, _)| *q == p).map(|(_, m, s)| (*m, *s))
    }

    #[test]
    fn video_intacto_fica_video_reeditado_vira_obsoleto() {
        let disco = world(&[("D:/v/a.mp4", 100, 5000)]);
        // Etiqueta bate com o disco: cache útil, ninguém encosta.
        assert_eq!(classify_with(Some(&label("D:/v/a.mp4", 100, 5000)), &disco), Kind::Live);
        // Mesmo caminho, mtime diferente = o vídeo foi regravado.
        assert_eq!(classify_with(Some(&label("D:/v/a.mp4", 99, 5000)), &disco), Kind::Stale);
        // Mesmo mtime, tamanho diferente também conta.
        assert_eq!(classify_with(Some(&label("D:/v/a.mp4", 100, 4000)), &disco), Kind::Stale);
        // Caminho que não responde.
        assert_eq!(classify_with(Some(&label("D:/v/b.mp4", 100, 5000)), &disco), Kind::Missing);
    }

    /// A armadilha da migração: pasta criada por uma versão anterior não tem
    /// etiqueta. Ela NÃO pode ser lida como "sumida" — senão a primeira
    /// execução depois da atualização ofereceria apagar o cache inteiro
    /// chamando-o de órfão.
    #[test]
    fn cache_de_versao_antiga_nao_vira_sumido() {
        let disco = world(&[]);
        assert_eq!(classify_with(None, &disco), Kind::Unlabeled);

        let root = tmp("migracao");
        cache(&root, "aaaa1111", 3, None); // versão antiga
        cache(&root, "bbbb2222", 3, Some(&label("D:/nao/existe.mp4", 1, 1)));

        let obsoletas = dirs_of(&root, Kind::Stale);
        let sumidas = dirs_of(&root, Kind::Missing);
        assert!(obsoletas.is_empty());
        assert_eq!(sumidas.len(), 1, "só a etiquetada pode ser classificada");
        assert!(sumidas[0].ends_with("bbbb2222"));

        // E o que FICOU é o que importa: a pasta sem etiqueta segue inteira.
        remove_trees(&sumidas);
        assert_eq!(tree_stats(&root.join("aaaa1111")), (300, 3));

        let _ = std::fs::remove_dir_all(&root);
    }

    /// Biblioteca movida de unidade: TODAS as etiquetas apontam pra caminhos
    /// que não respondem. Nada disso pode cair no balde "obsoleto" — o balde do
    /// botão de risco zero. Elas vão pro "sumido", que é o botão que AVISA que
    /// mover a biblioteca cai aqui.
    #[test]
    fn biblioteca_movida_nao_entra_no_balde_de_risco_zero() {
        let root = tmp("biblioteca-movida");
        cache(&root, "c1", 2, Some(&label("E:/Filmes/a.mkv", 10, 1000)));
        cache(&root, "c2", 2, Some(&label("E:/Filmes/b.mkv", 20, 2000)));
        cache(&root, "c3", 2, Some(&label("E:/Filmes/c.mkv", 30, 3000)));

        assert!(dirs_of(&root, Kind::Stale).is_empty(), "chamaria de obsoleto sem provar");
        assert_eq!(dirs_of(&root, Kind::Missing).len(), 3);

        // O botão de risco zero roda e não leva NADA: as 6 miniaturas (mais as 3
        // etiquetas) continuam lá, e as 3 pastas também.
        let antes = tree_stats(&root);
        assert_eq!(remove_trees(&dirs_of(&root, Kind::Stale)), Freed::default());
        assert_eq!(tree_stats(&root), antes);
        assert_eq!(antes.1, 9, "6 miniaturas + 3 etiquetas");
        assert_eq!(scan(&root).len(), 3);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn limpar_obsoletas_preserva_as_vivas() {
        let root = tmp("obsoletas");
        // Um arquivo de verdade, pra o classify ler o disco de verdade.
        let video = root.join("filme.mp4");
        std::fs::write(&video, vec![b'v'; 1234]).unwrap();
        let vp = video.to_string_lossy().to_string();
        let (mtime, size) = source_state(&vp).unwrap();

        let viva = cache(&root, "viva", 4, Some(&label(&vp, mtime, size)));
        let velha = cache(&root, "velha", 2, Some(&label(&vp, mtime - 1, size)));

        let alvo = dirs_of(&root, Kind::Stale);
        assert_eq!(alvo.len(), 1);
        let freed = remove_trees(&alvo);
        // 2 jpgs de 100 + a etiqueta.
        assert_eq!(freed.files, 3);
        assert!(!velha.exists());
        assert!(viva.exists() && tree_stats(&viva).1 == 5, "cache do vídeo atual foi mexido");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn sobras_de_geracao_interrompida_nao_levam_miniatura_boa() {
        let root = tmp("tmp");
        let dir = cache(&root, "abc", 3, None);
        let leftover = dir.join(".tmp-7");
        std::fs::create_dir_all(&leftover).unwrap();
        std::fs::write(leftover.join("00000001.jpg"), vec![b'x'; 900]).unwrap();

        let alvo = tmp_leftovers(&root);
        assert_eq!(alvo.len(), 1);
        assert_eq!(remove_trees(&alvo), Freed { files: 1, bytes: 900 });
        assert_eq!(tree_stats(&dir), (300, 3), "as miniaturas prontas sumiram junto");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn etiqueta_ilegivel_cai_no_balde_conservador() {
        let root = tmp("etiqueta-torta");
        let dir = cache(&root, "x", 1, None);
        std::fs::write(dir.join(LABEL), "{isto não é json").unwrap();
        assert!(read_label(&dir).is_none());
        assert_eq!(scan(&root)[0].1, Kind::Unlabeled, "etiqueta ilegível virou alvo de limpeza");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn etiqueta_sobrevive_a_ida_e_volta() {
        let root = tmp("roundtrip");
        let l = label("D:/v/Vídeo com acento & 'aspas'.mkv", 42, 99);
        let dir = cache(&root, "k", 0, Some(&l));
        assert_eq!(read_label(&dir).unwrap(), l);
        assert_eq!(read_label(&dir).unwrap().name, "Vídeo com acento & 'aspas'.mkv");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn resume_conta_entradas_e_aguenta_lixo() {
        let root = tmp("resume");
        let p = root.join("resume.json");
        std::fs::write(&p, r#"{"D:/a.mp4":{"posMs":1,"durMs":2,"ts":3},"D:/b.mp4":{}}"#).unwrap();
        assert_eq!(resume_entries(&p), 2);
        std::fs::write(&p, "não é json").unwrap();
        assert_eq!(resume_entries(&p), 0);
        assert_eq!(resume_entries(&root.join("nao-existe.json")), 0);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn pastas_inexistentes_nao_sao_erro() {
        let nada = std::env::temp_dir().join("localplayer-nao-existe-mesmo");
        assert_eq!(tree_stats(&nada), (0, 0));
        assert!(scan(&nada).is_empty());
        assert!(tmp_leftovers(&nada).is_empty());
        assert_eq!(remove_trees(&[]), Freed::default());
    }

    #[test]
    fn limpezas_sao_idempotentes() {
        let root = tmp("idempotente");
        cache(&root, "c1", 2, Some(&label("D:/sumiu.mkv", 1, 1)));
        let primeira = remove_trees(&dirs_of(&root, Kind::Missing));
        assert_eq!(primeira.files, 3); // 2 jpg + etiqueta
        assert_eq!(remove_trees(&dirs_of(&root, Kind::Missing)), Freed::default());
        let _ = std::fs::remove_dir_all(&root);
    }
}
