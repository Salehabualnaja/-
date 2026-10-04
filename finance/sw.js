/* Service Worker — الميزان
   يخزّن ملفات التطبيق ليعمل بدون اتصال، ويعرض تنبيهات المستحقات. */
const CACHE = "mizan-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./sms.js",
  "./manifest.webmanifest",
  "./fonts/tajawal-regular.ttf",
  "./fonts/tajawal-bold.ttf",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("mizan-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // صفحات التنقل (ومنها روابط المشاركة ?text=…) تُخدم من نسخة index.html المخزّنة
  const isNav = e.request.mode === "navigate";
  e.respondWith(
    caches.match(isNav ? "./index.html" : e.request, { ignoreSearch: isNav }).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(isNav ? "./index.html" : e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./?view=dues");
    })
  );
});
