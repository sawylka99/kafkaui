"""Persist UI preferences on disk (survives WebView private/temp storage)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from threading import Lock

from app.models import ConnectionConfig, Preferences

_lock = Lock()
_MAX_RECENT = 12


def _preferences_path() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "KafkaUI"
    base.mkdir(parents=True, exist_ok=True)
    return base / "preferences.json"


def _default() -> Preferences:
    return Preferences(
        recent_servers=[],
        last_config=ConnectionConfig(bootstrap_servers="localhost:9092"),
    )


def load_preferences() -> Preferences:
    path = _preferences_path()
    if not path.is_file():
        return _default()
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        return Preferences.model_validate(data)
    except Exception:
        return _default()


def save_preferences(prefs: Preferences) -> Preferences:
    path = _preferences_path()
    with _lock:
        with path.open("w", encoding="utf-8") as fh:
            json.dump(prefs.model_dump(mode="json"), fh, ensure_ascii=False, indent=2)
    return prefs


def remember_connection(config: ConnectionConfig) -> Preferences:
    with _lock:
        prefs = load_preferences()
        address = config.bootstrap_servers.strip()
        recent = [address] if address else []
        for item in prefs.recent_servers:
            if item.strip() and item.strip().lower() != address.lower():
                recent.append(item.strip())
        prefs.recent_servers = recent[:_MAX_RECENT]
        prefs.last_config = config
        path = _preferences_path()
        with path.open("w", encoding="utf-8") as fh:
            json.dump(prefs.model_dump(mode="json"), fh, ensure_ascii=False, indent=2)
        return prefs


def remove_recent_server(address: str) -> Preferences:
    target = address.strip().lower()
    with _lock:
        prefs = load_preferences()
        prefs.recent_servers = [
            item for item in prefs.recent_servers if item.strip().lower() != target
        ]
        if prefs.last_config and prefs.last_config.bootstrap_servers.strip().lower() == target:
            prefs.last_config = ConnectionConfig(bootstrap_servers="localhost:9092")
        path = _preferences_path()
        with path.open("w", encoding="utf-8") as fh:
            json.dump(prefs.model_dump(mode="json"), fh, ensure_ascii=False, indent=2)
        return prefs


def clear_recent_servers() -> Preferences:
    with _lock:
        prefs = load_preferences()
        prefs.recent_servers = []
        path = _preferences_path()
        with path.open("w", encoding="utf-8") as fh:
            json.dump(prefs.model_dump(mode="json"), fh, ensure_ascii=False, indent=2)
        return prefs
