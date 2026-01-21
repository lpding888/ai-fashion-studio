import { createHash } from 'crypto';

const MAX_STRING_LEN = 4000;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 80;
const MAX_OBJECT_KEYS = 120;

function sha256Prefix(input: string, hexChars = 12) {
  try {
    return createHash('sha256').update(input).digest('hex').slice(0, hexChars);
  } catch {
    return 'unknown';
  }
}

function looksLikeBase64Payload(text: string) {
  const s = (text || '').trim();
  if (s.length < 200) return false;
  if (/\s/.test(s)) return false;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(s)) return false;
  return true;
}

function redactBase64(text: string) {
  const s = (text || '').trim();
  return `[REDACTED_BASE64 len=${s.length} sha256=${sha256Prefix(s)}]`;
}

function redactDataUrlBase64(text: string) {
  const s = (text || '').trim();
  const idx = s.indexOf(';base64,');
  if (idx === -1) return redactBase64(s);
  const prefix = s.slice(0, idx + ';base64,'.length);
  const base64Part = s.slice(idx + ';base64,'.length);
  return `${prefix}[REDACTED_BASE64 len=${base64Part.length} sha256=${sha256Prefix(base64Part)}]`;
}

function truncateLongString(text: string) {
  const s = String(text ?? '');
  if (s.length <= MAX_STRING_LEN) return s;
  const head = s.slice(0, 200);
  return `${head}…[TRUNCATED len=${s.length} sha256=${sha256Prefix(s)}]`;
}

function isSensitiveKey(key: string) {
  const k = key.toLowerCase();
  return (
    k === 'data' ||
    k.includes('base64') ||
    k.includes('inline_data') ||
    k.includes('inlinedata') ||
    k.includes('maskimage') ||
    k.includes('referenceimage') ||
    k.includes('imagebytes') ||
    k.includes('thoughtsignature')
  );
}

export function sanitizeLogValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const s = value.trim();
    if (s.startsWith('data:image/') && s.includes(';base64,'))
      return redactDataUrlBase64(s);
    if (looksLikeBase64Payload(s)) return redactBase64(s);
    return truncateLongString(value);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (value instanceof Error) {
    const stackOrMessage = value.stack || value.message || String(value);
    return truncateLongString(stackOrMessage);
  }

  // Buffer / Uint8Array
  const anyValue: any = value as any;
  if (anyValue && typeof anyValue === 'object') {
    if (
      typeof anyValue?.byteLength === 'number' &&
      anyValue?.constructor?.name
    ) {
      const name = String(anyValue.constructor.name);
      const len = Number(anyValue.byteLength);
      if (Number.isFinite(len) && len >= 0)
        return `[${name} byteLength=${len}]`;
    }

    if (seen.has(anyValue)) return '[Circular]';
    seen.add(anyValue);
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[Array depth>${MAX_DEPTH}]`;
    const out: unknown[] = [];
    const take = Math.min(value.length, MAX_ARRAY_ITEMS);
    for (let i = 0; i < take; i++) {
      out.push(sanitizeLogValue(value[i], depth + 1, seen));
    }
    if (value.length > take)
      out.push(`[...omitted ${value.length - take} items]`);
    return out;
  }

  if (typeof value === 'object') {
    if (depth >= MAX_DEPTH) return `[Object depth>${MAX_DEPTH}]`;

    const entries = Object.entries(value as Record<string, unknown>);
    const take = Math.min(entries.length, MAX_OBJECT_KEYS);
    const out: Record<string, unknown> = {};

    for (let i = 0; i < take; i++) {
      const [k, v] = entries[i];
      if (typeof v === 'string' && isSensitiveKey(k)) {
        const s = v.trim();
        out[k] =
          s.startsWith('data:image/') && s.includes(';base64,')
            ? redactDataUrlBase64(s)
            : redactBase64(s);
        continue;
      }
      out[k] = sanitizeLogValue(v, depth + 1, seen);
    }

    if (entries.length > take) {
      out.__omittedKeys = entries.length - take;
    }

    return out;
  }

  return truncateLongString(String(value));
}

export function safeStringifyLogMessage(message: unknown) {
  const sanitized = sanitizeLogValue(message);
  if (typeof sanitized === 'string') return sanitized;
  try {
    return JSON.stringify(sanitized);
  } catch {
    return String(sanitized);
  }
}
