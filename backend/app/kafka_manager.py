import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from confluent_kafka import (
    Consumer,
    ConsumerGroupTopicPartitions,
    KafkaError,
    KafkaException,
    Producer,
    TopicPartition,
)
from confluent_kafka.admin import AdminClient

from app.models import (
    BrokerInfo,
    ConnectionConfig,
    ConsumerGroupInfo,
    ConsumerMemberInfo,
    MessageInfo,
    MessageSearchHit,
    PartitionInfo,
    PartitionOffsetInfo,
    ProduceRequest,
    ProduceResponse,
    TopicDetail,
    TopicSummary,
)


class KafkaConnectionError(Exception):
    pass


class ConnectionNotFoundError(Exception):
    pass


@dataclass
class KafkaConnection:
    connection_id: str
    config: ConnectionConfig
    admin: AdminClient
    producer: Producer
    temp_files: list[Path]


_connections: dict[str, KafkaConnection] = {}


def _build_kafka_config(config: ConnectionConfig) -> tuple[dict, list[Path]]:
    kafka_config: dict = {
        "bootstrap.servers": config.bootstrap_servers,
        "security.protocol": config.security_protocol,
    }
    temp_files: list[Path] = []

    if config.sasl_mechanism:
        kafka_config["sasl.mechanism"] = config.sasl_mechanism
    if config.sasl_username:
        kafka_config["sasl.username"] = config.sasl_username
    if config.sasl_password:
        kafka_config["sasl.password"] = config.sasl_password

    if config.ssl_ca_pem:
        ca_file = Path(tempfile.gettempdir()) / f"kafka-ca-{uuid.uuid4().hex}.pem"
        ca_file.write_text(config.ssl_ca_pem, encoding="utf-8")
        temp_files.append(ca_file)
        kafka_config["ssl.ca.location"] = str(ca_file)

    return kafka_config, temp_files


def _cleanup_temp_files(temp_files: list[Path]) -> None:
    for path in temp_files:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


def _fetch_metadata(admin: AdminClient):
    try:
        return admin.list_topics(timeout=15)
    except KafkaException as exc:
        raise KafkaConnectionError(f"Failed to fetch cluster metadata: {exc}") from exc


def test_connection(config: ConnectionConfig) -> None:
    kafka_config, temp_files = _build_kafka_config(config)
    admin = AdminClient(kafka_config)
    try:
        _fetch_metadata(admin)
    finally:
        _cleanup_temp_files(temp_files)


def create_connection(config: ConnectionConfig) -> str:
    connection_id = str(uuid.uuid4())
    kafka_config, temp_files = _build_kafka_config(config)
    admin = AdminClient(kafka_config)
    producer = Producer(kafka_config)

    try:
        _fetch_metadata(admin)
    except KafkaConnectionError:
        _cleanup_temp_files(temp_files)
        raise
    except Exception as exc:
        _cleanup_temp_files(temp_files)
        raise KafkaConnectionError(f"Connection failed: {exc}") from exc

    _connections[connection_id] = KafkaConnection(
        connection_id=connection_id,
        config=config,
        admin=admin,
        producer=producer,
        temp_files=temp_files,
    )
    return connection_id


def delete_connection(connection_id: str) -> None:
    conn = _connections.pop(connection_id, None)
    if conn is None:
        raise ConnectionNotFoundError(f"Connection {connection_id} not found")
    conn.producer.flush(5)
    _cleanup_temp_files(conn.temp_files)


def _get_connection(connection_id: str) -> KafkaConnection:
    conn = _connections.get(connection_id)
    if conn is None:
        raise ConnectionNotFoundError(f"Connection {connection_id} not found")
    return conn


def list_brokers(connection_id: str) -> list[BrokerInfo]:
    conn = _get_connection(connection_id)
    metadata = _fetch_metadata(conn.admin)

    brokers: list[BrokerInfo] = []
    for broker in metadata.brokers.values():
        brokers.append(
            BrokerInfo(id=broker.id, host=broker.host, port=broker.port)
        )
    brokers.sort(key=lambda b: b.id)
    return brokers


def list_topics(connection_id: str) -> list[TopicSummary]:
    conn = _get_connection(connection_id)
    metadata = _fetch_metadata(conn.admin)

    topics: list[TopicSummary] = []
    for name, topic in metadata.topics.items():
        if topic.error is not None:
            continue
        topics.append(
            TopicSummary(name=name, partition_count=len(topic.partitions))
        )
    topics.sort(key=lambda t: t.name)
    return topics


