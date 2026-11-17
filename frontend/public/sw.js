// Service worker do Clima Escritório: guarda a interface para abrir sem rede. A API nunca vai para o cache.
const VERSAO = 'clima-escritorio-v5'
const BASICO = ['/', '/manifest.webmanifest', '/icone-192.png', '/icone-512.png', '/icone.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASICO)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  if (/^\/(api|alexa|oauth|saude)/.test(url.pathname)) return // dados sempre ao vivo
  if (req.mode === 'navigate') {
    // páginas: rede primeiro, cópia guardada se estiver offline
    // só guarda a página que abriu certinho (erro, manutenção e portão não viram a cópia offline)
    e.respondWith(fetch(req).then((r) => { if (r.ok && r.type === 'basic') { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put('/', copia)) } return r }).catch(() => caches.match('/')))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    // arquivos com hash no nome: cache primeiro
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); return r })))
    return
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)))
})
