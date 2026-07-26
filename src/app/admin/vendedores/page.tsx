"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getAdminToken } from "@/lib/session";

type Vendedor = {
  id: string;
  nombre: string;
  whatsapp: string;
  estado: "pendiente" | "activo" | "suspendido";
  cupo: number;
  tickets_activos: number;
  fecha_registro: string;
};

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<Vendedor[] | null>(null);
  const [actualizando, setActualizando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const token = getAdminToken();
    const { data, error } = await supabase.rpc("admin_listar_vendedores", {
      p_admin_token: token,
    });
    if (!error && data) setVendedores(data as Vendedor[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiarEstado(id: string, estado: string) {
    setActualizando(id);
    const token = getAdminToken();
    await supabase.rpc("admin_actualizar_estado_vendedor", {
      p_admin_token: token,
      p_vendedor_id: id,
      p_estado: estado,
    });
    await cargar();
    setActualizando(null);
  }

  if (vendedores === null) {
    return (
      <div>
        <h1 className="page-title">Vendedores</h1>
        <div className="card">Cargando...</div>
      </div>
    );
  }

  const pendientes = vendedores.filter((v) => v.estado === "pendiente");
  const resto = vendedores.filter((v) => v.estado !== "pendiente");

  return (
    <div>
      <h1 className="page-title">Vendedores</h1>

      {pendientes.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, marginBottom: 8 }}>Solicitudes pendientes</h3>
          {pendientes.map((v) => (
            <div key={v.id} className="card">
              <div style={{ fontWeight: 700 }}>{v.nombre}</div>
              <div style={{ fontSize: 12, color: "#777" }}>{v.whatsapp}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  className="btn-primary"
                  disabled={actualizando === v.id}
                  onClick={() => cambiarEstado(v.id, "activo")}
                >
                  Aprobar
                </button>
                <button
                  className="btn-secondary"
                  disabled={actualizando === v.id}
                  onClick={() => cambiarEstado(v.id, "suspendido")}
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <h3 style={{ fontSize: 13, margin: "14px 0 8px" }}>Todos los vendedores</h3>
      {resto.length === 0 && <div className="card">Aún no hay vendedores aprobados.</div>}
      {resto.map((v) => (
        <div key={v.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{v.nombre}</div>
              <div style={{ fontSize: 12, color: "#777" }}>
                {v.whatsapp} · {v.tickets_activos}/{v.cupo} tickets
              </div>
            </div>
            <span className={`badge badge-${v.estado === "activo" ? "activo" : "apartado"}`}>
              {v.estado}
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            {v.estado === "activo" ? (
              <button
                className="btn-secondary"
                disabled={actualizando === v.id}
                onClick={() => cambiarEstado(v.id, "suspendido")}
              >
                Suspender
              </button>
            ) : (
              <button
                className="btn-primary"
                disabled={actualizando === v.id}
                onClick={() => cambiarEstado(v.id, "activo")}
              >
                Reactivar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
