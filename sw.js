/* ══════════════════════════════════════════════════════
   UniTrack — Service Worker
   
   COMO USAR: a cada deploy, incremente CACHE_VERSION.
   Isso garante que o SW antigo seja descartado,
   os caches limpos e o app recarregue automaticamente.
══════════════════════════════════════════════════════ */

const CACHE_VERSION = 'v1.0.0'; // ← ALTERE A CADA DEPLOY (manter igual ao APP_VERSION do index.html)
const CACHE_NAME = 'unitrack-' + CACHE_VERSION;

// Arquivos essenciais para funcionar offline (opcional — adicione o que quiser cachear)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

/* ── INSTALL ── 
   Chamado quando o browser detecta que sw.js mudou (byte a byte).
   skipWaiting() força o novo SW a ativar IMEDIATAMENTE, sem esperar
   o usuário fechar todas as abas. */
self.addEventListener('install', function(event){
  console.log('[SW] Install — cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function(){
        // ESSENCIAL: força ativação imediata do novo SW
        return self.skipWaiting();
      })
  );
});

/* ── ACTIVATE ──
   Chamado quando o novo SW assume o controle.
   Apaga todos os caches antigos (versões anteriores). */
self.addEventListener('activate', function(event){
  console.log('[SW] Activate — limpando caches antigos...');
  event.waitUntil(
    caches.keys().then(function(cacheNames){
      return Promise.all(
        cacheNames
          .filter(function(name){ return name !== CACHE_NAME; })
          .map(function(name){
            console.log('[SW] Deletando cache antigo:', name);
            return caches.delete(name);
          })
      );
    }).then(function(){
      // ESSENCIAL: faz o novo SW controlar as abas abertas imediatamente
      return self.clients.claim();
    })
  );
});

/* ── FETCH ──
   Estratégia: Network First, fallback para cache.
   - Sempre tenta buscar a versão mais nova do servidor primeiro.
   - Se a rede falhar (offline), serve do cache.
   - Requisições de API (posicao, viagens, etc.) NUNCA são cacheadas
     (são dados em tempo real). */
self.addEventListener('fetch', function(event){
  const url = new URL(event.request.url);

  // Nunca cacheia chamadas de API / dados em tempo real
  if(url.hostname.includes('run.app') || 
     url.hostname.includes('aefsistemas') ||
     url.hostname.includes('easycourse') ||
     url.hostname.includes('firestore') ||
     url.hostname.includes('googleapis') ||
     url.pathname.startsWith('/api')){
    return; // deixa o fetch normal acontecer (sem interceptar)
  }

  // Para tudo mais: network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(function(response){
        // Se a resposta for válida, atualiza o cache
        if(response && response.status === 200 && response.type === 'basic'){
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache){
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(function(){
        // Offline: tenta servir do cache
        return caches.match(event.request);
      })
  );
});
