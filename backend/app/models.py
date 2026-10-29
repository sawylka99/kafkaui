from pydantic import BaseModel, Field


class ConnectionConfig(BaseModel):
    bootstrap_servers: str = Field(..., examples=["localhost:9092"])
    security_protocol: str = "PLAINTEXT"
    sasl_mechanism: str | None = None
    sasl_username: str | None = None
    sasl_password: str | None = None
    ssl_ca_pem: str | None = None


class Preferences(BaseModel):
    recent_servers: list[str] = Field(default_factory=list)
    last_config: ConnectionConfig | None = None


class RemoveRecentServerRequest(BaseModel):
    bootstrap_servers: str


class ConnectionResponse(BaseModel):
    connection_id: str
    bootstrap_servers: str


class TestConnectionResponse(BaseModel):
    ok: bool
    message: str


class BrokerInfo(BaseModel):
    id: int
    host: str
    port: int


class PartitionInfo(BaseModel):
    id: int
    leader: int
    replicas: list[int]
    isr: list[int]


class TopicSummary(BaseModel):
    name: str
    partition_count: int


class TopicDetail(BaseModel):
    name: str
    partitions: list[PartitionInfo]


class ProduceRequest(BaseModel):
    topic: str
    value: str
    key: str | None = None
    partition: int | None = None


class ProduceResponse(BaseModel):
    topic: str
    partition: int
    offset: int


class MessageInfo(BaseModel):
    partition: int
    offset: int
    key: str | None
    value: str
    timestamp: int | None


class MessageSearchHit(MessageInfo):
    topic: str


class PartitionOffsetInfo(BaseModel):
    partition: int
    offset: int
    log_end_offset: int | None
    lag: int | None


class ConsumerMemberInfo(BaseModel):
    member_id: str
    client_id: str
    host: str
    partitions: list[int]


class ConsumerGroupInfo(BaseModel):
    group_id: str
    state: str
    members: list[ConsumerMemberInfo]
    offsets: list[PartitionOffsetInfo]
