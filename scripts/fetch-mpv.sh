#!/usr/bin/env bash
# No Linux, o LocalPlayer v0.1 usa o mpv DO SISTEMA (Plano B: janela própria do
# mpv controlada por IPC). Não embutimos binário no AppImage nesta versão —
# empacotar o mpv + libs estático é ruído que fica pra uma versão futura.
#
# Este script só garante que o mpv está instalado no ambiente (dev/CI) e é
# no-op amigável caso não esteja: o app detecta a ausência em runtime e mostra
# uma mensagem honesta pedindo `apt install mpv`.
# Uso: bash scripts/fetch-mpv.sh
set -euo pipefail

if command -v mpv >/dev/null 2>&1; then
  echo "mpv do sistema encontrado: $(command -v mpv) ($(mpv --version 2>/dev/null | head -1))"
  exit 0
fi

echo "mpv não está no PATH."
echo "No Linux o LocalPlayer usa o mpv do sistema — instale com: sudo apt-get install -y mpv"
# Não falha o build: o binário do app não depende do mpv em tempo de compilação.
exit 0