def get_topic(connection_id: str, topic_name: str) -> TopicDetail:
    conn = _get_connection(connection_id)
    metadata = _fetch_metadata(conn.admin)

    topic = metadata.topics.get(topic_name)
    if topic is None or topic.error is not None:
        raise KafkaConnectionError(f"Topic '{topic_name}' not found")

    partitions: list[PartitionInfo] = []
    for partition_id, partition in sorted(topic.partitions.items()):
        partitions.append(
            PartitionInfo(
                id=partition_id,
                leader=partition.leader,
                replicas=list(partition.replicas),
                isr=list(partition.isrs),
            )
        )

    return TopicDetail(name=topic_name, partitions=partitions)


def produce_message(connection_id: str, request: ProduceRequest) -> ProduceResponse:
    conn = _get_connection(connection_id)
    delivery_result: dict = {}

    def on_delivery(err, msg):
        if err is not None:
            delivery_result["error"] = str(err)
        else:
            delivery_result["partition"] = msg.partition()
            delivery_result["offset"] = msg.offset()

    key = request.key.encode("utf-8") if request.key else None
    value = request.value.encode("utf-8")

    produce_kwargs: dict = {
        "topic": request.topic,
        "value": value,
        "callback": on_delivery,
    }
    if key is not None:
        produce_kwargs["key"] = key
    if request.partition is not None:
        produce_kwargs["partition"] = request.partition

    try:
        conn.producer.produce(**produce_kwargs)
        conn.producer.flush(15)
    except Exception as exc:
        raise KafkaConnectionError(f"Produce failed: {exc}") from exc

    if "error" in delivery_result:
        raise KafkaConnectionError(delivery_result["error"])

    return ProduceResponse(
        topic=request.topic,
        partition=delivery_result["partition"],
        offset=delivery_result["offset"],
    )


def _decode_bytes(data: bytes | None) -> str | None:
    if data is None:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.hex()


def consume_messages(
    connection_id: str,
    topic_name: str,
    limit: int = 50,
    partition: int | None = None,
    from_offset: str = "latest",
) -> list[MessageInfo]:
    if from_offset not in ("earliest", "latest"):
        raise KafkaConnectionError("from_offset must be 'earliest' or 'latest'")

    conn = _get_connection(connection_id)
    metadata = _fetch_metadata(conn.admin)
    topic_meta = metadata.topics.get(topic_name)
    if topic_meta is None or topic_meta.error is not None:
        raise KafkaConnectionError(f"Topic '{topic_name}' not found")

    partition_ids = (
        [partition]
        if partition is not None
        else sorted(topic_meta.partitions.keys())
    )
    if not partition_ids:
        return []

    kafka_config, _ = _build_kafka_config(conn.config)
    kafka_config.update(
        {
            "group.id": f"kafkaui-read-{uuid.uuid4().hex}",
            "enable.auto.commit": False,
            "auto.offset.reset": from_offset,
        }
    )

    consumer = Consumer(kafka_config)
    messages: list[MessageInfo] = []
    try:
        # Read up to `limit` messages from EACH partition, then pick the
        # globally newest/oldest `limit`. Stopping after the first poll result
        # (old behavior) returned a random partition's message when limit=1.
        per_partition = limit
        assignments: list[TopicPartition] = []
        remaining: dict[int, int] = {}

        for pid in partition_ids:
            tp = TopicPartition(topic_name, pid)
            low, high = consumer.get_watermark_offsets(tp, timeout=15)
            if high <= low:
                continue
            available = high - low
            take = min(per_partition, available)
            if from_offset == "earliest":
                start = low
            else:
                start = high - take
            assignments.append(TopicPartition(topic_name, pid, start))
            remaining[pid] = take

        if not assignments:
            return []

        consumer.assign(assignments)

        empty_polls = 0
        deadline = time.time() + 20

        while remaining and time.time() < deadline:
            if all(v <= 0 for v in remaining.values()):
                break

            msg = consumer.poll(1.0)
            if msg is None:
                empty_polls += 1
                if empty_polls >= 8:
                    break
                continue
            empty_polls = 0

            err = msg.error()
            if err:
                if err.code() == KafkaError._PARTITION_EOF:
                    pid = msg.partition()
                    if pid in remaining:
                        remaining[pid] = 0
                    continue
                raise KafkaConnectionError(f"Consume error: {err}")

            pid = msg.partition()
            if remaining.get(pid, 0) <= 0:
                continue
            remaining[pid] -= 1

            messages.append(
                MessageInfo(
                    partition=pid,
                    offset=msg.offset(),
                    key=_decode_bytes(msg.key()),
                    value=_decode_bytes(msg.value()) or "",
                    timestamp=msg.timestamp()[1] if msg.timestamp()[0] else None,
                )
            )

        # Prefer event time; fall back to partition/offset when timestamp missing.
        def sort_key(m: MessageInfo) -> tuple:
            ts = m.timestamp if m.timestamp is not None else -1
            return (ts, m.partition, m.offset)

        messages.sort(key=sort_key)
        if from_offset == "latest":
            # Newest first (descending by time).
            return list(reversed(messages[-limit:]))
        return messages[:limit]
    except KafkaException as exc:
        raise KafkaConnectionError(f"Consume failed: {exc}") from exc
    finally:
        consumer.close()


