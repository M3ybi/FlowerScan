const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

export const isPushNotificationSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const getServiceWorkerRegistration = async () => {
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return registration;
};

const fetchPublicKey = async () => {
  const response = await fetch("/.netlify/functions/push-public-key");
  if (!response.ok) {
    throw new Error("Push notifikácie nie sú nakonfigurované na serveri.");
  }

  const data = (await response.json()) as { publicKey?: unknown };
  if (typeof data.publicKey !== "string" || !data.publicKey) {
    throw new Error("Server nevrátil verejný push kľúč.");
  }

  return data.publicKey;
};

export const subscribeToPushNotifications = async () => {
  if (!isPushNotificationSupported()) {
    throw new Error("Tento prehliadač nepodporuje push notifikácie.");
  }

  const permission = await window.Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Push notifikácie nie sú povolené v prehliadači.");
  }

  const [registration, publicKey] = await Promise.all([getServiceWorkerRegistration(), fetchPublicKey()]);
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      applicationServerKey: urlBase64ToUint8Array(publicKey),
      userVisibleOnly: true,
    }));

  const response = await fetch("/.netlify/functions/push-subscription", {
    body: JSON.stringify({ subscription }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Push subscription sa nepodarilo uložiť.");
  }

  return subscription;
};

export const unsubscribeFromPushNotifications = async () => {
  if (!isPushNotificationSupported()) {
    return;
  }

  const registration = await getServiceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  await fetch("/.netlify/functions/push-subscription", {
    body: JSON.stringify({ subscription }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  }).catch(() => undefined);
  await subscription.unsubscribe();
};
