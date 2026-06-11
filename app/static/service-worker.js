const CACHE_PREFIX = "chipmate-";
const CACHE_NAME = "chipmate-v0-5";
const CACHE_GROUPS = {
  appShell: [
    "/",
    "/static/index.html",
    "/static/styles.css",
    "/static/app.js",
    "/manifest.webmanifest",
    "/service-worker.js",
    "/static/icons/icon.svg",
  ],
  quickReference: [
    "/api/offline/quick-reference",
    "/api/categories",
    "/api/sources",
  ],
  handbook: [
    "/reference/machinery-handbook-27th.pdf",
  ],
};
const DEFAULT_CACHE_GROUPS = ["appShell"];
const OFFLINE_URLS = new Set(Object.values(CACHE_GROUPS).flat());

function sameOriginPath(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin ? `${url.pathname}${url.search}` : "";
}

function cacheRequest(url) {
  return new Request(url, { cache: "no-store", credentials: "same-origin" });
}

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(cacheRequest(url));
      if (!response.ok) throw new Error(`Could not cache ${url}`);
      await cache.put(url, response);
    }),
  );
}

async function cacheGroup(group) {
  const urls = CACHE_GROUPS[group];
  if (!urls) throw new Error(`Unknown cache group: ${group}`);
  await cacheUrls(urls);
}

async function groupIsCached(cache, urls) {
  const matches = await Promise.all(urls.map((url) => cache.match(url)));
  return matches.every(Boolean);
}

async function cacheStatus() {
  const cache = await caches.open(CACHE_NAME);
  const entries = await Promise.all(
    Object.entries(CACHE_GROUPS).map(async ([group, urls]) => [group, await groupIsCached(cache, urls)]),
  );
  return Object.fromEntries(entries);
}

async function clearOfflineCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all(DEFAULT_CACHE_GROUPS.map((group) => cacheGroup(group))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const message = event.data || {};
  const port = event.ports && event.ports[0];
  const reply = (payload) => {
    if (port) port.postMessage(payload);
  };

  event.waitUntil(
    (async () => {
      try {
        if (message.type === "CACHE_GROUP") {
          await cacheGroup(message.group);
          reply({ ok: true, groups: await cacheStatus() });
          return;
        }

        if (message.type === "CLEAR_OFFLINE_CACHE") {
          await clearOfflineCaches();
          reply({ ok: true, groups: await cacheStatus() });
          return;
        }

        if (message.type === "GET_CACHE_STATUS") {
          reply({ ok: true, groups: await cacheStatus() });
          return;
        }

        reply({ ok: false, error: "Unsupported service worker message." });
      } catch (error) {
        reply({ ok: false, error: error.message || "Offline cache action failed." });
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const path = sameOriginPath(request);
  if (!path) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        if (request.mode === "navigate") return caches.match("/");
        if (OFFLINE_URLS.has(path)) throw new Error("Offline asset is not cached.");
        throw new Error("Offline and no cached response available.");
      });
    }),
  );
});
