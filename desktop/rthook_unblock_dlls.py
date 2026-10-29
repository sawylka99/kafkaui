"""PyInstaller runtime hook: clear Mark-of-the-Web before pythonnet loads.

Downloaded/extracted ZIPs get Zone.Identifier ADS; .NET then refuses to load
Python.Runtime.dll (Failed to resolve Python.Runtime.Loader.Initialize).
"""

from __future__ import annotations

import os
import sys


def _unblock_bundle() -> None:
    if sys.platform != "win32":
        return

    bundle_dir = getattr(sys, "_MEIPASS", None)
    if not bundle_dir:
        bundle_dir = os.path.dirname(sys.executable)

    try:
        import ctypes
        from ctypes import wintypes

        delete_file = ctypes.windll.kernel32.DeleteFileW
        delete_file.argtypes = [wintypes.LPCWSTR]
        delete_file.restype = wintypes.BOOL

        def remove_ads(path: str) -> None:
            delete_file(path + ":Zone.Identifier")

    except Exception:

        def remove_ads(path: str) -> None:
            try:
                os.remove(path + ":Zone.Identifier")
            except OSError:
                pass

    for dirpath, _dirs, filenames in os.walk(bundle_dir):
        for name in filenames:
            lower = name.lower()
            if not lower.endswith((".dll", ".exe", ".pyd")):
                continue
            remove_ads(os.path.join(dirpath, name))


_unblock_bundle()
