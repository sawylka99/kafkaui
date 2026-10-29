export interface ConnectionConfig {
  bootstrap_servers: string;
  security_protocol: string;
  sasl_mechanism?: string | null;
  sasl_username?: string | null;
  sasl_password?: string | null;
  ssl_ca_pem?: string | null;
}

export interface Preferences {
  recent_servers: string[];
  last_config: ConnectionConfig | null;
}

export interface ConnectionResponse {
  connection_id: string;
  bootstrap_servers: string;
}

export interface BrokerInfo {
  id: number;
  host: string;
  port: number;
}

export interface TopicSummary {
  name: string;
  partition_count: number;
}

export interface PartitionInfo {
  id: number;
  leader: number;
  replicas: number[];
  isr: number[];
}

export interface TopicDetail {
  name: string;
  partitions: PartitionInfo[];
}

export interface ProduceRequest {
  topic: string;
  value: string;
  key?: string | null;
  partition?: number | null;
}

export interface ProduceResponse {
  topic: string;
  partition: number;
  offset: number;
}

export interface MessageInfo {
  partition: number;
  offset: number;
  key: string | null;
  value: string;
  timestamp: number | null;
}

export interface MessageSearchHit extends MessageInfo {
  topic: string;
}

export interface PartitionOffsetInfo {
  partition: number;
  offset: number;
  log_end_offset: number | null;
  lag: number | null;
}

export interface ConsumerMemberInfo {
  member_id: string;
  client_id: string;
  host: string;
  partitions: number[];
}

export interface ConsumerGroupInfo {
  group_id: string;
  state: string;
  members: ConsumerMemberInfo[];
  offsets: PartitionOffsetInfo[];
}

export type TopicTab = "messages" | "produce" | "consumers";
