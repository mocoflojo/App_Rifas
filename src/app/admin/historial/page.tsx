"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAdminToken } from "@/lib/session";

type Mes = {
  mes: string;
  tickets_vendidos: number;
  ingresos: number;
  comisiones_pagadas: number;
  abonos_perdidos: number;
  numeros_banca: number;
  motos_ganadas_banca: number;
  ganadores: { numero: number; es_banca: boolean; premio_nombre: string }[];
  top_vendedor: { nombre: string; tickets_activos: number } | Record<string, never>;
  vendedores_activos: number;
};

const dinero = (n: number) => `$${Number(n).toFixed(2)}`;

function nombreMes(mes: string) {
  const [anio, m] = mes.split("-").map(Number);
  return new Date(anio, m - 1, 1).toLocaleDateString("es-VE", {
    month: "long",
    year: "numeric",
  });
}

export default function HistorialPage() {
  const [meses, setMeses] = useState<Mes[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("admin_historico", {
        p_admin_token: getAdminToken(),
      });
      setMeses((data as Mes[]) ?? []);
    })();
  }, []);

  if (meses === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-mobile text-primary">Historial</h1>
        <div className="h-32 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  if (meses.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-mobile text-primary">Historial</h1>
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-low px-6 py-12 text-center">
          <span className="material-symbols-outlined text-[40px] text-outline">
            history
          </span>
          <p className="text-body-sm text-on-surface-variant">
            Todavía no se ha cerrado ningún mes.
          </p>
        </div>
      </div>
    );
  }

  const mejorMes = meses.reduce((a, b) => (b.tickets_vendidos > a.tickets_vendidos ? b : a));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-display-mobile text-primary">Historial</h1>

      {meses.map((m) => {
        const top = "nombre" in m.top_vendedor ? m.top_vendedor : null;
        return (
          <article
            key={m.mes}
            className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-[0_10px_25px_rgba(26,82,118,0.05)]"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-headline capitalize text-primary">
                {nombreMes(m.mes)}
              </h2>
              {m.mes === mejorMes.mes && meses.length > 1 && (
                <span className="flex items-center gap-1 rounded-full bg-estado-libre-bg px-2.5 py-1 text-[10px] font-bold uppercase text-estado-activo-bg">
                  <span className="material-symbols-outlined text-[14px]">
                    trending_up
                  </span>
                  Mejor mes
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Dato etiqueta="Tickets vendidos" valor={String(m.tickets_vendidos)} />
              <Dato etiqueta="Ingresos" valor={dinero(m.ingresos)} />
              <Dato etiqueta="Comisiones" valor={dinero(m.comisiones_pagadas)} />
              <Dato etiqueta="Abonos perdidos" valor={dinero(m.abonos_perdidos)} />
              <Dato etiqueta="Motos de la banca" valor={String(m.motos_ganadas_banca)} />
              <Dato etiqueta="Vendedores activos" valor={String(m.vendedores_activos)} />
            </div>

            {top && (
              <div className="flex items-center gap-2 rounded-lg bg-surface-container-low p-3 text-body-sm">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  military_tech
                </span>
                <span className="font-semibold text-on-surface">{top.nombre}</span>
                <span className="text-on-surface-variant">
                  fue el top vendedor con {top.tickets_activos} tickets activos
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {m.ganadores.map((g) => (
                <span
                  key={g.numero}
                  className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1.5 text-body-sm text-on-surface-variant"
                >
                  <span className="font-mono font-bold text-primary">
                    #{String(g.numero).padStart(3, "0")}
                  </span>
                  {g.premio_nombre}
                  {g.es_banca && (
                    <span className="text-[10px] font-bold uppercase text-outline">
                      banca
                    </span>
                  )}
                </span>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-3">
      <span className="text-[10px] font-bold uppercase text-on-surface-variant">
        {etiqueta}
      </span>
      <span className="text-body-lg font-bold text-on-surface">{valor}</span>
    </div>
  );
}
