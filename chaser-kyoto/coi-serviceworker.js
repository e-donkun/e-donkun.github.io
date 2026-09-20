/*
 * Minimal cross-origin-isolation shim.
 *
 * Why this file exists: to run Python bots with plain synchronous method
 * calls (no `await`), the Pyodide worker needs a SharedArrayBuffer so it can
 * block (Atomics.wait) until the main thread supplies a result. Browsers only
 * hand out SharedArrayBuffer on pages that are "cross-origin isolated", which
 * normally requires the server to send Cross-Origin-Opener-Policy and
 * Cross-Origin-Embedder-Policy response headers. Static hosts like GitHub
 * Pages can't set custom headers, so this Service Worker intercepts the
 * page's own requests and injects those headers itself.
 *
 * This file plays two roles depending on how it's loaded:
 *  - included as a normal <script>, it registers itself as a Service Worker;
 *  - loaded BY THE BROWSER as that Service Worker, it rewrites responses.
 * If registration isn't possible (unsupported browser, non-secure context,
 * opened via file://), it silently does nothing and the app falls back to
 * its `await`-based async mode -- see index.html.
 */
if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response.status === 0) return response;
          const headers = new Headers(response.headers);
          headers.set("Cross-Origin-Embedder-Policy", "require-corp");
          headers.set("Cross-Origin-Opener-Policy", "same-origin");
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        })
        .catch((err) => new Response("coi-serviceworker fetch failed: " + err, { status: 500 }))
    );
  });
} else {
  (async () => {
    if (window.crossOriginIsolated) return;
    if (!window.isSecureContext) return;
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register(document.currentScript.src);
      if (navigator.serviceWorker.controller) return;
      const worker = reg.installing || reg.waiting || reg.active;
      if (!worker) return;
      if (worker.state === "activated") { window.location.reload(); return; }
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") window.location.reload();
      });
    } catch (e) {
      console.warn("coi-serviceworker registration failed:", e);
    }
  })();
}
