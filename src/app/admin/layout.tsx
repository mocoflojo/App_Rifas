"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, type NavItem } from "@/components/AppShell";
import { limpiarSesion, getAdminToken } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { aplicarVencimientos, type AlertasAdmin } from "@/lib/alertas";

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
  const [alertas, setAlertas] = useState<AlertasAdmin | null>(null);

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

  /* El barrido de vencimientos corre antes de contar: los avisos deben
     reflejar el estado ya al día, no el de antes de liberar los caducados. */
  useEffect(() => {
    if (!autorizado) return;
    let cancelado = false;
    (async () => {
      await aplicarVencimientos();
      const { data } = await supabase.rpc("admin_alertas", {
        p_admin_token: getAdminToken(),
      });
      if (!cancelado && data) setAlertas(data as AlertasAdmin);
    })();
    return () => {
      cancelado = true;
    };
  }, [autorizado]);

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

  const conAvisos = (items: NavItem[]) =>
    items.map((i) => {
      if (!alertas) return i;
      if (i.href === "/admin/confirmar")
        return { ...i, badge: alertas.por_confirmar };
      if (i.href === "/admin/vendedores")
        return { ...i, badge: alertas.metas_por_pagar + alertas.solicitudes };
      if (i.href === "/admin/vencimientos")
        return { ...i, badge: alertas.vencimientos };
      return i;
    });

  return (
    <AppShell
      titulo="Administración"
      usuario="Admin"
      items={conAvisos(principales)}
      itemsSecundarios={conAvisos(secundarias)}
      onSalir={salir}
    >
      {children}
    </AppShell>
  );
}
