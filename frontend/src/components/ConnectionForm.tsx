import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { ConnectionConfig } from "../types";
import {
  clearRecentServers,
  createConnection,
  getPreferences,
  rememberConnection,
  removeRecentServer,
  testConnection,
} from "../api/client";

const DEFAULT_CONFIG: ConnectionConfig = {
  bootstrap_servers: "localhost:9092",
  security_protocol: "PLAINTEXT",
  sasl_mechanism: null,
  sasl_username: null,
  sasl_password: null,
  ssl_ca_pem: null,
};

interface ConnectionFormProps {
  onConnected: (connectionId: string, config: ConnectionConfig) => void;
  onDisconnect: () => void;
  connectionId: string | null;
  loading: boolean;
}

export function ConnectionForm({
  onConnected,
  onDisconnect,
  connectionId,
  loading,
}: ConnectionFormProps) {
  const [config, setConfig] = useState<ConnectionConfig>(DEFAULT_CONFIG);
  const [recentServers, setRecentServers] = useState<string[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const datalistId = "kafka-bootstrap-history";
  const recentOptions = useMemo(() => recentServers, [recentServers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = await getPreferences();
        if (cancelled) return;
        if (prefs.last_config?.bootstrap_servers) {
          setConfig({ ...DEFAULT_CONFIG, ...prefs.last_config });
        }
        setRecentServers(prefs.recent_servers ?? []);
      } catch {
        // keep defaults if API unavailable
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (patch: Partial<ConnectionConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const buildPayload = (): ConnectionConfig => {
    const payload: ConnectionConfig = {
      bootstrap_servers: config.bootstrap_servers.trim(),
      security_protocol: config.security_protocol,
    };
    if (config.sasl_mechanism) payload.sasl_mechanism = config.sasl_mechanism;
    if (config.sasl_username) payload.sasl_username = config.sasl_username;
    if (config.sasl_password) payload.sasl_password = config.sasl_password;
    if (config.ssl_ca_pem?.trim()) payload.ssl_ca_pem = config.ssl_ca_pem.trim();
    return payload;
  };

  const persistConnection = async (payload: ConnectionConfig) => {
    try {
      const prefs = await rememberConnection(payload);
      setRecentServers(prefs.recent_servers ?? []);
      if (prefs.last_config) {
        setConfig({ ...DEFAULT_CONFIG, ...prefs.last_config });
      }
    } catch {
      // non-fatal: connection itself still works
    }
  };

  const handleRemoveServer = async (server: string, event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    try {
      const prefs = await removeRecentServer(server);
      setRecentServers(prefs.recent_servers ?? []);
      if (
        config.bootstrap_servers.trim().toLowerCase() === server.trim().toLowerCase()
      ) {
        setConfig((prev) => ({
          ...prev,
          bootstrap_servers: prefs.last_config?.bootstrap_servers ?? "localhost:9092",
        }));
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Не удалось удалить адрес",
      });
    }
  };

  const handleClearServers = async () => {
    try {
      const prefs = await clearRecentServers();
      setRecentServers(prefs.recent_servers ?? []);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Не удалось очистить историю",
      });
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const payload = buildPayload();
      const result = await testConnection(payload);
      await persistConnection(payload);
      setMessage({ type: "success", text: result.message });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const payload = buildPayload();
      const result = await createConnection(payload);
      await persistConnection(payload);
      setMessage({ type: "success", text: "Подключено" });
      onConnected(result.connection_id, payload);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = busy || loading || !prefsLoaded;

  return (
    <section className="panel">
      <h2>
        Подключение к Kafka
        {connectionId && <span className="connected-badge">Подключено</span>}
      </h2>

      <div className="form-row">
        <label htmlFor="bootstrap">Адрес Kafka (bootstrap.servers)</label>
        <input
          id="bootstrap"
          type="text"
          list={datalistId}
          placeholder="localhost:9092"
          value={config.bootstrap_servers}
          onChange={(e) => update({ bootstrap_servers: e.target.value })}
          disabled={!!connectionId}
          autoComplete="on"
        />
        <datalist id={datalistId}>
          {recentOptions.map((server) => (
            <option key={server} value={server} />
          ))}
        </datalist>
        {recentOptions.length > 0 && !connectionId && (
          <div className="recent-servers">
            {recentOptions.map((server) => (
              <div key={server} className="recent-server-chip">
                <button
                  type="button"
                  className="recent-server-chip-select"
                  onClick={() => update({ bootstrap_servers: server })}
                  title={server}
                >
                  {server}
                </button>
                <button
                  type="button"
                  className="recent-server-chip-remove"
                  onClick={(e) => handleRemoveServer(server, e)}
                  title={`Удалить ${server}`}
                  aria-label={`Удалить ${server}`}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="recent-servers-clear"
              onClick={handleClearServers}
            >
              Очистить все
            </button>
          </div>
        )}
      </div>

      <details className="details-toggle">
        <summary>Дополнительные настройки</summary>
        <div className="advanced-settings">
          <div className="form-row">
            <label htmlFor="protocol">Security protocol</label>
            <select
              id="protocol"
              value={config.security_protocol}
              onChange={(e) => update({ security_protocol: e.target.value })}
              disabled={!!connectionId}
            >
              <option value="PLAINTEXT">PLAINTEXT</option>
              <option value="SSL">SSL</option>
              <option value="SASL_PLAINTEXT">SASL_PLAINTEXT</option>
              <option value="SASL_SSL">SASL_SSL</option>
            </select>
          </div>

          <div className="form-row">
            <label htmlFor="sasl-mechanism">SASL mechanism</label>
            <select
              id="sasl-mechanism"
              value={config.sasl_mechanism ?? ""}
              onChange={(e) => update({ sasl_mechanism: e.target.value || null })}
              disabled={!!connectionId}
            >
              <option value="">—</option>
              <option value="PLAIN">PLAIN</option>
              <option value="SCRAM-SHA-256">SCRAM-SHA-256</option>
              <option value="SCRAM-SHA-512">SCRAM-SHA-512</option>
            </select>
          </div>

          <div className="form-row">
            <label htmlFor="sasl-user">SASL username</label>
            <input
              id="sasl-user"
              type="text"
              value={config.sasl_username ?? ""}
              onChange={(e) => update({ sasl_username: e.target.value || null })}
              disabled={!!connectionId}
            />
          </div>

          <div className="form-row">
            <label htmlFor="sasl-pass">SASL password</label>
            <input
              id="sasl-pass"
              type="password"
              value={config.sasl_password ?? ""}
              onChange={(e) => update({ sasl_password: e.target.value || null })}
              disabled={!!connectionId}
            />
          </div>

          <div className="form-row">
            <label htmlFor="ssl-ca">SSL CA certificate (PEM)</label>
            <textarea
              id="ssl-ca"
              placeholder="-----BEGIN CERTIFICATE-----..."
              value={config.ssl_ca_pem ?? ""}
              onChange={(e) => update({ ssl_ca_pem: e.target.value || null })}
              disabled={!!connectionId}
            />
          </div>
        </div>
      </details>

      <div className="button-row">
        {!connectionId ? (
          <>
            <button className="btn-secondary" onClick={handleTest} disabled={isDisabled}>
              Проверить
            </button>
            <button className="btn-primary" onClick={handleConnect} disabled={isDisabled}>
              Подключиться
            </button>
          </>
        ) : (
          <button className="btn-danger" onClick={onDisconnect} disabled={isDisabled}>
            Отключиться
          </button>
        )}
      </div>

      {message && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}
    </section>
  );
}
