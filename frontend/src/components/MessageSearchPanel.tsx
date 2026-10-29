import { useMemo, useState } from "react";
import type { MessageSearchHit, TopicSummary } from "../types";
import { searchMessages } from "../api/client";
import { copyText } from "../utils/clipboard";
import { formatJsonIfPossible } from "../utils/jsonFormat";
import { JsonMessageValue } from "./JsonMessageValue";

interface MessageSearchPanelProps {
  connectionId: string;
  topics: TopicSummary[];
  onOpenTopic: (topicName: string) => void;
}

export function MessageSearchPanel({
  connectionId,
  topics,
  onOpenTopic,
}: MessageSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [limitPerTopic, setLimitPerTopic] = useState(20);
  const [maxTopics, setMaxTopics] = useState(40);
  const [fromOffset, setFromOffset] = useState<"earliest" | "latest">("latest");
  const [scopeAll, setScopeAll] = useState(true);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [hits, setHits] = useState<MessageSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prettyJson, setPrettyJson] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const pickerTopics = useMemo(() => {
    const q = topicFilter.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.name.toLowerCase().includes(q));
  }, [topics, topicFilter]);

  const toggleTopic = (name: string) => {
    setSelectedTopics((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Введите строку поиска");
      return;
    }
    if (!scopeAll && selectedTopics.length === 0) {
      setError("Выберите хотя бы один топик или включите «Все топики»");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await searchMessages(connectionId, {
        q: query.trim(),
        topics: scopeAll ? undefined : selectedTopics,
        limit_per_topic: limitPerTopic,
        max_topics: maxTopics,
        from_offset: fromOffset,
      });
      setHits(data);
    } catch (err) {
      setHits([]);
      setError(err instanceof Error ? err.message : "Ошибка поиска");
    } finally {
      setLoading(false);
    }
  };

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
    <div className="workspace">
      <header className="workspace-header">
        <div className="workspace-title-row">
          <h2>Поиск по сообщениям</h2>
        </div>
        <p className="workspace-subtitle">
          Ищет подстроку в key/value по топикам (сэмпл последних сообщений в каждом).
        </p>
      </header>

      <div className="workspace-body">
        <div className="tab-panel">
          <div className="toolbar">
            <div className="toolbar-field toolbar-field--grow">
              <label htmlFor="search-q">Запрос</label>
              <input
                id="search-q"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="текст в key или value"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSearch();
                }}
              />
            </div>
            <div className="toolbar-field">
              <label htmlFor="search-limit">Лимит / топик</label>
              <input
                id="search-limit"
                type="number"
                min={1}
                max={100}
                value={limitPerTopic}
                onChange={(e) => setLimitPerTopic(parseInt(e.target.value, 10) || 20)}
              />
            </div>
            <div className="toolbar-field">
              <label htmlFor="search-max-topics">Макс. топиков</label>
              <input
                id="search-max-topics"
                type="number"
                min={1}
                max={100}
                value={maxTopics}
                onChange={(e) => setMaxTopics(parseInt(e.target.value, 10) || 40)}
              />
            </div>
            <div className="toolbar-field">
              <label htmlFor="search-offset">Смещение</label>
              <select
                id="search-offset"
                value={fromOffset}
                onChange={(e) => setFromOffset(e.target.value as "earliest" | "latest")}
              >
                <option value="latest">Последние</option>
                <option value="earliest">С начала</option>
              </select>
            </div>
            <label className="toolbar-check">
              <input
                type="checkbox"
                checked={prettyJson}
                onChange={(e) => setPrettyJson(e.target.checked)}
              />
              JSON pretty
            </label>
            <button className="btn-primary" onClick={() => void handleSearch()} disabled={loading}>
              Искать
            </button>
          </div>

          <div className="search-scope">
            <label className="toolbar-check">
              <input
                type="checkbox"
                checked={scopeAll}
                onChange={(e) => setScopeAll(e.target.checked)}
              />
              Все топики (до «Макс. топиков»)
            </label>
            {!scopeAll && (
              <>
                <input
                  type="search"
                  className="search-topic-filter"
                  placeholder="Фильтр списка топиков..."
                  value={topicFilter}
                  onChange={(e) => setTopicFilter(e.target.value)}
                />
                <div className="search-topic-picker">
                  {pickerTopics.map((topic) => (
                    <label key={topic.name} className="search-topic-option">
                      <input
                        type="checkbox"
                        checked={selectedTopics.includes(topic.name)}
                        onChange={() => toggleTopic(topic.name)}
                      />
                      <span>{topic.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {loading && <p className="empty-state">Поиск...</p>}
          {error && <div className="message error">{error}</div>}
          {!loading && !error && hits.length === 0 && (
            <p className="empty-state">Введите запрос и нажмите «Искать»</p>
          )}

          {!loading && hits.length > 0 && (
            <div className="messages-list">
              <p className="toolbar-hint">Найдено: {hits.length}</p>
              {hits.map((msg) => {
                const id = `${msg.topic}-${msg.partition}-${msg.offset}`;
                const copyValue = prettyJson
                  ? formatJsonIfPossible(msg.value ?? "")
                  : (msg.value ?? "");
                return (
                  <article key={id} className="message-card">
                    <div className="message-card-meta">
                      <button
                        type="button"
                        className="topic-link"
                        onClick={() => onOpenTopic(msg.topic)}
                        title="Открыть топик"
                      >
                        {msg.topic}
                      </button>
                      <span>p{msg.partition}</span>
                      <span>offset {msg.offset}</span>
                      {msg.timestamp != null && (
                        <span>{new Date(msg.timestamp).toLocaleString()}</span>
                      )}
                      <button
                        type="button"
                        className="btn-sm btn-secondary message-copy-btn"
                        onClick={() => handleCopy(id, copyValue)}
                      >
                        {copiedKey === id ? "Скопировано" : "Копировать"}
                      </button>
                    </div>
                    {msg.key && (
                      <div className="message-card-key">
                        <span className="label">Key</span>
                        <code className="selectable-text">{msg.key}</code>
                      </div>
                    )}
                    <JsonMessageValue value={msg.value ?? ""} prettyJson={prettyJson} />
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
