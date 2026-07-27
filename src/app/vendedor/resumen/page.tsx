"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getVendedorToken } from "@/lib/session";
import { ListaPagos, type Pago } from "@/components/ListaPagos";

type Resumen = {
  nombre: string;
  cupo: number;
  tickets_activos: number;
  apartados: number;
  abonados: number;
  pendientes: number;
  meta_tickets: number;
  pago_meta: number;
  en_meta: number;
  faltan: number;
  metas_cobradas: number;
  metas_disponibles: number;
  comision_pagada: number;
  total_historico: number;
};

const dinero = (n: number) => `$${Number(n).toFixed(2)}`;

/** Tarjeta pequeña de conteo por estado. */
function Contador({
  icono,
  valor,
  etiqueta,
}: {
  icono: string;
  valor: number;
  etiqueta: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-lg bg-surface-container-low px-2 py-3">
      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
        {icono}
      </span>
      <span className="text-headline text-on-surface">{valor}</span>
      <span className="text-center text-[10px] font-bold uppercase leading-tight text-on-surface-variant">
        {etiqueta}
      </span>
    </div>
  );
}

export default function ResumenVendedorPage() {
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const token = getVendedorToken();
      const [r, p] = await Promise.all([
        supabase.rpc("vendedor_resumen_comisiones", { p_token: token }),
        supabase.rpc("vendedor_mis_pagos", { p_token: token }),
      ]);
      if (cancelado) return;
      if (!r.error && r.data) setDatos(r.data as Resumen);
      if (!p.error && p.data) setPagos(p.data as Pago[]);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-container" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-container" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  const progreso = (datos.en_meta / datos.meta_tickets) * 100;
  const porCobrar = datos.metas_disponibles * Number(datos.pago_meta);
  const primerNombre = datos.nombre.split(" ")[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label-caps uppercase text-secondary">Mi resumen</span>
        <h1 className="text-display-mobile text-primary">
          ¡Hola, {primerNombre}! 👋
        </h1>
      </div>

      {/* Meta en curso */}
      <section className="relative flex flex-col gap-3 overflow-hidden rounded-xl bg-primary p-6 text-on-primary shadow-xl">
        <span className="material-symbols-outlined filled pointer-events-none absolute -right-5 -top-5 text-[128px] opacity-10">
          emoji_events
        </span>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-headline">Tu meta</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-label-caps uppercase">
            {dinero(datos.pago_meta)} al completarla
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-display-lg">{datos.en_meta}</span>
          <span className="text-body-lg opacity-70">
            de {datos.meta_tickets} tickets
          </span>
        </div>

        <div className="h-3 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-secondary-fixed transition-all duration-700"
            style={{ width: `${progreso}%` }}
          />
        </div>

        {datos.metas_disponibles > 0 ? (
          <div className="flex items-start gap-2 rounded-lg bg-secondary-fixed px-3 py-2.5 text-body-sm font-semibold text-on-primary-fixed">
            <span className="material-symbols-outlined filled text-[18px]">paid</span>
            {datos.metas_disponibles === 1
              ? `¡Meta completa! Tienes ${dinero(porCobrar)} por cobrar.`
              : `¡${datos.metas_disponibles} metas completas! Tienes ${dinero(
                  porCobrar
                )} por cobrar.`}
          </div>
        ) : (
          <span className="flex items-center gap-1.5 text-body-sm opacity-80">
            <span className="material-symbols-outlined text-[16px]">bolt</span>
            {datos.faltan === datos.meta_tickets
              ? `Vende ${datos.meta_tickets} tickets para cobrar ${dinero(
                  datos.pago_meta
                )}.`
              : `Te ${datos.faltan === 1 ? "falta" : "faltan"} ${datos.faltan} ${
                  datos.faltan === 1 ? "ticket" : "tickets"
                } para cobrar ${dinero(datos.pago_meta)}.`}
          </span>
        )}
      </section>

      {/* Cifras del mes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-xl bg-surface-container-lowest p-4 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
          <span className="flex items-center gap-1.5 text-label-caps uppercase text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">
              confirmation_number
            </span>
            Tickets activos
          </span>
          <span className="text-display-mobile text-on-surface">
            {datos.tickets_activos}
          </span>
          <span className="text-body-sm text-on-surface-variant">
            de {datos.cupo} de cupo
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-xl bg-surface-container-lowest p-4 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
          <span className="flex items-center gap-1.5 text-label-caps uppercase text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">payments</span>
            Comisiones
          </span>
          <span className="text-display-mobile text-secondary">
            {dinero(datos.comision_pagada)}
          </span>
          <span className="text-body-sm text-on-surface-variant">
            {datos.metas_cobradas}{" "}
            {datos.metas_cobradas === 1 ? "meta cobrada" : "metas cobradas"}
          </span>
        </div>
      </div>

      {/* Estado de sus números */}
      <div className="flex gap-2">
        <Contador icono="bookmark" valor={datos.apartados} etiqueta="Apartados" />
        <Contador icono="savings" valor={datos.abonados} etiqueta="Abonados" />
        <Contador
          icono="hourglass_top"
          valor={datos.pendientes}
          etiqueta="Por confirmar"
        />
      </div>

      {/* Historial de comisiones */}
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-headline text-primary">Mis comisiones</h2>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold uppercase text-on-surface-variant">
              Total histórico
            </span>
            <span className="text-body-lg font-bold text-on-surface">
              {dinero(datos.total_historico)}
            </span>
          </div>
        </div>
        <ListaPagos pagos={pagos} />
      </section>
    </div>
  );
}
