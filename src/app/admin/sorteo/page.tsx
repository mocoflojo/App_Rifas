"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAdminToken } from "@/lib/session";
import { mensajeError } from "@/lib/errores";
import { enlaceWhatsapp } from "@/lib/telefono";
import { p5Ganador } from "@/lib/plantillas";

type Ganador = {
  numero: number;
  es_banca: boolean;
  cliente_nombre: string | null;
  cliente_whatsapp: string | null;
  premio_nombre: string;
  premio_valor: number;
};

type Ranking = { vendedor_id: string; nombre: string; tickets_activos: number };
type Liquidacion = {
  vendedor_id: string;
  nombre: string;
  whatsapp: string;
  tickets_pendientes: number;
  monto: number;
};
type Colectivo = { activos: number; meta: number; alcanzada: boolean };

type CierreResultado = {
  mes_cerrado: string;
  tickets_vendidos: number;
  ingresos: number;
  comisiones_pagadas: number;
  abonos_perdidos: number;
  numeros_banca: number;
  motos_ganadas_banca: number;
  top_vendedor: { nombre: string; tickets_activos: number } | Record<string, never>;
};

const dinero = (n: number) => `$${Number(n).toFixed(2)}`;
const etiqueta = (n: number) => `#${String(n).padStart(3, "0")}`;

