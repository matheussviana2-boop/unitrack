/* ══════════════════════════════════════════════════════
   UniTrack — Service Worker
   Atualização automática sem apagar o setor salvo no localStorage.
══════════════════════════════════════════════════════ */

const CACHE_VERSION = '1.2.0-filtro-setor';
const CACHE_NAME = 'unitrack-' + CACHE_VERSION;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

/* Instala a nova versão e a ativa sem esperar todas as abas fecharem. */
self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){
        // Um recurso ausente não impede todo o Service Worker de instalar.
        return Promise.all(
          PRECACHE_URLS.map(function(url){
            return cache.add(url).catch(function(error){
              console.warn('[SW] Não foi possível pré-cachear:', url, error);
            });
          })
        );
      })
      .then(function(){
        return self.skipWaiting();
      })
  );
});

/* Remove somente caches antigos do UniTrack e controla as telas abertas. */
self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames){
        return Promise.all(
          cacheNames
            .filter(function(name){
              return name.indexOf('unitrack-') === 0 && name !== CACHE_NAME;
            })
            .map(function(name){
              return caches.delete(name);
            })
        );
      })
      .then(function(){
        return self.clients.claim();
      })
  );
});

/* Permite solicitar ativação imediata manualmente, se necessário. */
self.addEventListener('message', function(event){
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

/* Network First:
   - páginas e arquivos buscam a versão nova primeiro;
   - offline usa o cache;
   - APIs nunca são interceptadas nem armazenadas. */
self.addEventListener('fetch', function(event){
  const request = event.request;

  if(request.method !== 'GET') return;

  const url = new URL(request.url);

  if(
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('aefsistemas') ||
    url.hostname.includes('run.app') ||
    url.hostname.includes('easycourse') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis')
  ){
    return;
  }

  // Navegação sempre tenta obter o HTML mais recente sem cache HTTP.
  if(request.mode === 'navigate'){
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(function(response){
          if(response && response.ok){
            const copy = response.clone();
            caches.open(CACHE_NAME).then(function(cache){
              cache.put('/index.html', copy);
            });
          }
          return response;
        })
        .catch(function(){
          return caches.match('/index.html')
            .then(function(cached){
              return cached || caches.match('/');
            });
        })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(function(response){
        if(
          response &&
          response.status === 200 &&
          response.type === 'basic' &&
          url.origin === self.location.origin
        ){
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){
            cache.put(request, copy);
          });
        }
        return response;
      })
      .catch(function(){
        return caches.match(request);
      })
  );
});
