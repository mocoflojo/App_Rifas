import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RegistrarSW } from "@/components/RegistrarSW";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Rifas — Gestión de sorteos",
  description: "Gestión de rifas mensuales — vendedores y administración",
  applicationName: "Rifas",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Rifas",
    // iOS no lee theme_color del manifiesto: la barra de estado se configura
    // aquí o queda blanca sobre el header azul.
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    // Los números del talonario (#044) no son teléfonos: sin esto iOS los
    // convierte en enlaces de llamada dentro de la grilla.
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#003b5a",
  width: "device-width",
  initialScale: 1,
  // Instalada, la app no debe hacer zoom al tocar un campo: se comporta como
  // aplicación, no como página web.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.variable}>
      <head>
        {/* Next ya emite el meta moderno "mobile-web-app-capable", pero iOS
            solo lo entiende desde Safari 17.4. Este es el clásico, y es lo
            que hace que la app abra a pantalla completa en iPhones viejos. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* display=block a propósito: es una fuente de ligaduras, y con swap
            el usuario vería los nombres crudos de los iconos
            ("confirmation_number") hasta que cargue. Prefiero un instante
            sin icono a texto basura en pantalla. */}
        {/* eslint-disable-next-line @next/next/google-font-display, @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body>
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