export default function SorteoPage() {
  const [numeros, setNumeros] = useState(["", "", ""]);
  const [ganadores, setGanadores] = useState<Ganador[] | null>(null);
  const [ranking, setRanking] = useState<Ranking[]>([]);
  const [liquidacion, setLiquidacion] = useState<Liquidacion[]>([]);
  const [colectivo, setColectivo] = useState<Colectivo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [liquidando, setLiquidando] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(0);
  const [cerrando, setCerrando] = useState(false);
  const [resultado, setResultado] = useState<CierreResultado | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const token = getAdminToken();
      const [g, r, l, c] = await Promise.all([
        supabase.rpc("admin_ganadores_registrados", { p_admin_token: token }),
        supabase.rpc("admin_ranking_vendedores", { p_admin_token: token }),
        supabase.rpc("admin_liquidacion_pendiente", { p_admin_token: token }),
        supabase.rpc("admin_progreso_colectivo", { p_admin_token: token }),
      ]);
      if (cancelado) return;
      setGanadores((g.data as Ganador[] | null) ?? null);
      setRanking((r.data as Ranking[]) ?? []);
      setLiquidacion((l.data as Liquidacion[]) ?? []);
      if (c.data) setColectivo(c.data as Colectivo);
      setCargando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  async function registrarGanadores() {
    setError(null);
    const nums = numeros.map((n) => Number(n));
    if (nums.some((n) => !n || n < 1 || n > 1000)) {
      setError("Escribe los 3 números ganadores (entre 1 y 1000).");
      return;
    }
    setProcesando(true);
    const { data, error: e } = await supabase.rpc("admin_registrar_ganadores", {
      p_admin_token: getAdminToken(),
      p_numeros: nums,
    });
    setProcesando(false);
    if (e) {
      setError(mensajeError(e));
      return;
    }
    setGanadores((data?.ganadores as Ganador[]) ?? null);
  }

  async function liquidarTodo() {
    setLiquidando(true);
    await supabase.rpc("admin_liquidar_comisiones", { p_admin_token: getAdminToken() });
    setLiquidando(false);
    setRecarga((n) => n + 1);
  }

  async function cerrarMes() {
    setError(null);
    setCerrando(true);
    const { data, error: e } = await supabase.rpc("cierre_mes", {
      p_admin_token: getAdminToken(),
    });
    setCerrando(false);
    setConfirmarCierre(0);
    if (e) {
      setError(mensajeError(e));
      return;
    }
    setResultado(data as CierreResultado);
  }

  if (cargando) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-mobile text-primary">Sorteo y cierre</h1>
        <div className="h-32 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  if (resultado) {
    return <ResumenCierre resultado={resultado} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-display-mobile text-primary">Sorteo y cierre</h1>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-error-container px-4 py-3 text-body-sm text-on-error-container">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}

      {/* ---------- Registrar números ganadores ---------- */}
      <section className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-fixed text-primary">
            <span className="material-symbols-outlined text-[18px]">
              confirmation_number
            </span>
          </span>
          <div className="flex flex-col">
            <h2 className="text-headline text-primary">Números ganadores</h2>
            <p className="text-body-sm text-on-surface-variant">
              El sorteo es externo: solo ingresa los 3 números que salieron.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {numeros.map((n, i) => (
            <input
              key={i}
              value={n}
              onChange={(e) => {
                const copia = [...numeros];
                copia[i] = e.target.value.replace(/\D/g, "");
                setNumeros(copia);
              }}
              inputMode="numeric"
              placeholder={`Premio ${i + 1}`}
              className="h-14 min-w-0 flex-1 rounded-lg border-0 bg-surface-container-high text-center text-grid-number text-on-surface outline-none focus:ring-2 focus:ring-secondary"
            />
          ))}
        </div>

        <button
          onClick={registrarGanadores}
          disabled={procesando}
          className="flex h-12 items-center justify-center gap-2 rounded-lg bg-secondary text-body-sm font-semibold text-on-secondary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {procesando ? "Registrando..." : "Registrar ganadores"}
        </button>

        {ganadores && (
          <div className="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
            {ganadores.map((g) => (
              <div
                key={g.numero}
                className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-estado-abonado-bg text-grid-number text-primary">
                  {etiqueta(g.numero)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm font-semibold text-on-surface">
                    {g.premio_nombre} · {dinero(g.premio_valor)}
                  </span>
                  <span className="text-body-sm text-on-surface-variant">
                    {g.es_banca ? "Le tocó a la banca" : g.cliente_nombre}
                  </span>
                </div>
                {!g.es_banca && g.cliente_whatsapp && (
                  <a
                    href={enlaceWhatsapp(
                      g.cliente_whatsapp,
                      p5Ganador(g.cliente_nombre ?? "", g.numero, Number(g.premio_valor))
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-on-secondary"
                  >
                    <span className="material-symbols-outlined text-[18px]">chat</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Meta colectiva ---------- */}
      {colectivo && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl p-4 ${
            colectivo.alcanzada
              ? "bg-estado-activo-bg text-estado-activo-fg"
              : "bg-surface-container-low"
          }`}
        >
          <span className="flex items-center gap-2 text-body-sm font-semibold">
            <span className="material-symbols-outlined text-[18px]">groups</span>
            Meta colectiva: {colectivo.activos} / {colectivo.meta}
          </span>
          {!colectivo.alcanzada && (
            <span className="text-body-sm text-on-surface-variant">No alcanzada</span>
          )}
        </div>
      )}

      {/* ---------- Ranking ---------- */}
      {ranking.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-headline text-primary">Ranking del mes</h2>
          {ranking.slice(0, 5).map((v, i) => (
            <div
              key={v.vendedor_id}
              className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-body-sm font-bold text-on-primary">
                {i + 1}
              </span>
              <span className="flex-1 text-body-sm font-semibold text-on-surface">
                {v.nombre}
              </span>
              <span className="text-body-sm text-on-surface-variant">
                {v.tickets_activos} activos
              </span>
            </div>
          ))}
        </section>
      )}

      {/* ---------- Liquidación pendiente ---------- */}
      <section className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-5 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-headline text-primary">Liquidación pendiente</h2>
          <span className="text-body-sm text-on-surface-variant">
            $ por ticket suelto
          </span>
        </div>

        {liquidacion.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">
            No hay tickets pendientes de liquidar.
          </p>
        ) : (
          <>
            {liquidacion.map((v) => (
              <div
                key={v.vendedor_id}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low p-3"
              >
                <span className="text-body-sm font-semibold text-on-surface">
                  {v.nombre}
                </span>
                <span className="text-body-sm text-on-surface-variant">
                  {v.tickets_pendientes} tickets
                </span>
                <span className="font-bold text-secondary">{dinero(v.monto)}</span>
              </div>
            ))}
            <button
              onClick={liquidarTodo}
              disabled={liquidando}
              className="flex h-12 items-center justify-center gap-2 rounded-lg bg-secondary text-body-sm font-semibold text-on-secondary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">payments</span>
              {liquidando
                ? "Liquidando..."
                : `Liquidar todo (${dinero(liquidacion.reduce((s, v) => s + Number(v.monto), 0))})`}
            </button>
          </>
        )}
      </section>

      {/* ---------- Cierre de mes ---------- */}
      <section className="flex flex-col gap-3 rounded-xl border-2 border-error/30 bg-error-container/20 p-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[22px] text-error">
            warning
          </span>
          <h2 className="text-headline text-error">Cerrar el mes</h2>
        </div>
        <p className="text-body-sm text-on-surface-variant">
          Resetea los 1,000 números a libre, borra los contadores de todos
          los vendedores y guarda este mes en el historial. No se puede
          deshacer.
        </p>

        {!ganadores && (
          <p className="flex items-center gap-1.5 text-body-sm font-semibold text-error">
            <span className="material-symbols-outlined text-[16px]">block</span>
            Registra los números ganadores antes de cerrar.
          </p>
        )}

        {confirmarCierre === 0 ? (
          <button
            disabled={!ganadores}
            onClick={() => setConfirmarCierre(1)}
            className="flex h-12 items-center justify-center gap-2 rounded-lg border-2 border-error text-body-sm font-semibold text-error disabled:opacity-50"
          >
            Cerrar el mes
          </button>
        ) : confirmarCierre === 1 ? (
          <div className="flex flex-col gap-2">
            <p className="text-body-sm font-semibold text-on-surface">
              ¿Seguro? Esto no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmarCierre(2)}
                className="flex h-12 flex-1 items-center justify-center rounded-lg bg-error text-body-sm font-semibold text-on-error"
              >
                Sí, continuar
              </button>
              <button
                onClick={() => setConfirmarCierre(0)}
                className="flex h-12 items-center justify-center rounded-lg border-2 border-outline-variant px-4 text-body-sm font-semibold text-on-surface-variant"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-body-sm font-semibold text-error">
              Última confirmación: se va a cerrar {""}
              {new Date().toLocaleDateString("es-VE", { month: "long", year: "numeric" })}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={cerrarMes}
                disabled={cerrando}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-error text-body-sm font-semibold text-on-error disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">lock</span>
                {cerrando ? "Cerrando..." : "Confirmar cierre definitivo"}
              </button>
              <button
                onClick={() => setConfirmarCierre(0)}
                className="flex h-12 items-center justify-center rounded-lg border-2 border-outline-variant px-4 text-body-sm font-semibold text-on-surface-variant"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** Vista imprimible tras cerrar el mes (§12.4: "generar PDF resumen" vía
 *  window.print(), sin depender de ninguna librería). */
function ResumenCierre({ resultado }: { resultado: CierreResultado }) {
  const top = "nombre" in resultado.top_vendedor ? resultado.top_vendedor : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <h1 className="text-display-mobile text-primary">Mes cerrado</h1>
        <button
          onClick={() => window.print()}
          className="flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-body-sm font-semibold text-on-primary"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          Imprimir resumen
        </button>
      </div>

      <section className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-6 shadow-[0_10px_25px_rgba(26,82,118,0.05)] print:shadow-none">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="material-symbols-outlined filled text-[48px] text-estado-activo-bg">
            verified
          </span>
          <h2 className="text-headline text-primary">
            Cierre de {resultado.mes_cerrado}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Dato etiqueta="Tickets vendidos" valor={String(resultado.tickets_vendidos)} />
          <Dato etiqueta="Ingresos" valor={dinero(resultado.ingresos)} />
          <Dato etiqueta="Comisiones pagadas" valor={dinero(resultado.comisiones_pagadas)} />
          <Dato etiqueta="Abonos perdidos" valor={dinero(resultado.abonos_perdidos)} />
          <Dato etiqueta="Números de la banca" valor={String(resultado.numeros_banca)} />
          <Dato etiqueta="Motos de la banca" valor={String(resultado.motos_ganadas_banca)} />
        </div>

        {top && (
          <div className="flex items-center gap-3 rounded-lg bg-primary p-4 text-on-primary">
            <span className="material-symbols-outlined filled text-[28px]">
              military_tech
            </span>
            <div className="flex flex-col">
              <span className="text-label-caps uppercase opacity-80">
                Top vendedor del mes
              </span>
              <span className="text-body-lg font-semibold">
                {top.nombre} · {top.tickets_activos} tickets activos
              </span>
            </div>
          </div>
        )}
      </section>

      <p className="text-center text-body-sm text-on-surface-variant print:hidden">
        El talonario ya quedó limpio para el nuevo mes.
      </p>
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
