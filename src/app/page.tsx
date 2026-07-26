"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRol, setRol, type Rol } from "@/lib/session";

export default function Entrada() {
  const router = useRouter();
  const [revisando, setRevisando] = useState(true);

  useEffect(() => {
    const rol = getRol();
    if (rol === "admin") router.replace("/admin/resumen");
    else if (rol === "vendedor") router.replace("/vendedor/resumen");
    else setRevisando(false);
  }, [router]);

  function entrarComo(rol: Rol) {
    setRol(rol);
    router.replace(rol === "admin" ? "/admin/resumen" : "/vendedor/resumen");
  }

  if (revisando) return null;

  return (
    <main className="app-shell">
      <div className="app-content" style={{ justifyContent: "center", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 className="page-title">App de Gestión de Rifas</h1>
        <p style={{ marginBottom: 8, color: "#777", fontSize: 12.5 }}>
          Selector temporal de Fase 1 — el registro real (código de invitación,
          aprobación del admin) se implementa en la Fase 2.
        </p>
        <button className="btn-primary" onClick={() => entrarComo("vendedor")}>
          Entrar como vendedor (demo)
        </button>
        <button className="btn-secondary" onClick={() => entrarComo("admin")}>
          Entrar como admin (demo)
        </button>
      </div>
    </main>
  );
}
