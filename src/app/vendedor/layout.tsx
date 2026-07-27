"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, type NavItem } from "@/components/AppShell";
import { limpiarSesion, getVendedorToken } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const items: NavItem[] = [
  { href: "/vendedor/resumen", label: "Resumen", icon: "dashboard" },
  { href: "/vendedor/numeros", label: "Números", icon: "grid_view" },
  { href: "/vendedor/clientes", label: "Clientes", icon: "contacts" },
  { href: "/vendedor/agenda", label: "Agenda", icon: "calendar_month" },
  { href: "/vendedor/logros", label: "Logros", icon: "military_tech" },
];

type Estado = "verificando" | "pendiente" | "suspendido" | "no_registrado" | "activo";

/** Pantalla de bloqueo para vendedores no aprobados. */
function Aviso({
  icono,
  titulo,
  mensaje,
  tono,
  onSalir,
}: {
  icono: string;
  titulo: string;
  mensaje: string;
  tono: "espera" | "error";
  onSalir: () => void;
}) {
  const colores =
    tono === "espera"
      ? "bg-estado-apartado-bg text-estado-apartado-fg"
      : "bg-error-container text-on-error-container";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <div className={`flex size-20 items-center justify-center rounded-full ${colores}`}>
        <span className="material-symbols-outlined filled text-[36px]">{icono}</span>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-display-mobile text-primary">{titulo}</h1>
        <p className="max-w-sm text-body-lg text-on-surface-variant">{mensaje}</p>
      </div>
      <button
        onClick={onSalir}
        className="h-12 rounded-lg border-2 border-secondary px-8 text-body-lg font-semibold text-secondary transition-colors active:bg-secondary/10"
      >
        Salir
      </button>
    </main>
  );
}

export default function VendedorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    let cancelado = false;
    async function verificar() {
      const token = getVendedorToken();
      if (!token) {
        if (!cancelado) setEstado("no_registrado");
        return;
      }
      const { data, error } = await supabase.rpc("vendedor_por_sesion", {
        p_token: token,
      });
      if (cancelado) return;
      // Sin fila: el token expiró, se cerró la sesión o el admin la revocó.
      if (error || !data) {
        setEstado("no_registrado");
        return;
      }
      setNombre(data.nombre);
      setEstado(data.estado as Estado);
    }
    verificar();
    return () => {
      cancelado = true;
    };
  }, []);

  function salir() {
    const token = getVendedorToken();
    if (token) supabase.rpc("cerrar_sesion_vendedor", { p_token: token });
    limpiarSesion();
    router.replace("/");
  }

  if (estado === "verificando") return null;

  if (estado === "no_registrado") {
    limpiarSesion();
    router.replace("/");
    return null;
  }

  if (estado === "pendiente") {
    return (
      <Aviso
        icono="hourglass_top"
        titulo="Solicitud enviada"
        mensaje={`Hola ${nombre}, tu registro está pendiente de aprobación por el admin. Vuelve a abrir la app más tarde.`}
        tono="espera"
        onSalir={salir}
      />
    );
  }

  if (estado === "suspendido") {
    return (
      <Aviso
        icono="block"
        titulo="Cuenta suspendida"
        mensaje="Tu acceso fue suspendido por el admin. Contáctalo si crees que es un error."
        tono="error"
        onSalir={salir}
      />
    );
  }

  return (
    <AppShell titulo="Mis ventas" usuario={nombre} items={items} onSalir={salir}>
      {children}
    </AppShell>
  );
}
