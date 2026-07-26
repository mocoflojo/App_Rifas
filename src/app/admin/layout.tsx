"use client";

import { BottomNav, type NavItem } from "@/components/BottomNav";
import { limpiarSesion } from "@/lib/session";
import { useRouter } from "next/navigation";

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

  function salir() {
    limpiarSesion();
    router.replace("/");
  }

  return (
    <div className="app-shell">
      <div className="app-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#888" }}>Admin (demo)</span>
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
