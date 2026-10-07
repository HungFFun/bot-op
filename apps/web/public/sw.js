// Service worker: only Web Push for now (no offline caching, so a deploy is never hidden behind a stale cache).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Bam Thái', body: '', url: '/' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Not JSON: show the generic title.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-192.png',
      data: { url: data.url },
    }),
  );
});

// Tap: focus an open app window and navigate it, or open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const win = windows.find((w) => w.url.startsWith(self.location.origin));
      if (win) return win.focus().then(() => win.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
