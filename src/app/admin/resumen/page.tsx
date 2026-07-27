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

function Cifra({
  icono,
  etiqueta,
  valor,
}: {
  icono: string;
  etiqueta: string;
  valor: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface-container-lowest p-4 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
      <span className="flex items-center gap-1.5 text-label-caps uppercase text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px]">{icono}</span>
        {etiqueta}
      </span>
      <span className="text-display-mobile text-on-surface">{valor}</span>
    </div>
  );
}

function Alerta({
  href,
  icono,
  cantidad,
  texto,
}: {
  href: string;
  icono: string;
  cantidad: number;
  texto: string;
}) {
  if (cantidad === 0) return null;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border-l-4 border-status-pending bg-surface-container-lowest p-4 shadow-sm transition-transform active:scale-[0.99]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-estado-apartado-bg text-estado-apartado-fg">
        <span className="material-symbols-outlined text-[20px]">{icono}</span>
      </span>
      <span className="flex-1 text-body-lg font-semibold text-on-surface">
        {cantidad} {texto}
      </span>
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
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label-caps uppercase text-secondary">
          {datos.mes_actual}
        </span>
        <h1 className="text-display-mobile text-primary">Resumen del mes</h1>
      </div>

      {/* Cifras principales */}
      <div className="grid grid-cols-2 gap-3">
        <Cifra icono="confirmation_number" etiqueta="Tickets activos" valor={String(datos.tickets_activos)} />
        <Cifra icono="payments" etiqueta="Total vendido" valor={dinero(datos.total_vendido)} />
        <Cifra icono="account_balance" etiqueta="Comisiones pagadas" valor={dinero(datos.comisiones_pagadas)} />
        <Cifra icono="event" etiqueta="Días para el sorteo" valor={String(datos.dias_para_sorteo)} />
        <Cifra icono="group" etiqueta="Vendedores activos" valor={String(datos.vendedores_activos)} />
        <Cifra icono="inventory_2" etiqueta="Serían de la banca hoy" valor={String(datos.numeros_banca)} />
      </div>

      {/* Meta colectiva */}
      {colectivo && (
        <Link
          href="/admin/vendedores"
          className={`flex flex-col gap-2 rounded-xl p-4 transition-transform active:scale-[0.99] ${
            colectivo.alcanzada
              ? "bg-estado-activo-bg text-estado-activo-fg"
              : "bg-surface-container-lowest shadow-[0_10px_25px_rgba(26,82,118,0.05)]"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`flex items-center gap-1.5 text-label-caps uppercase ${
                colectivo.alcanzada ? "opacity-90" : "text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">groups</span>
              Meta colectiva del equipo
            </span>
            <span className={`text-body-sm font-bold ${colectivo.alcanzada ? "" : "text-primary"}`}>
              {colectivo.activos} / {colectivo.meta}
            </span>
          </div>
          <div
            className={`h-2.5 w-full overflow-hidden rounded-full ${
              colectivo.alcanzada ? "bg-white/25" : "bg-surface-container-highest"
            }`}
          >
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                colectivo.alcanzada ? "bg-secondary-fixed" : "bg-linear-to-r from-primary to-secondary"
              }`}
              style={{ width: `${Math.min((colectivo.activos / colectivo.meta) * 100, 100)}%` }}
            />
          </div>
          {colectivo.alcanzada && (
            <span className="text-body-sm opacity-90">
              Meta alcanzada — los bonos del equipo ya se están pagando.
            </span>
          )}
        </Link>
      )}

      {/* Alertas */}
      {alertas && (
        <section className="flex flex-col gap-2">
          <h2 className="text-headline text-primary">Alertas</h2>
          <Alerta
            href="/admin/vendedores"
            icono="how_to_reg"
            cantidad={alertas.solicitudes}
            texto={alertas.solicitudes === 1 ? "solicitud pendiente" : "solicitudes pendientes"}
          />
          <Alerta
            href="/admin/confirmar"
            icono="hourglass_top"
            cantidad={alertas.por_confirmar}
            texto={alertas.por_confirmar === 1 ? "venta por confirmar" : "ventas por confirmar"}
          />
          <Alerta
            href="/admin/vencimientos"
            icono="schedule"
            cantidad={alertas.vencimientos}
            texto={alertas.vencimientos === 1 ? "vencimiento próximo" : "vencimientos próximos"}
          />
          <Alerta
            href="/admin/vendedores"
            icono="emoji_events"
            cantidad={alertas.metas_por_pagar}
            texto={alertas.metas_por_pagar === 1 ? "meta por pagar" : "metas por pagar"}
          />
          {alertas.por_confirmar +
            alertas.vencimientos +
            alertas.metas_por_pagar +
            alertas.solicitudes ===
            0 && (
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
