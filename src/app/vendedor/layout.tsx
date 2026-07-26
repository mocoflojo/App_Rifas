"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav, type NavItem } from "@/components/BottomNav";
import { limpiarSesion, getDeviceToken } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const items: NavItem[] = [
  { href: "/vendedor/resumen", label: "Resumen", icon: "📊" },
  { href: "/vendedor/numeros", label: "Números", icon: "🔢" },
  { href: "/vendedor/clientes", label: "Clientes", icon: "👥" },
  { href: "/vendedor/agenda", label: "Agenda", icon: "📅" },
  { href: "/vendedor/logros", label: "Logros", icon: "🏆" },
];

type Estado = "verificando" | "pendiente" | "suspendido" | "no_registrado" | "activo";

export default function VendedorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [nombre, setNombre] = useState<string>("");

  useEffect(() => {
    let cancelado = false;
    async function verificar() {
      const { data, error } = await supabase.rpc("vendedor_por_device", {
        p_device_token: getDeviceToken(),
      });
      if (cancelado) return;
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
      <main className="app-shell">
        <div className="app-content" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 className="page-title">Solicitud enviada</h1>
          <div className="card">
            Hola {nombre}, tu registro está pendiente de aprobación por el admin.
            Vuelve a abrir la app más tarde.
          </div>
          <button className="btn-secondary" onClick={salir}>
            Salir
          </button>
        </div>
      </main>
    );
  }

  if (estado === "suspendido") {
    return (
      <main className="app-shell">
        <div className="app-content" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 className="page-title">Cuenta suspendida</h1>
          <div className="card">
            Tu acceso fue suspendido por el admin. Contáctalo si crees que es un error.
          </div>
          <button className="btn-secondary" onClick={salir}>
            Salir
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#888" }}>{nombre}</span>
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
