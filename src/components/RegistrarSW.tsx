"use client";

import { useEffect } from "react";

/** Registra el service worker. En desarrollo no se registra: cachear los
 *  bundles de Turbopack obligaría a limpiar el navegador tras cada cambio. */
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Sin service worker la app funciona igual, solo arranca más lenta. */
      });
    };

    // Después de load: registrar durante la carga inicial le quita ancho de
    // banda a lo que el usuario está esperando ver.
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);

  return null;
}
