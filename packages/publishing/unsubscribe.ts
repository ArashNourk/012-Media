import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Repository } from '../persistence/repository';

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s || s.length < 16) throw new Error('UNSUBSCRIBE_SECRET must be set (≥ 16 characters)');
  return s;
}

const mac = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

/** Signed, non-guessable unsubscribe token. Contains no email address. */
export function unsubscribeToken(subscriberId: string, publicationId: string, key = secret()): string {
  const payload = `${subscriberId}.${publicationId}`;
  return `${Buffer.from(payload).toString('base64url')}.${mac(payload, key)}`;
}

export function verifyUnsubscribeToken(token: string, key = secret()): { subscriberId: string; publicationId: string } | null {
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, 'base64url').toString();
  const expected = mac(payload, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [subscriberId, publicationId] = payload.split('.');
  return subscriberId && publicationId ? { subscriberId, publicationId } : null;
}

/** One-click unsubscribe handler body (used by the /unsubscribe endpoint and List-Unsubscribe-Post). */
export function handleUnsubscribe(repo: Repository, token: string, key = secret()): { ok: boolean; message: string } {
  const v = verifyUnsubscribeToken(token, key);
  if (!v) return { ok: false, message: 'This unsubscribe link is invalid.' };
  const sub = repo.getSubscriber(v.subscriberId);
  if (!sub) return { ok: false, message: 'This unsubscribe link is invalid.' };
  if (sub.status !== 'unsubscribed') repo.setSubscriberStatus(sub.id, 'unsubscribed', 'one-click unsubscribe');
  return { ok: true, message: 'You have been unsubscribed. No further editions will be sent.' };
}

export function unsubscribeUrl(baseUrl: string, subscriberId: string, publicationId: string, key = secret()): string {
  return `${baseUrl.replace(/\/$/, '')}/unsubscribe?token=${unsubscribeToken(subscriberId, publicationId, key)}`;
}