def search_messages(
    connection_id: str,
    query: str,
    *,
    topics: list[str] | None = None,
    limit_per_topic: int = 20,
    max_topics: int = 40,
    from_offset: str = "latest",
) -> list[MessageSearchHit]:
    needle = query.strip().lower()
    if not needle:
        raise KafkaConnectionError("Search query must not be empty")

    all_topics = list_topics(connection_id)
    names = [t.name for t in all_topics]
    if topics:
        wanted = {t.strip() for t in topics if t.strip()}
        names = [n for n in names if n in wanted]
    names = names[:max_topics]

    hits: list[MessageSearchHit] = []
    for topic_name in names:
        try:
            batch = consume_messages(
                connection_id,
                topic_name,
                limit=limit_per_topic,
                partition=None,
                from_offset=from_offset,
            )
        except KafkaConnectionError:
            continue
        for msg in batch:
            hay = f"{msg.key or ''}\n{msg.value}".lower()
            if needle in hay:
                hits.append(
                    MessageSearchHit(
                        topic=topic_name,
                        partition=msg.partition,
                        offset=msg.offset,
                        key=msg.key,
                        value=msg.value,
                        timestamp=msg.timestamp,
                    )
                )
    hits.sort(key=lambda m: (m.timestamp or 0, m.topic, m.partition, m.offset), reverse=True)
    return hits


def _resolve_admin_future(result):
    if hasattr(result, "result"):
        return result.result()
    return result


def list_topic_consumers(
    connection_id: str, topic_name: str
) -> list[ConsumerGroupInfo]:
    conn = _get_connection(connection_id)
    admin = conn.admin

    groups_result = _resolve_admin_future(
        admin.list_consumer_groups(request_timeout=15)
    )
    group_ids = [group.group_id for group in groups_result.valid]

    kafka_config, _ = _build_kafka_config(conn.config)
    kafka_config.update(
        {
            "group.id": f"kafkaui-lag-{uuid.uuid4().hex}",
            "enable.auto.commit": False,
        }
    )
    lag_consumer = Consumer(kafka_config)

    consumers: list[ConsumerGroupInfo] = []
    try:
        for group_id in group_ids:
            try:
                offset_futures = admin.list_consumer_group_offsets(
                    [ConsumerGroupTopicPartitions(group_id)],
                    request_timeout=15,
                )
                offset_result = _resolve_admin_future(offset_futures[group_id])
                topic_partitions = [
                    tp
                    for tp in offset_result.topic_partitions
                    if tp.topic == topic_name
                ]
                if not topic_partitions:
                    continue

                describe_futures = admin.describe_consumer_groups(
                    [group_id], request_timeout=15
                )
                group_desc = _resolve_admin_future(describe_futures[group_id])

                members: list[ConsumerMemberInfo] = []
                for member in group_desc.members:
                    assigned: list[int] = []
                    if member.assignment:
                        assigned = [
                            tp.partition
                            for tp in member.assignment.topic_partitions
                            if tp.topic == topic_name
                        ]
                    members.append(
                        ConsumerMemberInfo(
                            member_id=member.member_id,
                            client_id=member.client_id,
                            host=member.host,
                            partitions=sorted(assigned),
                        )
                    )

                offsets: list[PartitionOffsetInfo] = []
                for tp in sorted(topic_partitions, key=lambda x: x.partition):
                    log_end: int | None = None
                    lag: int | None = None
                    try:
                        low, high = lag_consumer.get_watermark_offsets(
                            TopicPartition(topic_name, tp.partition), timeout=10
                        )
                        log_end = high
                        if tp.offset >= 0:
                            lag = max(0, high - tp.offset)
                    except KafkaException:
                        pass

                    offsets.append(
                        PartitionOffsetInfo(
                            partition=tp.partition,
                            offset=tp.offset,
                            log_end_offset=log_end,
                            lag=lag,
                        )
                    )

                consumers.append(
                    ConsumerGroupInfo(
                        group_id=group_id,
                        state=str(group_desc.state),
                        members=members,
                        offsets=offsets,
                    )
                )
            except KafkaException:
                continue
    finally:
        lag_consumer.close()

    consumers.sort(key=lambda c: c.group_id)
    return consumers
