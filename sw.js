// Minimal app-shell cache so the UI (not AI-generated images) opens instantly
// and can install as a PWA. Generated wallpapers always come fresh from the
// network — nothing about your prompts or images is cached or transmitted here.
const CACHE_NAME = 'wallpaper-ai-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/phones.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept the AI image API — always go to the network.
  if (url.hostname.endsWith('pollinations.ai')) return;

  // Only handle same-origin GET requests for the app shell.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
