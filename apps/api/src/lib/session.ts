import { createHmac, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** How often an active session's last_seen/expiry is pushed forward. */
export const SESSION_TOUCH_MS = 60 * 60 * 1000;

export const newSessionToken = () => randomBytes(32).toString('base64url');

/** Only the HMAC of the token is stored, so a DB leak does not leak usable sessions. */
export const hashSessionToken = (token: string, secret: string) =>
  createHmac('sha256', secret).update(token).digest('hex');
