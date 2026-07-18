# Baixa o mpv (Windows x64) e instala mpv.exe em src-tauri/binaries/mpv.
# Fonte: releases do zhongfly/mpv-winbuild (builds oficiais empacotados do mpv,
# ffmpeg estático embutido). Build GPL de propósito — mais codecs, e copyleft
# não é problema na suíte (decisão 2026-07-13); o mpv roda como processo separado.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/fetch-mpv.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ---------------------------------------------------------------------------
# VERSÃO FIXA + SHA256 (2026-07-18)
#
# Antes consultava `releases/latest` da API e escolhia o asset por regex, com a
# justificativa de que "os nomes têm data/commit, então não dá pra fixar uma URL
# estável". Isso confundia URL ESTÁVEL com VERSÃO FIXA: o nome mudar a cada
# release é exatamente a razão pra registrar qual foi usada, não pra deixar
# solto. Fixando tag + nome do asset, a URL fica perfeitamente determinada.
#
# Não há contrapartida no Linux: lá o LocalPlayer usa o mpv DO SISTEMA e o
# fetch-mpv.sh não baixa nada (por isso não tem constante pra sincronizar).
#
# PRA ATUALIZAR: pegar a release em github.com/zhongfly/mpv-winbuild/releases,
# copiar tag e nome do asset (o SEM `-v3`: v3 exige CPU x86-64-v3, que corta
# máquinas mais antigas), baixar, `sha256sum`, trocar as constantes.
# ---------------------------------------------------------------------------
$mpvTag = "2026-07-17-94335ab87a"
$mpvAsset = "mpv-x86_64-20260717-git-94335ab87a.7z"
$mpvSha256 = "7cc6b4926627ef46e82ba7ee8b037bf7c9e3cdf9f1dd6d8b7798044b13be7eab"

$root = Split-Path -Parent $PSScriptRoot
$mpvDir = Join-Path $root "src-tauri\binaries\mpv"
New-Item -ItemType Directory -Force -Path $mpvDir | Out-Null

if (Test-Path (Join-Path $mpvDir "mpv.exe")) {
    Write-Host "mpv já existe em $mpvDir"
    exit 0
}

$url = "https://github.com/zhongfly/mpv-winbuild/releases/download/$mpvTag/$mpvAsset"
Write-Host "Baixando $url ..."
$pkg = Join-Path $env:TEMP $mpvAsset
Invoke-WebRequest -Uri $url -OutFile $pkg

# Confere ANTES de extrair: binário adulterado não chega a ser descompactado.
$got = (Get-FileHash -Path $pkg -Algorithm SHA256).Hash.ToLower()
if ($got -ne $mpvSha256) {
    Remove-Item $pkg -Force
    throw "SHA256 NAO BATE!`n  esperado: $mpvSha256`n  recebido: $got`nDownload corrompido ou adulterado. Nada foi instalado."
}
Write-Host "sha256 conferido: $got"

$extract = Join-Path $env:TEMP "mpv-extract"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
New-Item -ItemType Directory -Force -Path $extract | Out-Null

# 7-Zip é padrão nos runners do GitHub (7z no PATH).
& 7z x "-o$extract" $pkg | Out-Null
if ($LASTEXITCODE -ne 0) { throw "7z falhou ao extrair $mpvAsset" }
Remove-Item $pkg -Force

$hit = Get-ChildItem -Path $extract -Recurse -Filter "mpv.exe" | Select-Object -First 1
if (-not $hit) { throw "mpv.exe não encontrado dentro do pacote ($mpvTag)" }
Copy-Item $hit.FullName -Destination (Join-Path $mpvDir "mpv.exe") -Force

# O mpv precisa das dlls que vierem ao lado (alguns builds são estáticos, outros não).
Get-ChildItem -Path $hit.Directory -Filter "*.dll" -ErrorAction SilentlyContinue |
    ForEach-Object { Copy-Item $_.FullName -Destination $mpvDir -Force }

Remove-Item $extract -Recurse -Force
Write-Host "Instalado em $mpvDir ($mpvTag)"
