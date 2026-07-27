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
  pagado: boolean;
};

type Resumen = {
  cupo: number;
  meta_tickets: number;
  dias_vendedor_rapido: number;
};

type Posicion = { posicion: number; total: number; tickets_activos: number };
type Colectivo = { activos: number; meta: number; alcanzada: boolean };

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
  dias,
  mesActual,
}: {
  id: LogroId;
  ganado: LogroGanado | null;
  cupo: number;
  dias: number;
  mesActual: string;
}) {
  const def = CATALOGO_LOGROS[id];
  const bloqueado = !ganado;
  /** Ganado, pero el dinero espera a que el equipo llegue a la meta
   *  colectiva. Solo aplica al mes en curso: si el mes cerró sin alcanzar
   *  la meta, ese bono ya no se paga y el chip sería una promesa falsa. */
  const pendienteDeEquipo =
    !!ganado &&
    def.requiereMetaColectiva &&
    !ganado.pagado &&
    ganado.mes === mesActual;

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
          bloqueado ? "bg-surface-container grayscale opacity-30" : def.color
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
          {def.descripcion(cupo, dias)}
        </span>
      </div>
      {ganado ? (
        pendienteDeEquipo ? (
          <span className="flex items-center gap-1 rounded-full bg-estado-apartado-bg px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-estado-apartado-fg">
            <span className="material-symbols-outlined text-[14px]">
              hourglass_top
            </span>
            Ganado · espera a la meta del equipo
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-estado-libre-bg px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-estado-activo-bg">
            <span className="material-symbols-outlined text-[14px]">
              check_circle
            </span>
            {fechaCorta(ganado.fecha)}
          </span>
        )
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
  dias,
  mesActual,
  onCerrar,
}: {
  nuevos: LogroGanado[];
  cupo: number;
  dias: number;
  mesActual: string;
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
                CATALOGO_LOGROS[n.logro_id as LogroId]?.descripcion(cupo, dias)
              )
              .join(" ")}
          </p>
          {nuevos.some(
            (n) =>
              CATALOGO_LOGROS[n.logro_id as LogroId]?.requiereMetaColectiva &&
              !n.pagado &&
              n.mes === mesActual
          ) && (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-body-sm font-semibold text-estado-apartado-fg">
              <span className="material-symbols-outlined text-[16px]">
                groups
              </span>
              El dinero se libera cuando el equipo llegue a su meta colectiva.
            </p>
          )}
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
  const [colectivo, setColectivo] = useState<Colectivo | null>(null);
  const [racha, setRacha] = useState(0);
  const [mesActual, setMesActual] = useState("");
  const [celebrando, setCelebrando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const token = getVendedorToken();
      const [l, r, p, ra, col, cfg] = await Promise.all([
        supabase.rpc("vendedor_mis_logros", { p_token: token }),
        supabase.rpc("vendedor_resumen_comisiones", { p_token: token }),
        supabase.rpc("vendedor_posicion", { p_token: token }),
        supabase.rpc("vendedor_racha_actual", { p_token: token }),
        supabase.rpc("vendedor_progreso_colectivo", { p_token: token }),
        supabase.rpc("config_publica"),
      ]);
      if (cancelado) return;
      const lista = (l.data as LogroGanado[]) ?? [];
      setGanados(lista);
      if (r.data) setResumen(r.data as Resumen);
      if (p.data) setPosicion(p.data as Posicion);
      if (typeof ra.data === "number") setRacha(ra.data);
      if (col.data) setColectivo(col.data as Colectivo);
      if (cfg.data?.mes_actual) setMesActual(cfg.data.mes_actual as string);
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
  const progresoColectivo = colectivo
    ? Math.min((colectivo.activos / colectivo.meta) * 100, 100)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-display-mobile text-primary">Mis logros</h1>

      {/* Meta colectiva del equipo */}
      {colectivo && (
        <section
          className={`relative flex flex-col gap-3 overflow-hidden rounded-xl p-6 shadow-xl ${
            colectivo.alcanzada
              ? "bg-estado-activo-bg text-estado-activo-fg"
              : "bg-primary text-on-primary"
          }`}
        >
          <span className="material-symbols-outlined filled pointer-events-none absolute -right-4 -top-4 text-[110px] opacity-10">
            groups
          </span>
          <span className="text-label-caps uppercase tracking-widest opacity-80">
            Meta colectiva del equipo
          </span>
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
              {colectivo.alcanzada ? "check_circle" : "info"}
            </span>
            {colectivo.alcanzada
              ? "¡Meta alcanzada! Los bonos del equipo ya se están pagando."
              : "Al llegar entre todos a esta meta, se liberan los bonos de cupo completo, vendedor rápido y racha."}
          </span>
        </section>
      )}

      {/* Racha y posición */}
      <div className="grid grid-cols-2 gap-3">
        {/* Con racha viva, la tarjeta arde; sin racha, la llama está apagada. */}
        <div
          className={`relative flex flex-col gap-1 overflow-hidden rounded-xl p-4 ${
            racha > 0
              ? "bg-linear-to-br from-status-pending via-[#ea580c] to-error text-white shadow-lg"
              : "bg-surface-container-low"
          }`}
        >
          {racha > 0 && (
            <span className="material-symbols-outlined filled pointer-events-none absolute -bottom-3 -right-2 text-[80px] opacity-25">
              local_fire_department
            </span>
          )}
          <span
            className={`flex items-center gap-1.5 text-label-caps uppercase ${
              racha > 0 ? "opacity-90" : "text-on-surface-variant"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[16px] ${
                racha > 0 ? "filled" : ""
              }`}
            >
              local_fire_department
            </span>
            Racha
          </span>
          <span
            className={`text-display-mobile ${
              racha > 0 ? "text-white" : "text-on-surface"
            }`}
          >
            {racha} {racha === 1 ? "mes" : "meses"}
          </span>
          <span
            className={`text-body-sm ${
              racha > 0 ? "opacity-90" : "text-on-surface-variant"
            }`}
          >
            {racha === 0
              ? "Completa tu cupo este mes para encenderla."
              : racha < 3
                ? `Van ${racha} de 3 para "En racha".`
                : "¡Estás que ardes!"}
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
            dias={resumen.dias_vendedor_rapido}
            mesActual={mesActual}
          />
        ))}
      </div>

      {celebrando && nuevos.length > 0 && (
        <Celebracion
          nuevos={nuevos}
          cupo={resumen.cupo}
          dias={resumen.dias_vendedor_rapido}
          mesActual={mesActual}
          onCerrar={cerrarCelebracion}
        />
      )}
    </div>
  );
}
