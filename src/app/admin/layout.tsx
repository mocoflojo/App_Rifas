"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, type NavItem } from "@/components/AppShell";
import { limpiarSesion, getAdminToken } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/* Diarias: van en la barra inferior. */
const principales: NavItem[] = [
  { href: "/admin/resumen", label: "Resumen", icon: "dashboard" },
  { href: "/admin/talonario", label: "Talonario", icon: "grid_view" },
  { href: "/admin/confirmar", label: "Confirmar", icon: "fact_check" },
  { href: "/admin/vendedores", label: "Vendedores", icon: "group" },
];

/* Periódicas: van en el menú "Más". */
const secundarias: NavItem[] = [
  { href: "/admin/vencimientos", label: "Vencimientos", icon: "schedule" },
  { href: "/admin/sorteo", label: "Sorteo", icon: "emoji_events" },
  { href: "/admin/historial", label: "Historial", icon: "history" },
  { href: "/admin/config", label: "Configuración", icon: "settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function verificar() {
      const token = getAdminToken();
      if (!token) {
        setAutorizado(false);
        return;
      }
      const { data } = await supabase.rpc("admin_token_valido", { p_token: token });
      if (!cancelado) setAutorizado(!!data);
    }
    verificar();
    return () => {
      cancelado = true;
    };
  }, []);

  function salir() {
    limpiarSesion();
    router.replace("/");
  }

  if (autorizado === null) return null;

  if (!autorizado) {
    limpiarSesion();
    router.replace("/");
    return null;
  }

  return (
    <AppShell
      titulo="Administración"
      usuario="Admin"
      items={principales}
      itemsSecundarios={secundarias}
      onSalir={salir}
    >
      {children}
    </AppShell>
  );
}
