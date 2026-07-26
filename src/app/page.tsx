"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getRol, setRolAdmin, setRolVendedor, getDeviceToken } from "@/lib/session";

type Modo = "elegir" | "vendedor" | "admin";

export default function Entrada() {
  const router = useRouter();
  const [revisando, setRevisando] = useState(true);
  const [modo, setModo] = useState<Modo>("elegir");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [clave, setClave] = useState("");

  useEffect(() => {
    const rol = getRol();
    if (rol === "admin") router.replace("/admin/resumen");
    else if (rol === "vendedor") router.replace("/vendedor/resumen");
    else setRevisando(false);
  }, [router]);

  async function registrarVendedor(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { data, error } = await supabase.rpc("registrar_vendedor", {
      p_codigo: codigo.trim(),
      p_nombre: nombre.trim(),
      p_whatsapp: whatsapp.trim(),
      p_device_token: getDeviceToken(),
    });
    setCargando(false);
    if (error || !data) {
      setError(
        error?.message.includes("codigo_invalido")
          ? "Código de invitación incorrecto."
          : "No se pudo registrar. Intenta de nuevo."
      );
      return;
    }
    setRolVendedor(data.id);
    router.replace("/vendedor/resumen");
  }

  async function entrarAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { data, error } = await supabase.rpc("login_admin", { p_clave: clave });
    setCargando(false);
    if (error || !data) {
      setError("Clave incorrecta.");
      return;
    }
    setRolAdmin(data as string);
    router.replace("/admin/resumen");
  }

  if (revisando) return null;

  return (
    <main className="app-shell">
      <div
        className="app-content"
        style={{ justifyContent: "center", display: "flex", flexDirection: "column", gap: 16 }}
      >
        <h1 className="page-title">App de Gestión de Rifas</h1>

        {modo === "elegir" && (
          <>
            <button className="btn-primary" onClick={() => setModo("vendedor")}>
              Soy vendedor
            </button>
            <button className="btn-secondary" onClick={() => setModo("admin")}>
              Soy admin
            </button>
          </>
        )}

        {modo === "vendedor" && (
          <form onSubmit={registrarVendedor} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label>
              Código de invitación
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required style={inputStyle} />
            </label>
            <label>
              Nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required style={inputStyle} />
            </label>
            <label>
              WhatsApp
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required style={inputStyle} placeholder="+58..." />
            </label>
            {error && <p style={{ color: "#c0392b", fontSize: 12.5 }}>{error}</p>}
            <button className="btn-primary" type="submit" disabled={cargando}>
              {cargando ? "Enviando..." : "Registrarme"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setModo("elegir"); setError(null); }}>
              Volver
            </button>
          </form>
        )}

        {modo === "admin" && (
          <form onSubmit={entrarAdmin} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label>
              Clave maestra
              <input
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                required
                style={inputStyle}
              />
            </label>
            {error && <p style={{ color: "#c0392b", fontSize: 12.5 }}>{error}</p>}
            <button className="btn-primary" type="submit" disabled={cargando}>
              {cargando ? "Entrando..." : "Entrar"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setModo("elegir"); setError(null); }}>
              Volver
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: 10,
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 14,
};
