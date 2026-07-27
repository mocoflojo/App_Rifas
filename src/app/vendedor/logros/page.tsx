"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getVendedorToken } from "@/lib/session";
import { CATALOGO_LOGROS, ORDEN_LOGROS, type LogroId } from "@/lib/logros";

type LogroGanado = {
  logro_id: string;
  fecha: string;
  mes: string;
  visto: boolean;
};

type Resumen = {
  cupo: number;
  meta_tickets: number;
};

type Posicion = { posicion: number; total: number; tickets_activos: number };

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-VE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Insignia({
  id,
  ganado,
  cupo,
  meta,
}: {
  id: LogroId;
  ganado: LogroGanado | null;
  cupo: number;
  meta: number;
}) {
  const def = CATALOGO_LOGROS[id];
  const bloqueado = !ganado;

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-xl p-5 text-center shadow-sm ${
        bloqueado
          ? "bg-surface-container-low"
          : "bg-surface-container-lowest shadow-[0_10px_25px_rgba(26,82,118,0.05)]"
      }`}
    >
      <div
        className={`flex size-16 items-center justify-center rounded-full text-[32px] ${
          bloqueado ? "grayscale opacity-30" : ""
        }`}
      >
        {def.emoji}
      </div>
      <div className="flex flex-col gap-0.5">
        <span
          className={`text-body-lg font-semibold ${
            bloqueado ? "text-on-surface-variant" : "text-on-surface"
          }`}
        >
          {def.nombre}
        </span>
        <span className="text-body-sm text-on-surface-variant">
          {def.descripcion(cupo, meta)}
        </span>
      </div>
      {ganado ? (
        <span className="flex items-center gap-1 rounded-full bg-estado-libre-bg px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-estado-activo-bg">
          <span className="material-symbols-outlined text-[14px]">
            check_circle
          </span>
          {fechaCorta(ganado.fecha)}
        </span>
      ) : def.soloAlCierre ? (
        <span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
          Se otorga al cerrar el mes
        </span>
      ) : (
        <span className="flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">lock</span>
          Bloqueado
        </span>
      )}
    </div>
  );
}

/** Celebración al abrir la pantalla con logros recién desbloqueados. Se
 *  cierra sola tras marcarlos vistos, así la próxima visita no la repite. */
function Celebracion({
  nuevos,
  cupo,
  meta,
  onCerrar,
}: {
  nuevos: LogroGanado[];
  cupo: number;
  meta: number;
  onCerrar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-xl bg-surface-container-lowest p-8 text-center shadow-2xl"
      >
        <div className="flex gap-1 text-[48px] leading-none">
          {nuevos.map((n) => (
            <span key={n.logro_id + n.mes}>
              {CATALOGO_LOGROS[n.logro_id as LogroId]?.emoji}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-headline text-primary">
            {nuevos.length === 1 ? "¡Nueva insignia!" : "¡Nuevas insignias!"}
          </h2>
          <p className="text-body-lg font-semibold text-on-surface">
            {nuevos
              .map((n) => CATALOGO_LOGROS[n.logro_id as LogroId]?.nombre)
              .join(" · ")}
          </p>
          <p className="text-body-sm text-on-surface-variant">
            {nuevos
              .map((n) =>
                CATALOGO_LOGROS[n.logro_id as LogroId]?.descripcion(cupo, meta)
              )
              .join(" ")}
          </p>
        </div>
        <button
          onClick={onCerrar}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-body-lg font-semibold text-on-primary shadow-lg transition-transform active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[20px]">
            celebration
          </span>
          Genial
        </button>
      </div>
    </div>
  );
}

export default function LogrosPage() {
  const [ganados, setGanados] = useState<LogroGanado[] | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const [racha, setRacha] = useState(0);
  const [celebrando, setCelebrando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const token = getVendedorToken();
      const [l, r, p, ra] = await Promise.all([
        supabase.rpc("vendedor_mis_logros", { p_token: token }),
        supabase.rpc("vendedor_resumen_comisiones", { p_token: token }),
        supabase.rpc("vendedor_posicion", { p_token: token }),
        supabase.rpc("vendedor_racha_actual", { p_token: token }),
      ]);
      if (cancelado) return;
      const lista = (l.data as LogroGanado[]) ?? [];
      setGanados(lista);
      if (r.data) setResumen(r.data as Resumen);
      if (p.data) setPosicion(p.data as Posicion);
      if (typeof ra.data === "number") setRacha(ra.data);
      if (lista.some((n) => !n.visto)) setCelebrando(true);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function cerrarCelebracion() {
    setCelebrando(false);
    await supabase.rpc("vendedor_marcar_logros_vistos", {
      p_token: getVendedorToken(),
    });
  }

  if (ganados === null || resumen === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-mobile text-primary">Mis logros</h1>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl bg-surface-container"
            />
          ))}
        </div>
      </div>
    );
  }

  const porId = new Map(ganados.map((g) => [g.logro_id, g]));
  const nuevos = ganados.filter((g) => !g.visto);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-display-mobile text-primary">Mis logros</h1>

      {/* Racha y posición */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-xl bg-surface-container-low p-4">
          <span className="flex items-center gap-1.5 text-label-caps uppercase text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">
              local_fire_department
            </span>
            Racha
          </span>
          <span className="text-display-mobile text-on-surface">
            {racha} {racha === 1 ? "mes" : "meses"}
          </span>
          <span className="text-body-sm text-on-surface-variant">
            {racha === 0
              ? "Completa tu cupo este mes para empezar."
              : racha < 3
                ? `Van ${racha} de 3 para "En racha".`
                : "¡Racha activa!"}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-xl bg-primary p-4 text-on-primary">
          <span className="text-label-caps uppercase opacity-80">
            Este mes
          </span>
          {posicion && posicion.tickets_activos > 0 ? (
            <>
              <span className="text-display-mobile">#{posicion.posicion}</span>
              <span className="text-body-sm opacity-80">
                de {posicion.total}{" "}
                {posicion.total === 1 ? "vendedor" : "vendedores"}
              </span>
            </>
          ) : (
            <span className="text-body-sm opacity-80">
              Vende tu primer ticket para entrar al ranking.
            </span>
          )}
        </div>
      </div>

      {/* Insignias */}
      <div className="grid grid-cols-2 gap-3">
        {ORDEN_LOGROS.map((id) => (
          <Insignia
            key={id}
            id={id}
            ganado={porId.get(id) ?? null}
            cupo={resumen.cupo}
            meta={resumen.meta_tickets}
          />
        ))}
      </div>

      {celebrando && nuevos.length > 0 && (
        <Celebracion
          nuevos={nuevos}
          cupo={resumen.cupo}
          meta={resumen.meta_tickets}
          onCerrar={cerrarCelebracion}
        />
      )}
    </div>
  );
}
