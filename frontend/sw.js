/**
 * WorkCred Service Worker (sw.js)
 * Scope: /
 *
 * Strategies:
 * 1. Precache shell assets & landing page (versioned cache).
 * 2. Runtime Cache-First for Google Fonts and static images (with max limits).
 * 3. Network-First with Offline Fallback for HTML navigations.
 *
 * EXCLUSION RULES (CRITICAL):
 * - NEVER cache /api requests.
 * - NEVER cache requests with Authorization header.
 * - NEVER cache ?dev=1 or dev inspector requests.
 */

const CACHE_VERSION = 'workcred-v1.0.0-phase-a';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/app/',
  '/app/index.html',
  '/app/manifest.webmanifest',
  '/css/tokens.css',
  '/css/landing.css',
  '/app/css/app.css',
  '/app/css/components.css',
  '/app/css/print.css',
  '/assets/workcred-mark.png',
  '/assets/icons/workcred-icon-192.png',
  '/assets/icons/workcred-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. DO NOT touch /api, authorization, or dev inspector
  if (
    url.pathname.startsWith('/api/') ||
    event.request.headers.has('Authorization') ||
    url.searchParams.get('dev') === '1'
  ) {
    return;
  }

  // 2. Navigation requests (HTML pages) -> Network first, fallback to cached app shell / offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        if (url.pathname.startsWith('/app') || url.pathname.startsWith('/p/')) {
          const shell = await cache.match('/app/index.html');
          if (shell) return shell;
        }
        const landing = await cache.match('/index.html');
        if (landing) return landing;

        // Inline minimal styled offline fallback page
        return new Response(
          `<!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>WorkCred · Offline</title>
            <link rel="stylesheet" href="/css/tokens.css">
            <style>
              body { background: #FAF6F0; color: #1B1715; font-family: sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; text-align: center; }
              .box { max-width: 24rem; background: #FFFDF9; border: 1px solid #E4DDD2; border-radius: 1rem; padding: 2rem; }
              h1 { font-family: serif; margin-top: 0; }
              a { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #C85A32; color: #FAF6F0; text-decoration: none; border-radius: 999px; font-weight: 600; }
            </style>
          </head>
          <body>
            <div class="box">
              <h1>You are offline</h1>
              <p>Your saved pages and verified Work Passport still work without an internet connection.</p>
              <a href="/app/#/c/saved">Go to saved pages</a>
            </div>
          </body>
          </html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      })
    );
    return;
  }

  // 3. Static Fonts & Images -> Cache First, update runtime cache
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    event.request.destination === 'image' ||
    event.request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkRes) => {
          if (networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // 4. Default: Stale-While-Revalidate for script/style assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkRes) => {
        if (networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return networkRes;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
