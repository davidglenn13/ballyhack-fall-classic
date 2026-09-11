const C='ballyhack-scoring-v6-beta';
const STATIC=['styles.css','manifest.webmanifest','assets/goat-event-mark.png','assets/course.png','assets/ballyhack-logo.png'];
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c=>c.addAll(STATIC)));
});
self.addEventListener('activate',e=>{
  e.waitUntil(Promise.all([
    caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  const url=new URL(req.url);
  const isNavigation=req.mode==='navigate';
  const isScript=url.origin===self.location.origin && /\.(?:js|html)$/.test(url.pathname);
  if(isNavigation||isScript){
    e.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req)));
});
