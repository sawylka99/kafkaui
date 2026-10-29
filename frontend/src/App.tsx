import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { BrokerInfo, ConnectionConfig, TopicSummary } from "./types";
import {
  createConnection,
  deleteConnection,
  getBrokers,
  getTopics,
} from "./api/client";
import { ConnectionForm } from "./components/ConnectionForm";
import { MessageSearchPanel } from "./components/MessageSearchPanel";
import { TopicSidebar } from "./components/TopicSidebar";
import { TopicWorkspace } from "./components/TopicWorkspace";

const STORAGE_KEY_CONNECTION = "kafkaui_connection_id";
const STORAGE_KEY_SIDEBAR_WIDTH = "kafkaui_sidebar_width";

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_DEFAULT_WIDTH = 280;

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SIDEBAR_WIDTH);
    if (raw) {
      const width = parseInt(raw, 10);
      if (!Number.isNaN(width)) {
        return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
      }
    }
  } catch {
    // ignore
  }
  return SIDEBAR_DEFAULT_WIDTH;
}

function loadSavedConfig(): ConnectionConfig | null {
  try {
    const raw = localStorage.getItem("kafkaui_config");
    if (raw) return JSON.parse(raw) as ConnectionConfig;
  } catch {
    // ignore
  }
  return null;
}

export default function App() {
  const [connectionId, setConnectionId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY_CONNECTION)
  );
  const [bootstrapServers, setBootstrapServers] = useState("");
  const [brokers, setBrokers] = useState<BrokerInfo[]>([]);
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const [mainView, setMainView] = useState<"topic" | "search">("topic");
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const startSidebarResize = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;

    setIsResizing(true);

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, startWidth + moveEvent.clientX - startX)
      );
      setSidebarWidth(nextWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(
        STORAGE_KEY_SIDEBAR_WIDTH,
        String(sidebarWidthRef.current)
      );
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const refreshData = useCallback(async (id: string) => {
    setTopicsLoading(true);
    setTopicsError(null);
    try {
      const [brokersData, topicsData] = await Promise.all([
        getBrokers(id),
        getTopics(id),
      ]);
      setBrokers(brokersData);
      setTopics(topicsData);
      setSelectedTopic((prev) => {
        if (prev && topicsData.some((t) => t.name === prev)) return prev;
        return topicsData[0]?.name ?? null;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка загрузки";
      setTopicsError(msg);
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  const handleConnected = useCallback(
    (id: string, config: ConnectionConfig) => {
      setConnectionId(id);
      setBootstrapServers(config.bootstrap_servers);
      localStorage.setItem(STORAGE_KEY_CONNECTION, id);
      setShowConnection(false);
      refreshData(id);
    },
    [refreshData]
  );

  const handleDisconnect = useCallback(async () => {
    if (connectionId) {
      try {
        await deleteConnection(connectionId);
      } catch {
        // connection may already be gone on server restart
      }
    }
    localStorage.removeItem(STORAGE_KEY_CONNECTION);
    setConnectionId(null);
    setBootstrapServers("");
    setBrokers([]);
    setTopics([]);
    setSelectedTopic(null);
    setTopicsError(null);
    setShowConnection(false);
  }, [connectionId]);

  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY_CONNECTION);
    const savedConfig = loadSavedConfig();
    if (!savedId || !savedConfig) return;

    setReconnecting(true);
    createConnection(savedConfig)
      .then((result) => {
        setConnectionId(result.connection_id);
        setBootstrapServers(savedConfig.bootstrap_servers);
        localStorage.setItem(STORAGE_KEY_CONNECTION, result.connection_id);
        return refreshData(result.connection_id);
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY_CONNECTION);
        setConnectionId(null);
      })
      .finally(() => setReconnecting(false));
  }, [refreshData]);

  if (!connectionId) {
    return (
      <div className="app-shell app-shell--connect">
        <div className="connect-screen">
          <header className="connect-screen-header">
            <h1>Kafka UI</h1>
            <p>Подключитесь к кластеру Kafka</p>
          </header>
          <ConnectionForm
            connectionId={null}
            loading={reconnecting}
            onConnected={handleConnected}
            onDisconnect={handleDisconnect}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell${isResizing ? " app-shell--resizing" : ""}`}>
      <header className="topbar">
        <div className="topbar-left">
          <h1>Kafka UI</h1>
          <span className="topbar-cluster">{bootstrapServers}</span>
          <span className="connected-badge">Подключено</span>
        </div>
        <div className="topbar-right">
          <span className="topbar-meta">{brokers.length} брокеров</span>
          <button className="btn-secondary btn-sm" onClick={() => setShowConnection((v) => !v)}>
            Настройки
          </button>
          <button className="btn-danger btn-sm" onClick={handleDisconnect}>
            Отключиться
          </button>
        </div>
      </header>

      {showConnection && (
        <div className="topbar-panel">
          <ConnectionForm
            connectionId={connectionId}
            loading={reconnecting}
            onConnected={handleConnected}
            onDisconnect={handleDisconnect}
          />
        </div>
      )}

      <div className="app-body">
        <div className="sidebar-wrapper" style={{ width: sidebarWidth }}>
          <TopicSidebar
            topics={topics}
            selectedTopic={selectedTopic}
            searchActive={mainView === "search"}
            loading={topicsLoading}
            error={topicsError}
            onSelectTopic={(name) => {
              setSelectedTopic(name);
              setMainView("topic");
            }}
            onOpenSearch={() => setMainView("search")}
            onRefresh={() => refreshData(connectionId)}
          />
        </div>

        <div
          className="sidebar-resizer"
          onMouseDown={startSidebarResize}
          title="Перетащите для изменения ширины"
        />

        <main className="main-content">
          {mainView === "search" ? (
            <MessageSearchPanel
              connectionId={connectionId}
              topics={topics}
              onOpenTopic={(name) => {
                setSelectedTopic(name);
                setMainView("topic");
              }}
            />
          ) : selectedTopic ? (
            <TopicWorkspace connectionId={connectionId} topicName={selectedTopic} />
          ) : (
            <div className="workspace-empty">
              <p>Выберите топик слева</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
