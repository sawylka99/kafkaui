from fastapi import APIRouter

from app import preferences as preferences_store
from app.models import ConnectionConfig, Preferences, RemoveRecentServerRequest

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


@router.get("", response_model=Preferences)
def get_preferences() -> Preferences:
    return preferences_store.load_preferences()


@router.put("", response_model=Preferences)
def put_preferences(body: Preferences) -> Preferences:
    return preferences_store.save_preferences(body)


@router.post("/remember", response_model=Preferences)
def remember_connection(config: ConnectionConfig) -> Preferences:
    return preferences_store.remember_connection(config)


@router.post("/recent/remove", response_model=Preferences)
def remove_recent_server(body: RemoveRecentServerRequest) -> Preferences:
    return preferences_store.remove_recent_server(body.bootstrap_servers)


@router.delete("/recent", response_model=Preferences)
def clear_recent_servers() -> Preferences:
    return preferences_store.clear_recent_servers()
