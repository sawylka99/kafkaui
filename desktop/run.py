"""Launch Kafka UI as a desktop window (uvicorn + pywebview)."""

from __future__ import annotations

import multiprocessing
import os
import socket
import sys
import threading
import time
import traceback
import webbrowser
from pathlib import Path

# Allow `python desktop/run.py` from repo root or from desktop/.
_DESKTOP = Path(__file__).resolve().parent
if str(_DESKTOP) not in sys.path:
    sys.path.insert(0, str(_DESKTOP))


def _log_dir() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "KafkaUI"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _log(message: str) -> None:
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}\n"
    try:
        with (_log_dir() / "kafkaui.log").open("a", encoding="utf-8") as fh:
            fh.write(line)
    except OSError:
        pass


def _show_error(message: str) -> None:
    _log(f"ERROR: {message}")
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, message, "Kafka UI", 0x10)
    except Exception:
        print(message, file=sys.stderr)


def _show_info(message: str) -> None:
    _log(f"INFO: {message}")
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, message, "Kafka UI", 0x40)
    except Exception:
        print(message)


def _ensure_stdio() -> None:
    """Windowed PyInstaller sets stdout/stderr to None; uvicorn crashes on isatty()."""
    log_path = _log_dir() / "kafkaui.log"
    if sys.stdout is None:
        sys.stdout = log_path.open("a", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = log_path.open("a", encoding="utf-8")


# Fixed port so browser/WebView localStorage survives restarts.
_PREFERRED_PORT = 18765


def _pick_port(preferred: int = _PREFERRED_PORT, attempts: int = 20) -> int:
    """Prefer a stable localhost port; fall back to the next free ones."""
    for port in range(preferred, preferred + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_ready(url: str, timeout: float = 20.0) -> None:
    import urllib.error
    import urllib.request

    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
            time.sleep(0.1)
    raise RuntimeError(f"Server did not become ready at {url}: {last_error}")


def _bring_to_front() -> None:
    """Best-effort: focus the Kafka UI window on Windows."""
    try:
        import ctypes

        user32 = ctypes.windll.user32
        hwnd = user32.FindWindowW(None, "Kafka UI")
        if hwnd:
            user32.ShowWindow(hwnd, 9)  # SW_RESTORE
            user32.SetForegroundWindow(hwnd)
    except Exception as exc:  # noqa: BLE001
        _log(f"bring_to_front skipped: {exc}")


def _unblock_downloaded_files(root: Path) -> None:
    """Clear Windows Mark-of-the-Web on files from zip/email (blocks native DLLs)."""
    if os.name != "nt" or not root.is_dir():
        return
    try:
        import ctypes
        from ctypes import wintypes

        delete_file = ctypes.windll.kernel32.DeleteFileW
        delete_file.argtypes = [wintypes.LPCWSTR]
        delete_file.restype = wintypes.BOOL
        cleared = 0
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            zone = str(path) + ":Zone.Identifier"
            if delete_file(zone):
                cleared += 1
        if cleared:
            _log(f"cleared Mark-of-the-Web from {cleared} files under {root}")
    except Exception as exc:  # noqa: BLE001
        _log(f"unblock skipped: {exc}")


def _open_in_browser(base: str) -> None:
    """Fallback UI when embedded WebView/pythonnet cannot start."""
    _log(f"opening browser fallback: {base}")
    webbrowser.open(base)
    _show_info(
        "Встроенное окно не запустилось (часто из-за WebView2/pythonnet).\n\n"
        f"Kafka UI открыт в браузере:\n{base}\n\n"
        "Нажмите OK, когда закончите работу — сервер остановится."
    )


def _start_webview(base: str) -> None:
    import webview

    storage = _log_dir() / "webview-storage"
    storage.mkdir(parents=True, exist_ok=True)

    window = webview.create_window(
        "Kafka UI",
        url=base,
        width=1280,
        height=800,
        min_size=(900, 600),
        focus=True,
    )

    def _on_shown() -> None:
        _bring_to_front()

    try:
        window.events.shown += _on_shown
    except Exception:
        pass

    # private_mode=True (default) wipes localStorage every launch.
    webview.start(private_mode=False, storage_path=str(storage))


def _friendly_startup_error(exc: BaseException) -> str:
    text = str(exc)
    hints: list[str] = []
    lower = text.lower()
    if "python.runtime" in lower or "pythonnet" in lower or "webview" in lower:
        hints.append(
            "1) ПКМ по папке kafka / KafkaUI.exe -> Свойства -> Разблокировать (если есть),\n"
            "   либо в PowerShell:\n"
            "   Get-ChildItem -Recurse | Unblock-File"
        )
        hints.append(
            "2) Установите WebView2 Runtime:\n"
            "https://developer.microsoft.com/microsoft-edge/webview2/"
        )
        hints.append(
            "3) Установите VC++ Redistributable x64:\n"
            "https://aka.ms/vs/17/release/vc_redist.x64.exe"
        )
        hints.append("4) Убедитесь, что рядом с .exe есть папка _internal целиком.")
    if hints:
        return f"Failed to start Kafka UI:\n\n{text}\n\n" + "\n\n".join(hints)
    return (
        f"Failed to start Kafka UI:\n\n{text}\n\n"
        f"Details: {_log_dir() / 'kafkaui.log'}"
    )


def main() -> None:
    _ensure_stdio()

    if getattr(sys, "frozen", False):
        _unblock_downloaded_files(Path(sys.executable).resolve().parent)

    # Keep WebView2 profile on an ASCII path.
    os.environ.setdefault("WEBVIEW2_USER_DATA_FOLDER", str(_log_dir() / "webview2"))

    _log(f"starting frozen={getattr(sys, 'frozen', False)} exe={sys.executable}")
    from server import create_app

    app = create_app()
    _log("app created")
    port = _pick_port()
    host = "127.0.0.1"
    base = f"http://{host}:{port}"
    _log(f"listening on {base}")

    def run_server() -> None:
        import uvicorn

        try:
            # Avoid uvicorn's ColourizedFormatter (needs stdout.isatty).
            uvicorn.run(
                app,
                host=host,
                port=port,
                log_level="warning",
                log_config=None,
            )
        except Exception:
            _log("uvicorn crashed:\n" + traceback.format_exc())

    thread = threading.Thread(target=run_server, name="uvicorn", daemon=True)
    thread.start()
    _wait_ready(f"{base}/api/health")
    _log("health ok, opening window")

    try:
        _start_webview(base)
        _log("window closed")
    except Exception:
        _log("webview failed, falling back to browser:\n" + traceback.format_exc())
        _open_in_browser(base)


if __name__ == "__main__":
    # Required for frozen Windows apps that may touch multiprocessing.
    multiprocessing.freeze_support()
    _ensure_stdio()
    try:
        main()
    except FileNotFoundError as exc:
        _show_error(str(exc))
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001 — top-level launcher
        _show_error(_friendly_startup_error(exc))
        sys.exit(1)
