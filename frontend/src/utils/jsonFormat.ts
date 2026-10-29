/** Pretty-print JSON if the text looks like JSON; otherwise return as-is. */
export function formatJsonIfPossible(text: string): string {
  const parsed = tryParseJson(text);
  if (parsed === undefined) return text;
  return JSON.stringify(parsed, null, 2);
}

/** Returns pretty JSON or throws if invalid. */
export function prettyPrintJson(text: string): string {
  return JSON.stringify(JSON.parse(text), null, 2);
}

export function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

export function isJsonText(text: string): boolean {
  return tryParseJson(text) !== undefined;
}

export function jsonCollapsedPreview(text: string): string {
  const parsed = tryParseJson(text);
  if (parsed === undefined) {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
  }
  if (Array.isArray(parsed)) {
    return `[ … ${parsed.length} ${plural(parsed.length, "элемент", "элемента", "элементов")} ]`;
  }
  if (parsed && typeof parsed === "object") {
    const keys = Object.keys(parsed as Record<string, unknown>);
    if (keys.length === 0) return "{ }";
    const preview = keys.slice(0, 3).join(", ");
    const more = keys.length > 3 ? `, +${keys.length - 3}` : "";
    return `{ ${preview}${more} }`;
  }
  return String(parsed);
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export type JsonTokenKind =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punct"
  | "plain";

export interface JsonToken {
  kind: JsonTokenKind;
  text: string;
}

/** Tokenize pretty-printed or compact JSON for syntax highlighting. */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const re =
    /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}\[\],:]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      tokens.push({ kind: "plain", text: text.slice(last, match.index) });
    }
    const full = match[0];
    if (match[1] !== undefined) {
      const keyPart = match[1];
      const colonPart = full.slice(keyPart.length);
      tokens.push({ kind: "key", text: keyPart });
      if (colonPart) tokens.push({ kind: "punct", text: colonPart });
    } else if (match[2] !== undefined) {
      tokens.push({ kind: "string", text: match[2] });
    } else if (/^-?\d/.test(full)) {
      tokens.push({ kind: "number", text: full });
    } else if (full === "true" || full === "false") {
      tokens.push({ kind: "boolean", text: full });
    } else if (full === "null") {
      tokens.push({ kind: "null", text: full });
    } else {
      tokens.push({ kind: "punct", text: full });
    }
    last = match.index + full.length;
  }
  if (last < text.length) {
    tokens.push({ kind: "plain", text: text.slice(last) });
  }
  return tokens;
}
