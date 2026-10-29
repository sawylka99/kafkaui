import { useMemo, useState, type MouseEvent } from "react";
import type { TopicSummary } from "../types";
import { copyText } from "../utils/clipboard";

interface TopicSidebarProps {
  topics: TopicSummary[];
  selectedTopic: string | null;
  searchActive?: boolean;
  loading: boolean;
  error: string | null;
  onSelectTopic: (name: string) => void;
  onOpenSearch?: () => void;
  onRefresh: () => void;
}

export function TopicSidebar({
  topics,
  selectedTopic,
  searchActive = false,
  loading,
  error,
  onSelectTopic,
  onOpenSearch,
  onRefresh,
}: TopicSidebarProps) {
  const [filter, setFilter] = useState("");
  const [copiedTopic, setCopiedTopic] = useState<string | null>(null);

  const filteredTopics = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((topic) => topic.name.toLowerCase().includes(q));
  }, [topics, filter]);

  const handleCopy = async (name: string, event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const ok = await copyText(name);
    if (ok) {
      setCopiedTopic(name);
      window.setTimeout(() => {
        setCopiedTopic((prev) => (prev === name ? null : prev));
      }, 1200);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Топики</h2>
        <button className="btn-icon" onClick={onRefresh} disabled={loading} title="Обновить">
          ↻
        </button>
      </div>

      {onOpenSearch && (
        <div className="sidebar-actions">
          <button
            type="button"
            className={`sidebar-action-btn ${searchActive ? "active" : ""}`}
            onClick={onOpenSearch}
          >
            Поиск по сообщениям
          </button>
        </div>
      )}

      <div className="sidebar-filter">
        <input
          type="search"
          placeholder="Фильтр топиков..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Фильтр топиков"
        />
      </div>

      {loading && <p className="empty-state sidebar-empty">Загрузка...</p>}
      {error && <div className="message error sidebar-empty">{error}</div>}

      {!loading && !error && topics.length === 0 && (
        <p className="empty-state sidebar-empty">Топики не найдены</p>
      )}

      {!loading && !error && topics.length > 0 && filteredTopics.length === 0 && (
        <p className="empty-state sidebar-empty">Ничего не найдено</p>
      )}

      <ul className="topic-nav">
        {filteredTopics.map((topic) => (
          <li key={topic.name}>
            <div
              className={`topic-nav-item ${!searchActive && selectedTopic === topic.name ? "active" : ""}`}
            >
              <button
                type="button"
                className="topic-nav-select"
                onClick={() => onSelectTopic(topic.name)}
                title={topic.name}
              >
                <span className="topic-name">{topic.name}</span>
                <span className="topic-meta">{topic.partition_count}p</span>
              </button>
              <button
                type="button"
                className="topic-nav-copy"
                onClick={(e) => handleCopy(topic.name, e)}
                title="Копировать название"
                aria-label={`Копировать ${topic.name}`}
              >
                {copiedTopic === topic.name ? "✓" : "⧉"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
