"use client";

import { BottomNav, type NavItem } from "@/components/BottomNav";
import { limpiarSesion } from "@/lib/session";
import { useRouter } from "next/navigation";

const items: NavItem[] = [
  { href: "/vendedor/resumen", label: "Resumen", icon: "📊" },
  { href: "/vendedor/numeros", label: "Números", icon: "🔢" },
  { href: "/vendedor/clientes", label: "Clientes", icon: "👥" },
  { href: "/vendedor/agenda", label: "Agenda", icon: "📅" },
  { href: "/vendedor/logros", label: "Logros", icon: "🏆" },
];

export default function VendedorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  function salir() {
    limpiarSesion();
    router.replace("/");
  }

  return (
    <div className="app-shell">
      <div className="app-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#888" }}>Vendedor (demo)</span>
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
