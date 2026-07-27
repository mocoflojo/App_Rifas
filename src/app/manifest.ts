import type { MetadataRoute } from "next";

/** Manifiesto de la PWA (§13, Fase 10). Next lo sirve en /manifest.webmanifest
 *  y lo enlaza solo desde el <head>. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rifas — Gestión de sorteos",
    short_name: "Rifas",
    description:
      "Talonario, ventas y comisiones de la rifa mensual, para el equipo de vendedores y la banca.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fcf9f8",
    theme_color: "#003b5a",
    lang: "es",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Los "maskable" traen el arte más pequeño y centrado: Android recorta
      // el icono a la forma de su lanzador y sin este margen se come el logo.
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
