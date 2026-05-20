self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const payload = event.data.json();
  const title = payload.title || "FlowerScan";
  const options = {
    body: payload.body || "",
    data: payload.data || { url: "/" },
    tag: payload.tag || "watering",
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then((clients) => {
        const existingClient = clients.find((client) => "focus" in client);
        if (existingClient) {
          return existingClient.focus();
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
