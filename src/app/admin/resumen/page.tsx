"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getAdminToken } from "@/lib/session";

type Resumen = {
  mes_actual: string;
  tickets_activos: number;
  total_vendido: number;
  numeros_banca: number;
  dias_para_sorteo: number;
  vendedores_activos: number;
  comisiones_pagadas: number;
};

type Alertas = {
  por_confirmar: number;
  vencimientos: number;
  metas_por_pagar: number;
  solicitudes: number;
};

type Colectivo = { activos: number; meta: number; alcanzada: boolean };

const dinero = (n: number) => `$${Number(n).toFixed(2)}`;

/** Tarjeta de dato con el icono en un chip de color, como en el mockup
 *  del panel de control. */
function Cifra({
  icono,
  etiqueta,
  valor,
  chip,
  valorClase = "text-on-surface",
}: {
  icono: string;
  etiqueta: string;
  valor: string;
  chip: string;
  valorClase?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-4 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
      <div className="flex items-center gap-2">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${chip}`}
        >
          <span className="material-symbols-outlined filled text-[16px]">
            {icono}
          </span>
        </span>
        <span className="text-label-caps uppercase leading-tight text-on-surface-variant">
          {etiqueta}
        </span>
      </div>
      <span className={`text-display-mobile ${valorClase}`}>{valor}</span>
    </div>
  );
}

const TONOS_ALERTA = {
  rojo: {
    circulo: "bg-error-container text-error",
    borde: "border-error",
  },
  ambar: {
    circulo: "bg-estado-apartado-bg text-estado-apartado-fg",
    borde: "border-status-pending",
  },
  verde: {
    circulo: "bg-estado-libre-bg text-estado-activo-bg",
    borde: "border-estado-libre-fg",
  },
  azul: {
    circulo: "bg-estado-abonado-bg text-primary",
    borde: "border-primary-container",
  },
} as const;

function Alerta({
  href,
  icono,
  cantidad,
  texto,
  detalle,
  tono,
}: {
  href: string;
  icono: string;
  cantidad: number;
  texto: string;
  detalle: string;
  tono: keyof typeof TONOS_ALERTA;
}) {
  if (cantidad === 0) return null;
  const t = TONOS_ALERTA[tono];
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border-l-4 bg-surface-container-lowest p-4 shadow-sm transition-transform active:scale-[0.99] ${t.borde}`}
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-full ${t.circulo}`}
      >
        <span className="material-symbols-outlined filled text-[20px]">
          {icono}
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-lg font-semibold text-on-surface">
          {cantidad} {texto}
        </span>
        <span className="truncate text-body-sm text-on-surface-variant">
          {detalle}
        </span>
      </div>
      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
        chevron_right
      </span>
    </Link>
  );
}

export default function ResumenAdminPage() {
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [alertas, setAlertas] = useState<Alertas | null>(null);
  const [colectivo, setColectivo] = useState<Colectivo | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const token = getAdminToken();
      const [r, a, c] = await Promise.all([
        supabase.rpc("admin_resumen_mes", { p_admin_token: token }),
        supabase.rpc("admin_alertas", { p_admin_token: token }),
        supabase.rpc("admin_progreso_colectivo", { p_admin_token: token }),
      ]);
      if (cancelado) return;
      if (r.data) setDatos(r.data as Resumen);
      if (a.data) setAlertas(a.data as Alertas);
      if (c.data) setColectivo(c.data as Colectivo);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-mobile text-primary">Resumen del mes</h1>
        <div className="h-44 animate-pulse rounded-xl bg-surface-container" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container" />
          ))}
        </div>
      </div>
    );
  }

  const progresoColectivo = colectivo
    ? Math.min((colectivo.activos / colectivo.meta) * 100, 100)
    : 0;
  const faltanColectivo = colectivo
    ? Math.max(colectivo.meta - colectivo.activos, 0)
    : 0;
  const totalAlertas = alertas
    ? alertas.por_confirmar +
      alertas.vencimientos +
      alertas.metas_por_pagar +
      alertas.solicitudes
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label-caps uppercase text-secondary">
          {datos.mes_actual}
        </span>
        <h1 className="text-display-mobile text-primary">Resumen del mes</h1>
      </div>

      {/* Meta colectiva — tarjeta principal, como la meta del vendedor */}
      {colectivo && (
        <section
          className={`relative flex flex-col gap-3 overflow-hidden rounded-xl p-6 shadow-xl ${
            colectivo.alcanzada
              ? "bg-estado-activo-bg text-estado-activo-fg"
              : "bg-primary text-on-primary"
          }`}
        >
          <span className="material-symbols-outlined filled pointer-events-none absolute -right-5 -top-5 text-[128px] opacity-10">
            groups
          </span>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-headline">Meta colectiva</span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-label-caps uppercase">
              {colectivo.alcanzada ? "Bonos liberados" : "Libera los bonos"}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-display-lg">{colectivo.activos}</span>
            <span className="text-body-lg opacity-70">
              de {colectivo.meta} tickets activos
            </span>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-secondary-fixed transition-all duration-700"
              style={{ width: `${progresoColectivo}%` }}
            />
          </div>

          <span className="flex items-center gap-1.5 text-body-sm opacity-90">
            <span className="material-symbols-outlined text-[16px]">
              {colectivo.alcanzada ? "check_circle" : "bolt"}
            </span>
            {colectivo.alcanzada
              ? "¡El equipo lo logró! Los bonos ganados ya se están pagando."
              : `Faltan ${faltanColectivo} tickets del equipo para liberar los bonos.`}
          </span>
        </section>
      )}

      {/* Cifras del mes, cada una con su color */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Cifra
          icono="confirmation_number"
          etiqueta="Tickets activos"
          valor={String(datos.tickets_activos)}
          chip="bg-estado-abonado-bg text-primary"
          valorClase="text-primary"
        />
        <Cifra
          icono="payments"
          etiqueta="Total vendido"
          valor={dinero(datos.total_vendido)}
          chip="bg-estado-libre-bg text-estado-activo-bg"
          valorClase="text-secondary"
        />
        <Cifra
          icono="account_balance"
          etiqueta="Comisiones pagadas"
          valor={dinero(datos.comisiones_pagadas)}
          chip="bg-estado-apartado-bg text-estado-apartado-fg"
        />
        <Cifra
          icono="event"
          etiqueta="Días para el sorteo"
          valor={String(datos.dias_para_sorteo)}
          chip="bg-primary-fixed text-primary"
        />
        <Cifra
          icono="group"
          etiqueta="Vendedores activos"
          valor={String(datos.vendedores_activos)}
          chip="bg-secondary-container/40 text-secondary"
        />
        <Cifra
          icono="inventory_2"
          etiqueta="Serían de la banca"
          valor={String(datos.numeros_banca)}
          chip="bg-surface-container-highest text-on-surface-variant"
          valorClase="text-on-surface-variant"
        />
      </div>

      {/* Alertas, con el color de su urgencia */}
      {alertas && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-headline text-primary">Alertas</h2>
            {totalAlertas > 0 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-error text-[11px] font-bold text-on-error">
                {totalAlertas}
              </span>
            )}
          </div>

          <Alerta
            href="/admin/vencimientos"
            icono="alarm"
            cantidad={alertas.vencimientos}
            texto={
              alertas.vencimientos === 1
                ? "plazo por vencer"
                : "plazos por vencer"
            }
            detalle="Apartados y abonos cerca de su límite."
            tono="rojo"
          />
          <Alerta
            href="/admin/confirmar"
            icono="hourglass_top"
            cantidad={alertas.por_confirmar}
            texto={
              alertas.por_confirmar === 1
                ? "venta por confirmar"
                : "ventas por confirmar"
            }
            detalle="Dinero marcado como entregado, pendiente de tu visto bueno."
            tono="ambar"
          />
          <Alerta
            href="/admin/vendedores"
            icono="emoji_events"
            cantidad={alertas.metas_por_pagar}
            texto={alertas.metas_por_pagar === 1 ? "meta por pagar" : "metas por pagar"}
            detalle="Comisiones ganadas que aún no has entregado."
            tono="verde"
          />
          <Alerta
            href="/admin/vendedores"
            icono="person_add"
            cantidad={alertas.solicitudes}
            texto={
              alertas.solicitudes === 1
                ? "solicitud de registro"
                : "solicitudes de registro"
            }
            detalle="Vendedores nuevos esperando aprobación."
            tono="azul"
          />

          {totalAlertas === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-low px-6 py-8 text-center">
              <span className="material-symbols-outlined text-[32px] text-outline">
                task_alt
              </span>
              <p className="text-body-sm text-on-surface-variant">
                Todo al día. No hay nada pendiente por ahora.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
