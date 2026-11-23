const fallback = '/admin/notifications';
function safeLink(link) {
  if (typeof link !== 'string') return fallback;
  if (link === fallback || /^\/admin\/bookings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(link)) return link;
  return fallback;
}
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Use generic notification. */ }
  const id = typeof payload.id === 'string' && /^[0-9a-f-]{36}$/i.test(payload.id) ? payload.id : 'update';
  event.waitUntil(self.registration.showNotification('ETHN staff update', {
    body: 'You have a new staff notification.', tag: `ethn-${id}`,
    data: { link: safeLink(payload.link) },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(safeLink(event.notification.data?.link), self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(window => window.url === url);
    return existing ? existing.focus() : clients.openWindow(url);
  }));
});
