// firebase-messaging-sw.js
// Service Worker para notificaciones push con Firebase Cloud Messaging

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC9xmsKpvF0-uAVv3Ty2oDPIEk38loac28",
  authDomain: "pagos-app-4397f.firebaseapp.com",
  projectId: "pagos-app-4397f",
  storageBucket: "pagos-app-4397f.firebasestorage.app",
  messagingSenderId: "469469494810",
  appId: "1:469469494810:web:7d683bbef7b530c46e1ba3",
});

const messaging = firebase.messaging();

// Notificaciones cuando la app está en BACKGROUND o cerrada
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || '💰 PagosApp', {
    body: body || 'Tenés cuentas por vencer',
    icon: icon || '/icon.svg',
    badge: '/icon.svg',
    tag: payload.data?.billId || 'pagos-reminder',
    data: payload.data,
    actions: [
      { action: 'open', title: '📋 Ver cuentas' },
      { action: 'dismiss', title: 'Cerrar' }
    ]
  });
});

// Click en la notificación → abrir la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
