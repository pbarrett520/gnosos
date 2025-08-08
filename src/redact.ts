const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const API_KEY_LIKE_RE = /(sk-[a-z0-9]{10,}|api[_-]?key[:=]\s*[a-z0-9-_]{10,})/gi;
const LONG_HEX_RE = /\b[a-f0-9]{16,}\b/gi;
const SSH_PATH_RE = /\/?[A-Za-z0-9_\-/.]*\.ssh\/[A-Za-z0-9_.\-]+/g;

export function redactSensitive(input: string): string {
  let out = input;
  out = out.replace(EMAIL_RE, "[REDACTED_EMAIL]");
  out = out.replace(API_KEY_LIKE_RE, "[REDACTED_KEY]");
  out = out.replace(LONG_HEX_RE, "[REDACTED_HEX]");
  out = out.replace(SSH_PATH_RE, "[REDACTED_SSH_PATH]");
  return out;
}
