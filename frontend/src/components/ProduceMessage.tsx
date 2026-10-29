import { useState } from "react";
import { produceMessage } from "../api/client";
import { prettyPrintJson } from "../utils/jsonFormat";

interface ProduceMessageProps {
  connectionId: string;
  topicName: string;
}

export function ProduceMessage({ connectionId, topicName }: ProduceMessageProps) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [partition, setPartition] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handlePretty = () => {
    try {
      setValue(prettyPrintJson(value));
      setMessage({ type: "success", text: "JSON отформатирован" });
    } catch {
      setMessage({ type: "error", text: "Невалидный JSON" });
    }
  };

  const handleSend = async () => {
    if (!value.trim()) {
      setMessage({ type: "error", text: "Введите сообщение" });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await produceMessage(connectionId, {
        topic: topicName,
        value,
        key: key.trim() || null,
        partition: partition.trim() ? parseInt(partition, 10) : null,
      });
      setMessage({
        type: "success",
        text: `Отправлено: partition=${result.partition}, offset=${result.offset}`,
      });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tab-panel">
      <div className="produce-form">
        <div className="form-row">
          <label htmlFor="produce-key">Key (опционально)</label>
          <input
            id="produce-key"
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>

        <div className="form-row">
          <label htmlFor="produce-partition">Partition (опционально)</label>
          <input
            id="produce-partition"
            type="number"
            min={0}
            placeholder="auto"
            value={partition}
            onChange={(e) => setPartition(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="label-row">
            <label htmlFor="produce-value">Сообщение</label>
            <button
              type="button"
              className="btn-sm btn-secondary"
              onClick={handlePretty}
              disabled={!value.trim()}
            >
              JSON pretty
            </button>
          </div>
          <textarea
            id="produce-value"
            className="produce-textarea"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder='{"hello": "world"}'
            spellCheck={false}
          />
        </div>

        <div className="button-row">
          <button className="btn-primary" onClick={handleSend} disabled={busy}>
            Отправить
          </button>
        </div>

        {message && (
          <div className={`message ${message.type}`}>{message.text}</div>
        )}
      </div>
    </div>
  );
}
