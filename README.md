# LocalPlayer

Player de vídeo e áudio minimalista, **100% offline**, movido pelo [mpv](https://mpv.io).
Parte da suíte **Local** (Tauri 2 + React 19 + TypeScript). A filosofia é não
reescrever pipeline de vídeo: usar o melhor motor pronto que existe e fazer só a
casca leve por cima.

## O que faz

- Toca praticamente tudo (o mpv/ffmpeg cuida dos codecs).
- **Playlist da pasta** em ordem natural (`ep2` antes de `ep10`), com aleatório e repetir (tudo/uma/off).
- **Legendas** embutidas e externas (`.srt`/`.ass`/`.vtt`), seletor de faixa e "carregar arquivo".
- **Faixas de áudio** e **capítulos** (marcados na barra e navegáveis).
- **Velocidade** de 0.25× a 4× com voz inteligível (`scaletempo2`).
- **Loop A-B**, print da tela, e **lembra a posição** de cada vídeo (watch-later do mpv).
- Tema claro/escuro/sistema, modo imersivo, tela cheia.
- Atalhos no estilo mpv (Espaço, setas, `J`/`L`, `[`/`]`, `F`, `M`, `N`/`P`, `S`, `R`, `0`–`9`…).

## Como o vídeo aparece na janela

- **Windows:** o vídeo é **embutido** na janela do app (uma child window nativa
  recebe o output do mpv via `--wid`) e os controles são desenhados em HTML ao
  redor. Dá pra trocar para **janela separada** nas Configurações.
- **Linux:** o app usa o **mpv do sistema** (`sudo apt install mpv`) e o controla
  numa janela própria (o app vira um controle remoto). Embutir no Linux (X11) é
  uma melhoria futura.

Em ambos os casos o controle é feito pelo **JSON IPC** oficial do mpv — o app
manda comandos e observa propriedades; o mpv roda como processo separado (se ele
cair, o app não cai).

## Rodar em desenvolvimento

```bash
npm install
# baixa o mpv pro runtime embarcado (Windows):
powershell -ExecutionPolicy Bypass -File scripts/fetch-mpv.ps1
npm run tauri dev
```

No Linux, garanta que o `mpv` está no PATH (`sudo apt install mpv`).

## Testes

```bash
npm test                 # vitest (lógica pura: tempo, ordenação, atalhos, eventos)
cd src-tauri && cargo test   # Rust (montagem de args do mpv, clamps)
```

## Build / Release

`git tag vX.Y.Z && git push --tags` dispara o GitHub Actions, que builda
**Windows (NSIS)** + **Linux (AppImage)** e publica a release sozinho. O mpv é
baixado no workflow (Windows) — nada de binário versionado no repo.

## Licença

Código sob **MIT**. O binário do mpv (build GPL) é embutido no instalador do
Windows como processo separado. No Linux usa o mpv do sistema.

Como o instalador do Windows **redistribui** o mpv, ele leva junto o texto da
licença dele e a oferta de código-fonte, em `src-tauri/third-party/`
(`LEIAME.txt`, `LICENSE-mpv-GPL-2.0.txt`, `COPYRIGHT-mpv.txt` e
`LICENSE-ffmpeg-GPL-3.0.txt` — o FFmpeg entra estático dentro do `mpv.exe`).
Os textos são **versionados** aqui porque o pacote `.7z` do upstream não traz
arquivo de licença nenhum; extrair do download deixaria o instalador conforme
só quando o upstream lembrasse de incluí-lo.
