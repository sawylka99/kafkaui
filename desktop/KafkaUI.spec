# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for Kafka UI desktop (onedir)."""

from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_dynamic_libs

SPECDIR = Path(SPECPATH).resolve()
ROOT = SPECDIR.parent
UI_DIR = SPECDIR / "ui"
BACKEND_DIR = ROOT / "backend"

datas = []
binaries = []
hiddenimports = [
    "app",
    "app.main",
    "app.models",
    "app.kafka_manager",
    "app.routes",
    "app.routes.connections",
    "app.routes.topics",
    "app.routes.produce",
    "app.routes.preferences",
    "app.preferences",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
]

# confluent-kafka ships native librdkafka binaries
ck_datas, ck_binaries, ck_hidden = collect_all("confluent_kafka")
datas += ck_datas
binaries += ck_binaries
hiddenimports += ck_hidden
binaries += collect_dynamic_libs("confluent_kafka")

# Built React UI
if UI_DIR.is_dir():
    datas.append((str(UI_DIR), "ui"))

# Backend package sources (imported as `app`)
datas.append((str(BACKEND_DIR / "app"), "backend/app"))

a = Analysis(
    [str(SPECDIR / "run.py")],
    pathex=[str(BACKEND_DIR), str(SPECDIR)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[str(SPECDIR / "rthook_unblock_dlls.py")],
    # Windows uses Edge WebView2; skip optional Qt backends to keep the bundle small.
    excludes=["PyQt5", "PyQt6", "PySide2", "PySide6", "qtpy"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="KafkaUI",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="KafkaUI",
)
