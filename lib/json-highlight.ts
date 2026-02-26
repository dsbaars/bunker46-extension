/**
 * Simple JSON syntax highlighting: tokenize a pretty-printed JSON string
 * into segments for colored display. No dependencies, safe (no HTML injection).
 */
export type JsonTokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation';

export type JsonToken = { type: JsonTokenType; text: string };

const PUNCT = /^[{}[\],:]/;
const STRING = /^"(?:[^"\\]|\\.)*"/;
const NUMBER = /^-?\d+\.?\d*([eE][+-]?\d+)?/;
const LITERAL = /^(true|false|null)/;

/**
 * Tokenize a JSON string into typed segments. Keys (quoted strings followed by colon) get type 'key'.
 * Leading and trailing whitespace is trimmed from the input before tokenizing.
 */
export function tokenizeJson(json: string): JsonToken[] {
  const trimmed = json.trim();
  const tokens: JsonToken[] = [];
  let i = 0;
  const n = trimmed.length;
  let nextIsKey = true; // at start of line or after comma we might see a key

  while (i < n) {
    const rest = trimmed.slice(i);
    const ws = /^\s+/.exec(rest);
    if (ws) {
      tokens.push({ type: 'punctuation', text: ws[0] });
      i += ws[0].length;
      continue;
    }

    const punct = PUNCT.exec(rest);
    if (punct) {
      const ch = punct[0];
      tokens.push({ type: 'punctuation', text: ch });
      i += ch.length;
      nextIsKey = ch === '{' || ch === ',' || ch === '[';
      continue;
    }

    const str = STRING.exec(rest);
    if (str) {
      const type = nextIsKey ? 'key' : 'string';
      tokens.push({ type, text: str[0] });
      i += str[0].length;
      // Peek: next non-ws is colon? Then we're a key and next value is not
      const after = trimmed.slice(i);
      const afterWs = /^\s*/.exec(after);
      const afterIdx = i + (afterWs?.[0].length ?? 0);
      nextIsKey = trimmed[afterIdx] === ':';
      continue;
    }

    const num = NUMBER.exec(rest);
    if (num) {
      tokens.push({ type: 'number', text: num[0] });
      i += num[0].length;
      nextIsKey = false;
      continue;
    }

    const lit = LITERAL.exec(rest);
    if (lit) {
      const val = lit[1];
      const type: JsonTokenType = val === 'null' ? 'null' : 'boolean';
      tokens.push({ type, text: val });
      i += val.length;
      nextIsKey = false;
      continue;
    }

    // fallback: single char so we don't hang
    tokens.push({ type: 'punctuation', text: rest[0] ?? '' });
    i += 1;
  }

  return tokens;
}
