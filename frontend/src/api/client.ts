import type {
  BrokerInfo,
  ConnectionConfig,
  ConnectionResponse,
  ConsumerGroupInfo,
  MessageInfo,
  MessageSearchHit,
  Preferences,
  ProduceRequest,
  ProduceResponse,
  TopicDetail,
  TopicSummary,
} from "../types";
const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function testConnection(config: ConnectionConfig): Promise<{ ok: boolean; message: string }> {
  return request("/connections/test", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export function createConnection(config: ConnectionConfig): Promise<ConnectionResponse> {
  return request("/connections", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export function deleteConnection(connectionId: string): Promise<{ ok: boolean }> {
  return request(`/connections/${connectionId}`, { method: "DELETE" });
}

export function getBrokers(connectionId: string): Promise<BrokerInfo[]> {
  return request(`/connections/${connectionId}/brokers`);
}

export function getTopics(connectionId: string): Promise<TopicSummary[]> {
  return request(`/connections/${connectionId}/topics`);
}

export function getTopic(connectionId: string, topicName: string): Promise<TopicDetail> {
  return request(`/connections/${connectionId}/topics/${encodeURIComponent(topicName)}`);
}

export function produceMessage(
  connectionId: string,
  payload: ProduceRequest
): Promise<ProduceResponse> {
  return request(`/connections/${connectionId}/produce`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMessages(
  connectionId: string,
  topicName: string,
  params?: { limit?: number; partition?: number | null; from_offset?: "earliest" | "latest" }
): Promise<MessageInfo[]> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.partition != null) search.set("partition", String(params.partition));
  if (params?.from_offset) search.set("from_offset", params.from_offset);
  const query = search.toString();
  return request(
    `/connections/${connectionId}/topics/${encodeURIComponent(topicName)}/messages${query ? `?${query}` : ""}`
  );
}

export function searchMessages(
  connectionId: string,
  params: {
    q: string;
    topics?: string[];
    limit_per_topic?: number;
    max_topics?: number;
    from_offset?: "earliest" | "latest";
  }
): Promise<MessageSearchHit[]> {
  const search = new URLSearchParams();
  search.set("q", params.q);
  if (params.topics?.length) search.set("topics", params.topics.join(","));
  if (params.limit_per_topic) search.set("limit_per_topic", String(params.limit_per_topic));
  if (params.max_topics) search.set("max_topics", String(params.max_topics));
  if (params.from_offset) search.set("from_offset", params.from_offset);
  return request(`/connections/${connectionId}/messages/search?${search.toString()}`);
}

export function getConsumers(
  connectionId: string,
  topicName: string
): Promise<ConsumerGroupInfo[]> {
  return request(
    `/connections/${connectionId}/topics/${encodeURIComponent(topicName)}/consumers`
  );
}

export function getPreferences(): Promise<Preferences> {
  return request("/preferences");
}

export function rememberConnection(config: ConnectionConfig): Promise<Preferences> {
  return request("/preferences/remember", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export function removeRecentServer(bootstrapServers: string): Promise<Preferences> {
  return request("/preferences/recent/remove", {
    method: "POST",
    body: JSON.stringify({ bootstrap_servers: bootstrapServers }),
  });
}

export function clearRecentServers(): Promise<Preferences> {
  return request("/preferences/recent", { method: "DELETE" });
}