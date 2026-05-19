const CACHE_NAME = 'unitrack-v3';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/icons/icon-192x192.png', '/icons/icon-512x512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
  self.clients.claim();
});

// ── Responde ao SKIP_WAITING enviado pelo index.html quando há atualização pronta
// Permite que a nova versão assuma o controle imediatamente, sem fechar o app
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // NUNCA cachear chamadas de API — sempre busca da rede com headers anti-cache
  if(url.pathname.startsWith('/api/') ||
     url.pathname.includes('/posicao') ||
     url.pathname.includes('/viagens') ||
     url.href.includes('aefsistemas') ||
     url.href.includes('brasilsat') ||
     url.href.includes('nominatim') ||
     url.href.includes('arcgis')){
    event.respondWith(
      fetch(event.request, {
        cache: 'no-store',
        headers: new Headers({
          ...Object.fromEntries(event.request.headers.entries()),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }),
      }).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Tiles do mapa — cache com fallback
  if(url.href.includes('tile') || url.href.includes('carto')){
    event.respondWith(caches.match(event.request).then(c=>c||fetch(event.request).then(r=>{
      const cl=r.clone();caches.open(CACHE_NAME).then(ca=>ca.put(event.request,cl));return r;
    })).catch(()=>new Response('',{status:503})));
    return;
  }

  // Assets estáticos — cache first
  event.respondWith(caches.match(event.request).then(c=>{
    if(c)return c;
    return fetch(event.request).then(r=>{
      if(r.ok){const cl=r.clone();caches.open(CACHE_NAME).then(ca=>ca.put(event.request,cl));}return r;
    });
  }).catch(()=>caches.match('/index.html')));
});
