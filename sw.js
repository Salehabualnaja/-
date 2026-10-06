/* Service Worker — مؤقت المشاريع
   يخزّن ملفات التطبيق ليعمل بدون اتصال بالإنترنت. */
const CACHE = "ptt-cache-v136";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// ═══ التذكيرات في الخلفية (أفضل جهد) ═══
// يقرأ الـ SW قائمة التذكيرات من IndexedDB (يكتبها التطبيق) ويطلق ما حان وقته
// عند استيقاظه عبر periodicsync / sync. توقيت التسليم يحدده المتصفح وليس مضموناً.
function idbOpenRem() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ptt-reminders", 1);
    req.onupgradeneeded = () => { req.result.createObjectStore("rems"); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGetRem(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("rems", "readonly");
    const rq = tx.objectStore("rems").get("all");
    rq.onsuccess = () => resolve(rq.result || null);
    rq.onerror = () => reject(rq.error);
  });
}
function idbPutRem(db, val) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("rems", "readwrite");
    tx.objectStore("rems").put(val, "all");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function parseHM(t) {
  const m = /^(\d{1,2}):?(\d{0,2})$/.exec((t || "").trim());
  let h = m ? +m[1] : 9, mi = m ? (+m[2] || 0) : 0;
  return [Math.min(23, Math.max(0, h)), Math.min(59, Math.max(0, mi))];
}
// نسخة مطابقة لدالة computeNextAt في التطبيق
function computeNextAt(rem) {
  const now = new Date(); const [h, mi] = parseHM(rem.time); let d = new Date(now);
  if (rem.recurrence === "daily") { d.setHours(h, mi, 0, 0); if (d <= now) d.setDate(d.getDate() + 1); }
  else if (rem.recurrence === "weekly") {
    const days = (rem.weekdays && rem.weekdays.length) ? rem.weekdays : [typeof rem.weekday === "number" ? rem.weekday : 6];
    let best = Infinity;
    for (const wd of days) {
      const cand = new Date(now); cand.setHours(h, mi, 0, 0);
      let add = (wd - cand.getDay() + 7) % 7; if (add === 0 && cand <= now) add = 7;
      cand.setDate(cand.getDate() + add);
      if (cand.getTime() < best) best = cand.getTime();
    }
    return best;
  }
  else if (rem.recurrence === "monthly") { const day = Math.min(28, Math.max(1, rem.monthday || 1)); d.setDate(day); d.setHours(h, mi, 0, 0); if (d <= now) { d.setMonth(d.getMonth() + 1); d.setDate(day); } }
  else { if (rem.date) { const p = rem.date.split("-").map(Number); d = new Date(now.getFullYear(), p[1] - 1, p[2], h, mi, 0, 0); if (d <= now) d.setFullYear(d.getFullYear() + 1); } else { d.setHours(h, mi, 0, 0); if (d <= now) d.setFullYear(d.getFullYear() + 1); } }
  return d.getTime();
}
async function checkAndFireReminders() {
  try {
    if (self.Notification && self.Notification.permission !== "granted") return;
    const db = await idbOpenRem();
    const rec = await idbGetRem(db);
    if (!rec || !Array.isArray(rec.list)) { db.close(); return; }
    const now = Date.now(); let changed = false;
    for (const rem of rec.list) {
      if (!rem.nextAt) { rem.nextAt = computeNextAt(rem); changed = true; }
      if (now >= rem.nextAt) {
        await self.registration.showNotification("🔔 تذكير: " + rem.name, {
          body: rem.note ? rem.note : "حان وقت المتابعة",
          icon: "./icons/icon-192.png", badge: "./icons/icon-192.png",
          tag: "rembg-" + rem.id
        });
        rem.nextAt = computeNextAt(rem); changed = true;
      }
    }
    if (changed) await idbPutRem(db, rec);
    db.close();
  } catch (_) {}
}
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "ptt-reminders") e.waitUntil(checkAndFireReminders());
});
self.addEventListener("sync", (e) => {
  if (e.tag === "ptt-reminders") e.waitUntil(checkAndFireReminders());
});
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "rems-updated") e.waitUntil(checkAndFireReminders());
});

// عند النقر على إشعار تذكير: افتح/ركّز التطبيق
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
