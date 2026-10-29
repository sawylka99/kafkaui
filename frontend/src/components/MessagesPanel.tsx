import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageInfo } from "../types";
import { getMessages } from "../api/client";
import { copyText } from "../utils/clipboard";
import { formatJsonIfPossible } from "../utils/jsonFormat";
import { JsonMessageValue } from "./JsonMessageValue";

interface MessagesPanelProps {
  connectionId: string;
  topicName: string;
}

function messageId(msg: MessageInfo): string {
  return `${msg.partition}-${msg.offset}`;
}

export function MessagesPanel({ connectionId, topicName }: MessagesPanelProps) {
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [limit, setLimit] = useState(1);
  const [partition, setPartition] = useState("");
  const [fromOffset, setFromOffset] = useState<"earliest" | "latest">("latest");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalSec, setIntervalSec] = useState(5);
  const [prettyJson, setPrettyJson] = useState(true);
  const [maxBuffer, setMaxBuffer] = useState(50);
  const busyRef = useRef(false);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setLoaded(false);
    setCopiedKey(null);
    setAutoRefresh(false);
  }, [topicName]);

  const loadMessages = useCallback(
    async (mode: "replace" | "append" = "replace") => {
      if (busyRef.current) return;
      busyRef.current = true;
      if (mode === "replace") {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await getMessages(connectionId, topicName, {
          limit,
          partition: partition.trim() ? parseInt(partition, 10) : null,
          from_offset: fromOffset,
        });
        setMessages((prev) => {
          if (mode === "replace") return data;
          const seen = new Set(prev.map(messageId));
          const added = data.filter((msg) => !seen.has(messageId(msg)));
          if (added.length === 0) return prev;
          // API returns newest-first for latest; prepend new ones as-is.
          return [...added, ...prev].slice(0, maxBuffer);
        });
        setLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
        if (mode === "replace") {
          setMessages([]);
        }
        setLoaded(true);
      } finally {
        setLoading(false);
        busyRef.current = false;
      }
    },
    [connectionId, topicName, limit, partition, fromOffset, maxBuffer]
  );

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void loadMessages("append");
    }, intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh, intervalSec, loadMessages]);

  const handleCopy = async (id: string, text: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(id);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === id ? null : prev));
      }, 1500);
    }
  };

  return (
    <div className="tab-panel">
      <div className="toolbar">
        <div className="toolbar-field">
          <label htmlFor="msg-limit">Лимит</label>
          <input
            id="msg-limit"
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10) || 1)}
          />
        </div>
        <div className="toolbar-field">
          <label htmlFor="msg-partition">Партиция</label>
          <input
            id="msg-partition"
            type="number"
            min={0}
            placeholder="все"
            value={partition}
            onChange={(e) => setPartition(e.target.value)}
          />
        </div>
        <div className="toolbar-field">
          <label htmlFor="msg-offset">Смещение</label>
          <select
            id="msg-offset"
            value={fromOffset}
            onChange={(e) => setFromOffset(e.target.value as "earliest" | "latest")}
            disabled={autoRefresh}
          >
            <option value="latest">Последние</option>
            <option value="earliest">С начала</option>
          </select>
        </div>
        <div className="toolbar-field">
          <label htmlFor="msg-interval">Интервал, с</label>
          <select
            id="msg-interval"
            value={intervalSec}
            onChange={(e) => setIntervalSec(parseInt(e.target.value, 10))}
            disabled={!autoRefresh}
          >
            <option value={2}>2</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={30}>30</option>
          </select>
        </div>
        <div className="toolbar-field">
          <label htmlFor="msg-buffer">Макс. в списке</label>
          <input
            id="msg-buffer"
            type="number"
            min={1}
            max={500}
            value={maxBuffer}
            onChange={(e) => setMaxBuffer(parseInt(e.target.value, 10) || 50)}
            disabled={!autoRefresh}
          />
        </div>
        <label className="toolbar-check">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => {
              const on = e.target.checked;
              setAutoRefresh(on);
              if (on) {
                setFromOffset("latest");
                void loadMessages(messages.length === 0 ? "replace" : "append");
              }
            }}
          />
          Автообновление
        </label>
        <label className="toolbar-check">
          <input
            type="checkbox"
            checked={prettyJson}
            onChange={(e) => setPrettyJson(e.target.checked)}
          />
          JSON pretty
        </label>
        <button
          className="btn-primary"
          onClick={() => void loadMessages("replace")}
          disabled={loading || autoRefresh}
        >
          Обновить
        </button>
        <button
          className="btn-secondary"
          onClick={() => setMessages([])}
          disabled={messages.length === 0}
        >
          Очистить
        </button>
      </div>

      {autoRefresh && (
        <p className="toolbar-hint">
          Автообновление добавит новые сообщения сверху (не чаще раз в {intervalSec} с),
          список ограничен {maxBuffer} шт.
        </p>
      )}

      {loading && <p className="empty-state">Загрузка сообщений...</p>}
      {error && <div className="message error">{error}</div>}

      {!loading && !error && !loaded && (
        <p className="empty-state">Нажмите «Обновить» для загрузки сообщений</p>
      )}

      {!loading && !error && loaded && messages.length === 0 && (
        <p className="empty-state">Сообщений не найдено</p>
      )}

      {!loading && messages.length > 0 && (
        <div className="messages-list">
          {messages.map((msg) => {
            const id = messageId(msg);
            const valueId = `${id}:value`;
            const keyId = `${id}:key`;
            const copyValue = prettyJson
              ? formatJsonIfPossible(msg.value ?? "")
              : (msg.value ?? "");
            return (
              <article key={id} className="message-card">
                <div className="message-card-meta">
                  <span>p{msg.partition}</span>
                  <span>offset {msg.offset}</span>
                  {msg.timestamp != null && (
                    <span>{new Date(msg.timestamp).toLocaleString()}</span>
                  )}
                  <button
                    type="button"
                    className="btn-sm btn-secondary message-copy-btn"
                    onClick={() => handleCopy(valueId, copyValue)}
                    title="Копировать value"
                  >
                    {copiedKey === valueId ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                {msg.key && (
                  <div className="message-card-key">
                    <span className="label">Key</span>
                    <code className="selectable-text">{msg.key}</code>
                    <button
                      type="button"
                      className="btn-sm btn-secondary message-copy-btn"
                      onClick={() => handleCopy(keyId, msg.key ?? "")}
                    >
                      {copiedKey === keyId ? "Скопировано" : "Копировать key"}
                    </button>
                  </div>
                )}
                <JsonMessageValue value={msg.value ?? ""} prettyJson={prettyJson} />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
