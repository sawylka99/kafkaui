import { useMemo, useState } from "react";
import {
  formatJsonIfPossible,
  isJsonText,
  jsonCollapsedPreview,
  tokenizeJson,
  type JsonToken,
} from "../utils/jsonFormat";

interface JsonMessageValueProps {
  value: string;
  prettyJson: boolean;
  /** Start collapsed when content is JSON. Default true. */
  defaultCollapsed?: boolean;
}

function TokenSpan({ token }: { token: JsonToken }) {
  if (token.kind === "plain") {
    return <>{token.text}</>;
  }
  return <span className={`json-token json-token--${token.kind}`}>{token.text}</span>;
}

export function JsonMessageValue({
  value,
  prettyJson,
  defaultCollapsed = true,
}: JsonMessageValueProps) {
  const raw = value ?? "";
  const json = isJsonText(raw);
  const [collapsed, setCollapsed] = useState(defaultCollapsed && json);

  const displayText = useMemo(() => {
    if (!prettyJson) return raw;
    return formatJsonIfPossible(raw);
  }, [raw, prettyJson]);

  const tokens = useMemo(() => {
    if (!json || !prettyJson) return null;
    return tokenizeJson(displayText);
  }, [json, prettyJson, displayText]);

  const preview = useMemo(() => jsonCollapsedPreview(raw), [raw]);

  if (!json) {
    return <pre className="message-card-value selectable-text">{raw}</pre>;
  }

  return (
    <div className="json-value">
      <div className="json-value-toolbar">
        <button
          type="button"
          className="json-collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          <span className="json-collapse-chevron" aria-hidden>
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="json-badge">JSON</span>
          {collapsed ? (
            <code className="json-preview selectable-text">{preview}</code>
          ) : (
            <span className="json-collapse-label">Свернуть</span>
          )}
        </button>
      </div>
      {!collapsed && (
        <pre className="message-card-value message-card-value--json selectable-text">
          {tokens
            ? tokens.map((token, index) => <TokenSpan key={index} token={token} />)
            : displayText}
        </pre>
      )}
    </div>
  );
}
