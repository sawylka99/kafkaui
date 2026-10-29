from fastapi import APIRouter, HTTPException, Query

from app import kafka_manager
from app.kafka_manager import ConnectionNotFoundError, KafkaConnectionError
from app.models import (
    ConsumerGroupInfo,
    MessageInfo,
    MessageSearchHit,
    TopicDetail,
    TopicSummary,
)

router = APIRouter(prefix="/api/connections", tags=["topics"])


@router.get("/{connection_id}/topics", response_model=list[TopicSummary])
def get_topics(connection_id: str) -> list[TopicSummary]:
    try:
        return kafka_manager.list_topics(connection_id)
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KafkaConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{connection_id}/topics/{topic_name}", response_model=TopicDetail)
def get_topic(connection_id: str, topic_name: str) -> TopicDetail:
    try:
        return kafka_manager.get_topic(connection_id, topic_name)
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KafkaConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/{connection_id}/topics/{topic_name}/messages",
    response_model=list[MessageInfo],
)
def get_messages(
    connection_id: str,
    topic_name: str,
    limit: int = Query(default=50, ge=1, le=500),
    partition: int | None = None,
    from_offset: str = Query(default="latest", pattern="^(earliest|latest)$"),
) -> list[MessageInfo]:
    try:
        return kafka_manager.consume_messages(
            connection_id,
            topic_name,
            limit=limit,
            partition=partition,
            from_offset=from_offset,
        )
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KafkaConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/{connection_id}/messages/search",
    response_model=list[MessageSearchHit],
)
def search_messages(
    connection_id: str,
    q: str = Query(..., min_length=1),
    topics: str | None = Query(
        default=None,
        description="Comma-separated topic names; omit to search across topics",
    ),
    limit_per_topic: int = Query(default=20, ge=1, le=100),
    max_topics: int = Query(default=40, ge=1, le=100),
    from_offset: str = Query(default="latest", pattern="^(earliest|latest)$"),
) -> list[MessageSearchHit]:
    topic_list = [t.strip() for t in topics.split(",")] if topics else None
    try:
        return kafka_manager.search_messages(
            connection_id,
            q,
            topics=topic_list,
            limit_per_topic=limit_per_topic,
            max_topics=max_topics,
            from_offset=from_offset,
        )
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KafkaConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/{connection_id}/topics/{topic_name}/consumers",
    response_model=list[ConsumerGroupInfo],
)
def get_consumers(connection_id: str, topic_name: str) -> list[ConsumerGroupInfo]:
    try:
        return kafka_manager.list_topic_consumers(connection_id, topic_name)
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KafkaConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
