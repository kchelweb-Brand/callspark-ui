// Shows payment alerts for the owner's app, and opens the app on the right payment when tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let note = {};
  try {
    note = event.data ? event.data.json() : {};
  } catch (e) {
    note = { title: "Kchel Admin", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(note.title || "Kchel Admin", {
      body: note.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: note.tag || "kchel-admin",
      renotify: true,
      data: { url: note.url || "/admin/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.indexOf("/admin/app") !== -1 && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
