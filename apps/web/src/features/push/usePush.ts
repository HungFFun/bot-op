import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '../../lib/api';

export type PushState =
  | 'loading'
  | 'unsupported' // no service worker / Push API, or plain http (needs https)
  | 'ios-install' // iPhone: Web Push only works from the Home Screen app
  | 'not-configured' // server has no VAPID key
  | 'denied' // user blocked notifications in browser settings
  | 'off'
  | 'on';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  const { key } = await api<{ key: string | null }>('/push/public-key');
  if (!key) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

export function usePush() {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    currentState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        setState('denied');
        return;
      }
      const { key } = await api<{ key: string | null }>('/push/public-key');
      if (!key) return setState('not-configured');
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(key),
        }));
      await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
      setState('on');
    } catch (err) {
      // Browser errors are English and technical ("Registration failed - permission denied").
      console.warn('push enable failed', err);
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Trình duyệt này không bật được thông báo. Trên iPhone hãy mở app từ màn hình chính; trên Android dùng Chrome.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState('off');
    } catch (err) {
      setError((err as Error).message || 'Không tắt được thông báo');
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable };
}
