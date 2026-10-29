import { useCallback, useEffect, useState } from "react";
import type { ConsumerGroupInfo } from "../types";
import { getConsumers } from "../api/client";

interface ConsumersPanelProps {
  connectionId: string;
  topicName: string;
}

export function ConsumersPanel({ connectionId, topicName }: ConsumersPanelProps) {
  const [groups, setGroups] = useState<ConsumerGroupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConsumers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getConsumers(connectionId, topicName);
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId, topicName]);

  useEffect(() => {
    loadConsumers();
  }, [loadConsumers]);

  return (
    <div className="tab-panel">
      <div className="toolbar">
        <button className="btn-primary" onClick={loadConsumers} disabled={loading}>
          Обновить
        </button>
      </div>

      {loading && <p className="empty-state">Загрузка консьюмеров...</p>}
      {error && <div className="message error">{error}</div>}

      {!loading && !error && groups.length === 0 && (
        <p className="empty-state">Консьюмер-группы для этого топика не найдены</p>
      )}

      {!loading && groups.length > 0 && (
        <div className="consumers-list">
          {groups.map((group) => (
            <section key={group.group_id} className="consumer-card">
              <header className="consumer-card-header">
                <h3>{group.group_id}</h3>
                <span className="consumer-state">{group.state}</span>
              </header>

              {group.offsets.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Партиция</th>
                      <th>Offset</th>
                      <th>Log end</th>
                      <th>Lag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.offsets.map((o) => (
                      <tr key={o.partition}>
                        <td>{o.partition}</td>
                        <td>{o.offset}</td>
                        <td>{o.log_end_offset ?? "—"}</td>
                        <td>{o.lag ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {group.members.length > 0 && (
                <div className="consumer-members">
                  <h4>Участники ({group.members.length})</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Client ID</th>
                        <th>Host</th>
                        <th>Партиции</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.members.map((m) => (
                        <tr key={m.member_id}>
                          <td>{m.client_id}</td>
                          <td>{m.host}</td>
                          <td>{m.partitions.length ? m.partitions.join(", ") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
