/* Service worker de la app de rifas (§13, Fase 10).
 *
 * Objetivo: que la app abra rápido y no se quede en blanco si el teléfono
 * pierde señal un momento. NO cachea datos: los números, las ventas y las
 * comisiones siempre se piden a Supabase en vivo, porque servir un talonario
 * viejo llevaría a dos vendedores a creer que el mismo número está libre.
 */

const VERSION = "rifas-v1";
const ESENCIALES = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      // Si alguno falla (por ejemplo sin red al instalar), no se aborta todo.
      .then((cache) => Promise.allSettled(ESENCIALES.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;

  if (peticion.method !== "GET") return;

  const url = new URL(peticion.url);

  // Todo lo que va a Supabase (datos y realtime) pasa de largo: nunca se
  // cachea ni se responde desde caché.
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red primero para traer siempre la versión publicada más
  // reciente; si no hay red, se sirve lo último que se guardó.
  if (peticion.mode === "navigate") {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(peticion, copia));
          return respuesta;
        })
        .catch(() => caches.match(peticion).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Estáticos (JS, CSS, iconos): caché primero, que es lo que hace que la
  // app arranque instantánea en el celular.
  evento.respondWith(
    caches.match(peticion).then(
      (enCache) =>
        enCache ||
        fetch(peticion).then((respuesta) => {
          if (respuesta.ok && respuesta.type === "basic") {
            const copia = respuesta.clone();
            caches.open(VERSION).then((cache) => cache.put(peticion, copia));
          }
          return respuesta;
        })
    )
  );
});
