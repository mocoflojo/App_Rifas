"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAdminToken } from "@/lib/session";
import { enlaceWhatsapp } from "@/lib/telefono";
import { mensajeError } from "@/lib/errores";

type Estado = "pendiente" | "activo" | "suspendido";

type Vendedor = {
  id: string;
  nombre: string;
  usuario: string | null;
  whatsapp: string;
  estado: Estado;
  cupo: number;
  tickets_activos: number;
  metas_cobradas: number;
  comision_pagada: number;
  fecha_registro: string;
};

type Filtro = "todos" | "activo" | "suspendido";

const META_TICKETS = 10;

/** Clave temporal legible: fácil de dictar por WhatsApp, sin caracteres ambiguos. */
function claveTemporal() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  const azar = (s: string) => s[Math.floor(Math.random() * s.length)];
  return (
    Array.from({ length: 4 }, () => azar(letras)).join("") +
    Array.from({ length: 3 }, () => azar(numeros)).join("")
  );
}

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Badge({ estado }: { estado: Estado }) {
  const estilos: Record<Estado, string> = {
    activo: "bg-estado-libre-bg text-estado-activo-bg",
    pendiente: "bg-estado-apartado-bg text-estado-apartado-fg",
    suspendido: "bg-surface-container-highest text-on-surface-variant",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${estilos[estado]}`}
    >
      {estado}
    </span>
  );
}

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<Vendedor[] | null>(null);
  const [actualizando, setActualizando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  /** Clave recién generada, para que el admin pueda enviarla por WhatsApp. */
  const [reseteo, setReseteo] = useState<{
    nombre: string;
    usuario: string;
    whatsapp: string;
    clave: string;
  } | null>(null);

  /* Se incrementa para volver a pedir la lista tras un cambio de estado. */
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase.rpc("admin_listar_vendedores", {
        p_admin_token: getAdminToken(),
      });
      // La guarda evita que una respuesta lenta pise a una posterior.
      if (!cancelado && !error && data) setVendedores(data as Vendedor[]);
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  async function cambiarEstado(id: string, estado: Estado) {
    setActualizando(id);
    await supabase.rpc("admin_actualizar_estado_vendedor", {
      p_admin_token: getAdminToken(),
      p_vendedor_id: id,
      p_estado: estado,
    });
    setActualizando(null);
    setRecarga((n) => n + 1);
  }

  async function restablecerClave(v: Vendedor) {
    setActualizando(v.id);
    const clave = claveTemporal();
    const { data, error } = await supabase.rpc("admin_resetear_clave_vendedor", {
      p_admin_token: getAdminToken(),
      p_vendedor_id: v.id,
      p_clave_nueva: clave,
    });
    setActualizando(null);
    if (error || !data) return;
    setReseteo({
      nombre: data.nombre,
      usuario: data.usuario ?? "",
      whatsapp: data.whatsapp ?? "",
      clave,
    });
  }

  async function eliminarVendedor(v: Vendedor) {
    if (!confirm(`¿Borrar a ${v.nombre}? Solo funciona si no tiene números ni pagos registrados.`)) {
      return;
    }
    setActualizando(v.id);
    const { error } = await supabase.rpc("admin_eliminar_vendedor", {
      p_admin_token: getAdminToken(),
      p_vendedor_id: v.id,
    });
    setActualizando(null);
    if (error) {
      alert(mensajeError(error));
      return;
    }
    setRecarga((n) => n + 1);
  }

  if (vendedores === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-mobile text-primary">Vendedores</h1>
        <div className="h-32 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  const pendientes = vendedores.filter((v) => v.estado === "pendiente");
  const aprobados = vendedores.filter((v) => v.estado !== "pendiente");
  const listados =
    filtro === "todos" ? aprobados : aprobados.filter((v) => v.estado === filtro);
  const totalActivos = vendedores.filter((v) => v.estado === "activo").length;
  const ticketsTotales = vendedores.reduce((s, v) => s + v.tickets_activos, 0);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-display-mobile text-primary">Vendedores</h1>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 rounded-xl bg-primary p-4 text-on-primary">
          <span className="text-label-caps uppercase opacity-80">Vendedores activos</span>
          <span className="text-display-mobile">{totalActivos}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-surface-container-low p-4">
          <span className="text-label-caps uppercase text-on-surface-variant">
            Tickets activos
          </span>
          <span className="text-display-mobile text-on-surface">{ticketsTotales}</span>
        </div>
      </div>

      {/* Solicitudes pendientes */}
      {pendientes.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-headline text-primary">Solicitudes pendientes</h2>
            <span className="flex size-6 items-center justify-center rounded-full bg-error text-[11px] font-bold text-on-error">
              {pendientes.length}
            </span>
          </div>

          {pendientes.map((v) => (
            <div
              key={v.id}
              className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-[0_10px_25px_rgba(26,82,118,0.05)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-estado-abonado-bg text-body-sm font-bold text-primary">
                  {iniciales(v.nombre)}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-body-lg font-semibold text-on-surface">
                    {v.nombre}
                  </span>
                  <span className="text-body-sm text-on-surface-variant">
                    {v.whatsapp}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={actualizando === v.id}
                  onClick={() => cambiarEstado(v.id, "activo")}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary text-body-lg font-semibold text-on-secondary transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[20px]">check</span>
                  Aprobar
                </button>
                <button
                  disabled={actualizando === v.id}
                  onClick={() => cambiarEstado(v.id, "suspendido")}
                  aria-label="Rechazar"
                  className="flex size-12 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        {(["todos", "activo", "suspendido"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-full px-4 py-2 text-label-caps uppercase transition-colors ${
              filtro === f
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant"
            }`}
          >
            {f === "todos" ? "Todos" : f === "activo" ? "Activos" : "Suspendidos"}
          </button>
        ))}
      </div>

      {/* Listado */}
      <section className="flex flex-col gap-3">
        {listados.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-low px-6 py-12 text-center">
            <span className="material-symbols-outlined text-[40px] text-outline">
              group_off
            </span>
            <p className="text-body-sm text-on-surface-variant">
              No hay vendedores en esta categoría.
            </p>
          </div>
        )}

        {listados.map((v) => {
          const enMeta = v.tickets_activos % META_TICKETS;
          const progreso = (enMeta / META_TICKETS) * 100;
          const suspendido = v.estado === "suspendido";

          return (
            <div
              key={v.id}
              className={`flex flex-col gap-3 rounded-xl p-4 ${
                suspendido
                  ? "bg-surface-container-low opacity-70"
                  : "bg-surface-container-lowest shadow-[0_10px_25px_rgba(26,82,118,0.05)]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex size-12 shrink-0 items-center justify-center rounded-full text-body-sm font-bold ${
                    suspendido
                      ? "bg-surface-container-highest text-on-surface-variant"
                      : "bg-primary text-on-primary"
                  }`}
                >
                  {iniciales(v.nombre)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-lg font-semibold text-on-surface">
                    {v.nombre}
                  </span>
                  <span className="flex items-center gap-1 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[16px]">
                      confirmation_number
                    </span>
                    {v.tickets_activos} de {v.cupo} tickets
                  </span>
                </div>
                <Badge estado={v.estado} />
              </div>

              {!suspendido && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-label-caps uppercase text-on-surface-variant">
                      Progreso de meta
                    </span>
                    <span className="text-body-sm font-bold text-primary">
                      {enMeta} / {META_TICKETS}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-surface-container-highest">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-primary to-secondary transition-all duration-700"
                      style={{ width: `${progreso}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-outline-variant/30 pt-3">
                <div className="flex flex-col">
                  <span className="text-label-caps uppercase text-on-surface-variant">
                    Comisión pagada
                  </span>
                  <span className="text-body-lg font-semibold text-on-surface">
                    ${Number(v.comision_pagada).toFixed(2)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={actualizando === v.id}
                    onClick={() => restablecerClave(v)}
                    title="Restablecer clave"
                    aria-label={`Restablecer la clave de ${v.nombre}`}
                    className="flex size-11 items-center justify-center rounded-lg border-2 border-outline-variant text-on-surface-variant transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      lock_reset
                    </span>
                  </button>
                  {v.tickets_activos === 0 && (
                    <button
                      disabled={actualizando === v.id}
                      onClick={() => eliminarVendedor(v)}
                      title="Borrar vendedor"
                      aria-label={`Borrar a ${v.nombre}`}
                      className="flex size-11 items-center justify-center rounded-lg border-2 border-error text-error transition-transform active:scale-[0.98] disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        delete
                      </span>
                    </button>
                  )}
                  <button
                    disabled={actualizando === v.id}
                    onClick={() =>
                      cambiarEstado(v.id, suspendido ? "activo" : "suspendido")
                    }
                    className={`flex h-11 items-center gap-2 rounded-lg px-4 text-body-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-60 ${
                      suspendido
                        ? "bg-secondary text-on-secondary"
                        : "border-2 border-outline-variant text-on-surface-variant"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {suspendido ? "restart_alt" : "block"}
                    </span>
                    {suspendido ? "Reactivar" : "Suspender"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {reseteo && (
        <ClaveRestablecida datos={reseteo} onCerrar={() => setReseteo(null)} />
      )}
    </div>
  );
}

/** La clave solo se ve aquí: en la base queda hasheada y no se puede recuperar. */
function ClaveRestablecida({
  datos,
  onCerrar,
}: {
  datos: { nombre: string; usuario: string; whatsapp: string; clave: string };
  onCerrar: () => void;
}) {
  const mensaje = `Hola ${datos.nombre}, tu acceso a la app de rifas quedó restablecido.\n\nUsuario: ${datos.usuario}\nClave: ${datos.clave}\n\nNo la compartas con nadie.`;
  const enlace = enlaceWhatsapp(datos.whatsapp, mensaje);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-xl bg-surface-container-lowest p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-headline text-primary">Clave restablecida</h2>
          <p className="text-body-sm text-on-surface-variant">
            Se cerraron las sesiones abiertas de {datos.nombre}.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg bg-surface-container p-4">
          <div className="flex justify-between text-body-sm">
            <span className="text-on-surface-variant">Usuario</span>
            <span className="font-semibold text-on-surface">{datos.usuario}</span>
          </div>
          <div className="flex justify-between text-body-sm">
            <span className="text-on-surface-variant">Clave nueva</span>
            <span className="font-mono text-body-lg font-bold text-primary">
              {datos.clave}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-estado-apartado-bg px-4 py-3 text-body-sm text-estado-apartado-fg">
          <span className="material-symbols-outlined text-[18px]">warning</span>
          Anótala o envíala ahora: al cerrar esta ventana no se puede volver a ver.
        </div>

        <a
          href={enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-14 items-center justify-center gap-2 rounded-lg bg-secondary text-body-lg font-semibold text-on-secondary shadow-lg transition-transform active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[20px]">chat</span>
          Enviar por WhatsApp
        </a>
        <button
          onClick={onCerrar}
          className="h-12 rounded-lg border-2 border-outline-variant text-body-sm font-semibold text-on-surface-variant"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
