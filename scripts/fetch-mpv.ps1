# Baixa o mpv (Windows x64) e instala mpv.exe em src-tauri/binaries/mpv.
# Fonte: releases do zhongfly/mpv-winbuild (builds oficiais empacotados do mpv,
# ffmpeg estático embutido). Build GPL de propósito — mais codecs, e copyleft
# não é problema na suíte (decisão 2026-07-13); o mpv roda como processo separado.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/fetch-mpv.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$mpvDir = Join-Path $root "src-tauri\binaries\mpv"
New-Item -ItemType Directory -Force -Path $mpvDir | Out-Null

if (Test-Path (Join-Path $mpvDir "mpv.exe")) {
    Write-Host "mpv já existe em $mpvDir"
    exit 0
}

# Descobre o asset x86_64 mais recente do zhongfly/mpv-winbuild via API do GitHub.
# (os nomes têm data/commit; por isso não dá pra fixar uma URL "latest" estável).
$headers = @{ "User-Agent" = "LocalPlayer-fetch-mpv" }
if ($env:GITHUB_TOKEN) { $headers["Authorization"] = "Bearer $env:GITHUB_TOKEN" }
$rel = Invoke-RestMethod -Headers $headers `
    -Uri "https://api.github.com/repos/zhongfly/mpv-winbuild/releases/latest"

$asset = $rel.assets |
    Where-Object { $_.name -match "mpv-x86_64-.*\.7z$" -and $_.name -notmatch "dev" } |
    Select-Object -First 1
if (-not $asset) {
    $asset = $rel.assets | Where-Object { $_.name -match "mpv-x86_64-.*\.(7z|zip)$" } | Select-Object -First 1
}
if (-not $asset) { throw "nenhum asset mpv-x86_64 encontrado na release" }

$url = $asset.browser_download_url
Write-Host "Baixando $($asset.name) ..."
$pkg = Join-Path $env:TEMP $asset.name
Invoke-WebRequest -Headers $headers -Uri $url -OutFile $pkg

$extract = Join-Path $env:TEMP "mpv-extract"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
New-Item -ItemType Directory -Force -Path $extract | Out-Null

# 7-Zip é padrão nos runners do GitHub (7z no PATH). Fallback: Expand-Archive p/ .zip.
if ($asset.name -match "\.7z$") {
    & 7z x "-o$extract" $pkg | Out-Null
} else {
    Expand-Archive -Path $pkg -DestinationPath $extract -Force
}
Remove-Item $pkg -Force

$hit = Get-ChildItem -Path $extract -Recurse -Filter "mpv.exe" | Select-Object -First 1
if (-not $hit) { throw "mpv.exe não encontrado dentro do pacote" }
Copy-Item $hit.FullName -Destination (Join-Path $mpvDir "mpv.exe") -Force

# O mpv precisa das dlls que vierem ao lado (alguns builds são estáticos, outros não).
Get-ChildItem -Path $hit.Directory -Filter "*.dll" -ErrorAction SilentlyContinue |
    ForEach-Object { Copy-Item $_.FullName -Destination $mpvDir -Force }

Remove-Item $extract -Recurse -Force
Write-Host "Instalado em $mpvDir"
