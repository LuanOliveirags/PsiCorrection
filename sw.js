/* ═══════════════════════════════════════════════════════════════
   PsiCorrection — Service Worker
   Estratégia: Network-first para recursos dinâmicos (Firebase),
               Cache-first para assets estáticos (CSS, JS, fontes).
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'psicorrection-v1';

// Assets estáticos que serão cacheados na instalação
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './img/Psi.png',
  './css/layout/Pallettes/palette_global.css',
  './css/layout/menu.css',
  './css/style.css',
  './css/base/responsive.css',
  './css/neupsilin/style.css',
  './css/wisc/style.css',
  './css/pacientes/db_pacientes.css',
  './css/bfp/style.css',
  './js/script.js',
  './js/db.js',
  './js/firebase-config.js',
  './js/normas.js',
  './js/bfp/avaliacao.js',
  './js/bfp/normas.js',
  './js/db_pacientes/db_pacientes.js',
  './js/neupsilin/avaliacao.js',
  './js/neupsilin/avaliacao-inf.js',
  './js/neupsilin/normas.js',
  './js/neupsilin/normas-inf.js',
  './js/wisc/avaliacao.js',
  './js/wisc/normas.js'
];

// ── Instalação: pré-cacheia assets estáticos ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Ativação: remove caches antigos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: Network-first para Firebase/CDN, Cache-first para assets locais ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Deixa passar sem cache: Firebase, CDNs externos e chrome-extension
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('jsdelivr.net') ||
    url.protocol === 'chrome-extension:'
  ) {
    return; // Rede pura — não intercepta
  }

  // Assets locais: Cache-first, fallback para rede
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Cacheia a resposta bem-sucedida de assets locais
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => {
        // Fallback offline: retorna index.html para navegação
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
  );
});
