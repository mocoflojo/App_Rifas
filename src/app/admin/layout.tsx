"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav, type NavItem } from "@/components/BottomNav";
import { limpiarSesion, getAdminToken } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const items: NavItem[] = [
  { href: "/admin/resumen", label: "Resumen", icon: "📊" },
  { href: "/admin/talonario", label: "Talonario", icon: "🎟️" },
  { href: "/admin/confirmar", label: "Confirmar", icon: "✅" },
  { href: "/admin/vendedores", label: "Vendedores", icon: "👥" },
  { href: "/admin/vencimientos", label: "Vencim.", icon: "⏰" },
  { href: "/admin/sorteo", label: "Sorteo", icon: "🏍️" },
  { href: "/admin/historial", label: "Historial", icon: "📁" },
  { href: "/admin/config", label: "Config", icon: "⚙️" },
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
    <div className="app-shell">
      <div className="app-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#888" }}>Admin</span>
          <button onClick={salir} style={{ background: "none", border: "none", color: "#888", fontSize: 11 }}>
            Salir
          </button>
        </div>
        {children}
      </div>
      <BottomNav items={items} />
    </div>
  );
}
