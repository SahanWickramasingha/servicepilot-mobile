import { createHash } from 'node:crypto';
import type { DecisionEmailMessage } from '../../functions/src/domain/technicianDecisionEmailTypes';
import { ProviderError, type Env } from './runtime';

const mailbox = (value: string) => value.length <= 254 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
function base64(value: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
const mimeBody = (value: string) => base64(value).match(/.{1,76}/g)?.join('\r\n') ?? '';

function rawMessage(message: DecisionEmailMessage, key: string): string {
  if (!mailbox(message.from) || message.to.length !== 1 || !mailbox(message.to[0]) ||
    !message.subject || /[\r\n\x00]/.test(message.subject)) throw new ProviderError('email/request-failed');
  // Keep encoded words <= 75 and the first Subject line <= 78 characters,
  // without splitting a UTF-8 character.
  const words: string[] = [];
  let chunk = '';
  for (const character of message.subject) {
    if (new TextEncoder().encode(chunk + character).length > 42) { words.push(base64(chunk)); chunk = ''; }
    chunk += character;
  }
  if (chunk) words.push(base64(chunk));
  const identity = createHash('sha256').update(key).digest('hex');
  const boundary = 'sp_' + identity; // MIME boundaries must be <= 70 characters.
  const mime = [
    `From: ${message.from}`, `To: ${message.to[0]}`,
    `Subject: ${words.map(word => `=?UTF-8?B?${word}?=`).join('\r\n ')}`,
    // Stable correlation only: Gmail does NOT promise deduplication by Message-ID.
    `Message-ID: <servicepilot-${identity}@${message.from.split('@')[1]}>`,
    'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', mimeBody(message.text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', mimeBody(message.html),
    `--${boundary}--`, '',
  ].join('\r\n');
  return base64(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Uses the request's bounded transport; no SMTP, token persistence or automatic retries. */
export function gmailDecisionEmail(env: Env, transport: typeof fetch) {
  return async (message: DecisionEmailMessage, key: string): Promise<{ id: string }> => {
    if (!env.ADMIN_EMAIL_FROM || message.from.toLowerCase() !== env.ADMIN_EMAIL_FROM.toLowerCase()) {
      throw new ProviderError('email/request-failed');
    }
    const raw = rawMessage(message, key);
    let accessToken: string;
    try {
      const response = await transport('https://oauth2.googleapis.com/token', {
        method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.GMAIL_CLIENT_ID!,
          client_secret: env.GMAIL_CLIENT_SECRET!, refresh_token: env.GMAIL_REFRESH_TOKEN! }).toString(),
      });
      const token = await response.json() as { access_token?: unknown; token_type?: unknown };
      if (!response.ok || typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 8192 ||
        /[\s\x00-\x1f\x7f]/.test(token.access_token) || typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer') {
        throw new ProviderError('email/request-failed');
      }
      accessToken = token.access_token;
    } catch {
      // No Gmail send has been attempted: even an OAuth timeout is safe to retry.
      throw new ProviderError('email/request-failed');
    }
    let response: Response;
    try {
      // Explicit mailbox binds this request to the configured authorized sender.
      response = await transport(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(env.ADMIN_EMAIL_FROM)}/messages/send`, {
        method: 'POST', redirect: 'manual', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
    } catch { throw new ProviderError('email/outcome-unknown'); }
    const body = await response.json().catch(() => ({})) as { id?: unknown } | null;
    if (response.ok && typeof body?.id === 'string' && body.id.length > 0 && body.id.length <= 256) return { id: body.id };
    if ([400, 401, 403, 404, 429].includes(response.status)) throw new ProviderError('email/request-failed');
    // No idempotency contract: never automatically repeat a possibly accepted send.
    throw new ProviderError('email/outcome-unknown');
  };
}
