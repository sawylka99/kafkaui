from fastapi import APIRouter, HTTPException

from app import kafka_manager
from app.kafka_manager import ConnectionNotFoundError, KafkaConnectionError
from app.models import ProduceRequest, ProduceResponse

router = APIRouter(prefix="/api/connections", tags=["produce"])


@router.post("/{connection_id}/produce", response_model=ProduceResponse)
def produce_message(
    connection_id: str, request: ProduceRequest
) -> ProduceResponse:
    try:
        return kafka_manager.produce_message(connection_id, request)
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KafkaConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
