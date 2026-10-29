import { useCallback, useEffect, useState } from "react";
import type { TopicTab } from "../types";
import { copyText } from "../utils/clipboard";
import { MessagesPanel } from "./MessagesPanel";
import { ProduceMessage } from "./ProduceMessage";
import { ConsumersPanel } from "./ConsumersPanel";

const TABS: { id: TopicTab; label: string }[] = [
  { id: "messages", label: "Сообщения" },
  { id: "produce", label: "Отправка" },
  { id: "consumers", label: "Консьюмеры" },
];

interface TopicWorkspaceProps {
  connectionId: string;
  topicName: string;
}

export function TopicWorkspace({ connectionId, topicName }: TopicWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TopicTab>("messages");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActiveTab("messages");
    setCopied(false);
  }, [topicName]);

  const handleCopyName = async () => {
    const ok = await copyText(topicName);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  const renderTab = useCallback(() => {
    switch (activeTab) {
      case "messages":
        return <MessagesPanel connectionId={connectionId} topicName={topicName} />;
      case "produce":
        return <ProduceMessage connectionId={connectionId} topicName={topicName} />;
      case "consumers":
        return <ConsumersPanel connectionId={connectionId} topicName={topicName} />;
    }
  }, [activeTab, connectionId, topicName]);

  return (
    <div className="workspace">
      <header className="workspace-header">
        <div className="workspace-title-row">
          <h2 className="selectable-text" title={topicName}>
            {topicName}
          </h2>
          <button
            type="button"
            className="btn-sm btn-secondary"
            onClick={handleCopyName}
            title="Копировать название топика"
          >
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
        <nav className="tab-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="workspace-body">{renderTab()}</div>
    </div>
  );
}
