# Build Kafka UI desktop app (Windows).
# Usage (from repo root or desktop/):
#   powershell -ExecutionPolicy Bypass -File desktop/build.ps1

$ErrorActionPreference = "Stop"

$DesktopDir = $PSScriptRoot
$RootDir = Split-Path -Parent $DesktopDir
$FrontendDir = Join-Path $RootDir "frontend"
$UiDir = Join-Path $DesktopDir "ui"

Write-Host "==> Building frontend..." -ForegroundColor Cyan
Push-Location $FrontendDir
try {
    if (-not (Test-Path "node_modules")) {
        npm install
    }
    npm run build
} finally {
    Pop-Location
}

$DistDir = Join-Path $FrontendDir "dist"
if (-not (Test-Path (Join-Path $DistDir "index.html"))) {
    throw "Frontend build missing: $DistDir\index.html"
}

Write-Host "==> Copying UI to desktop/ui..." -ForegroundColor Cyan
if (Test-Path $UiDir) {
    Remove-Item -Recurse -Force $UiDir
}
Copy-Item -Recurse -Force $DistDir $UiDir

Write-Host "==> Ensuring Python deps..." -ForegroundColor Cyan
python -m pip install -r (Join-Path $DesktopDir "requirements.txt")

Write-Host "==> Running PyInstaller..." -ForegroundColor Cyan
Push-Location $DesktopDir
try {
    python -m PyInstaller --noconfirm --clean KafkaUI.spec
} finally {
    Pop-Location
}

$Exe = Join-Path $DesktopDir "dist\KafkaUI\KafkaUI.exe"
if (-not (Test-Path $Exe)) {
    throw "Build failed: $Exe not found"
}

Write-Host ""
Write-Host "Done. Launch:" -ForegroundColor Green
Write-Host "  $Exe"
Write-Host ""
Write-Host "Kafka is not bundled - connect to an existing broker (e.g. localhost:9092)."
