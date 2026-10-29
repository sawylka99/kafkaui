from fastapi import APIRouter, HTTPException

from app import kafka_manager
from app.kafka_manager import ConnectionNotFoundError, KafkaConnectionError
from app.models import (
    BrokerInfo,
    ConnectionConfig,
    ConnectionResponse,
    TestConnectionResponse,
)

router = APIRouter(prefix="/api/connections", tags=["connections"])


@router.post("/test", response_model=TestConnectionResponse)
def test_connection(config: ConnectionConfig) -> TestConnectionResponse:
    try:
        kafka_manager.test_connection(config)
        return TestConnectionResponse(ok=True, message="Connection successful")
    except KafkaConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("", response_model=ConnectionResponse)
def create_connection(config: ConnectionConfig) -> ConnectionResponse:
    try:
        connection_id = kafka_manager.create_connection(config)
        return ConnectionResponse(
            connection_id=connection_id,
            bootstrap_servers=config.bootstrap_servers,
        )
    except KafkaConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{connection_id}/brokers", response_model=list[BrokerInfo])
def get_brokers(connection_id: str) -> list[BrokerInfo]:
    try:
        return kafka_manager.list_brokers(connection_id)
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KafkaConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/{connection_id}")
def delete_connection(connection_id: str) -> dict:
    try:
        kafka_manager.delete_connection(connection_id)
        return {"ok": True}
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
