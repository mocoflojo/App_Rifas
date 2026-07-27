"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAdminToken } from "@/lib/session";
import { mensajeError } from "@/lib/errores";
import { enlaceWhatsapp } from "@/lib/telefono";
import { p5Ganador } from "@/lib/plantillas";
import {
  FASES,
  diasEntre,
  etiquetaSugerida,
  fechaLarga,
  hoyISO,
  paraInput,
  type Fase,
} from "@/lib/sorteo";

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

type EstadoSorteo = {
  numero_sorteo: number;
  etiqueta: string;
  estado: "activo" | "borrador";
  fase: Fase;
  fecha_inicio: string | null;
  fecha_limite_abonos: string | null;
  fecha_sorteo: string | null;
  /** Con ventas hechas el arranque se congela y las otras dos fechas solo
   *  pueden estirarse hacia adelante. */
  con_ventas: boolean;
  ganadores_registrados: boolean;
};

type CierreResultado = {
  sorteo_cerrado: number;
  etiqueta: string;
  tickets_vendidos: number;
  ingresos: number;
  comisiones_pagadas: number;
  abonos_perdidos: number;
  numeros_banca: number;
  motos_ganadas_banca: number;
  top_vendedor: { nombre: string; tickets_activos: number } | Record<string, never>;
};

const dinero = (n: number) => `$${Number(n).toFixed(2)}`;
const rotulo = (n: number) => `#${String(n).padStart(3, "0")}`;

export default function SorteoPage() {
  const [estado, setEstado] = useState<EstadoSorteo | null>(null);
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
      const [s, g, r, l, c] = await Promise.all([
        supabase.rpc("admin_estado_sorteo", { p_admin_token: token }),
        supabase.rpc("admin_ganadores_registrados", { p_admin_token: token }),
        supabase.rpc("admin_ranking_vendedores", { p_admin_token: token }),
        supabase.rpc("admin_liquidacion_pendiente", { p_admin_token: token }),
        supabase.rpc("admin_progreso_colectivo", { p_admin_token: token }),
      ]);
      if (cancelado) return;
      setEstado((s.data as EstadoSorteo | null) ?? null);
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

  async function cerrar() {
    setError(null);
    setCerrando(true);
    const { data, error: e } = await supabase.rpc("cierre_sorteo", {
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
    return (
      <ResumenCierre
        resultado={resultado}
        onProgramar={() => {
          setResultado(null);
          setRecarga((n) => n + 1);
        }}
      />
    );
  }

  const fase = FASES[estado?.fase ?? "sin_sorteo"];
  const hayS = estado?.estado === "activo";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-label-caps uppercase text-secondary">
            Sorteo #{estado?.numero_sorteo ?? 1}
            {estado?.etiqueta ? ` · ${estado.etiqueta}` : ""}
          </span>
          <h1 className="text-display-mobile text-primary">Sorteo y cierre</h1>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-body-sm font-semibold ${fase.clase}`}
        >
          <span className="material-symbols-outlined text-[16px]">{fase.icono}</span>
          {fase.texto}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-error-container px-4 py-3 text-body-sm text-on-error-container">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}

      {estado && (
        <Programador
          estado={estado}
          onListo={() => setRecarga((n) => n + 1)}
          onError={setError}
        />
      )}

      {/* Mientras no haya un sorteo activo, el resto de la pantalla no aplica:
          no hay ganadores que registrar ni nada que cerrar. */}
      {!hayS ? null : (
        <>
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
                      {rotulo(g.numero)}
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
              <h2 className="text-headline text-primary">Ranking del sorteo</h2>
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

          {/* ---------- Cierre ---------- */}
          <section className="flex flex-col gap-3 rounded-xl border-2 border-error/30 bg-error-container/20 p-5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px] text-error">
                warning
              </span>
              <h2 className="text-headline text-error">Cerrar el sorteo</h2>
            </div>
            <p className="text-body-sm text-on-surface-variant">
              Resetea los 1,000 números a libre, borra los contadores de todos
              los vendedores y guarda este sorteo en el historial. Después la
              app queda en reposo hasta que programes el siguiente. No se puede
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
                Cerrar el sorteo
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
                  Última confirmación: se va a cerrar{" "}
                  {estado?.etiqueta || `el sorteo #${estado?.numero_sorteo}`}.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={cerrar}
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
        </>
      )}
    </div>
  );
}

/** Crea el próximo sorteo o corrige las fechas del que está en marcha.
 *  Con ventas hechas el arranque queda de solo lectura y las otras dos fechas
 *  solo aceptan valores más adelante: atrasarlas vencería abonos que hoy
 *  están en plazo. */
function Programador({
  estado,
  onListo,
  onError,
}: {
  estado: EstadoSorteo;
  onListo: () => void;
  onError: (m: string | null) => void;
}) {
  const nuevo = estado.estado === "borrador";
  const [abierto, setAbierto] = useState(nuevo);
  const [etiqueta, setEtiqueta] = useState(estado.etiqueta);
  const [tocóEtiqueta, setTocóEtiqueta] = useState(false);
  const [inicio, setInicio] = useState(paraInput(estado.fecha_inicio) || hoyISO());
  const [limite, setLimite] = useState(paraInput(estado.fecha_limite_abonos));
  const [sorteo, setSorteo] = useState(paraInput(estado.fecha_sorteo));
  const [guardando, setGuardando] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  // Mientras el admin no escriba un nombre propio, se sugiere uno a partir de
  // las fechas: casi siempre acierta y le ahorra pensarlo.
  const nombre = tocóEtiqueta ? etiqueta : etiqueta || etiquetaSugerida(inicio, sorteo);

  const duracion = inicio && sorteo ? diasEntre(inicio, sorteo) + 1 : 0;
  const desordenadas =
    !inicio || !limite || !sorteo || limite < inicio || sorteo < limite;

  async function guardar() {
    onError(null);
    setGuardando(true);
    const { error: e } = await supabase.rpc("admin_programar_sorteo", {
      p_admin_token: getAdminToken(),
      p_etiqueta: nombre,
      p_fecha_inicio: inicio,
      p_fecha_limite_abonos: limite,
      p_fecha_sorteo: sorteo,
    });
    setGuardando(false);
    if (e) {
      onError(mensajeError(e));
      return;
    }
    setAbierto(false);
    onListo();
  }

  async function cancelarSorteo() {
    onError(null);
    setGuardando(true);
    const { error: e } = await supabase.rpc("admin_cancelar_sorteo", {
      p_admin_token: getAdminToken(),
    });
    setGuardando(false);
    setConfirmarCancelar(false);
    if (e) {
      onError(mensajeError(e));
      return;
    }
    onListo();
  }

  if (!abierto) {
    return (
      <section className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-5 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-fixed text-primary">
            <span className="material-symbols-outlined text-[18px]">calendar_month</span>
          </span>
          <h2 className="text-headline text-primary">Fechas del sorteo</h2>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Fecha etiqueta="Arranca" valor={estado.fecha_inicio} />
          <Fecha etiqueta="Cierre de abonos" valor={estado.fecha_limite_abonos} />
          <Fecha etiqueta="Se juega" valor={estado.fecha_sorteo} />
        </div>

        <button
          onClick={() => setAbierto(true)}
          className="flex h-11 items-center justify-center gap-2 rounded-lg border-2 border-outline-variant text-body-sm font-semibold text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
          Cambiar las fechas
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary-fixed text-primary">
          <span className="material-symbols-outlined text-[18px]">
            {nuevo ? "add_circle" : "edit_calendar"}
          </span>
        </span>
        <div className="flex flex-col">
          <h2 className="text-headline text-primary">
            {nuevo ? "Programar el próximo sorteo" : "Fechas del sorteo"}
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            {nuevo
              ? "El talonario se abre solo el día que elijas como arranque."
              : "Puedes estirar el plazo, nunca acortarlo si ya hay ventas."}
          </p>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-label-caps uppercase text-on-surface-variant">
          Nombre del sorteo
        </span>
        <input
          value={nombre}
          onChange={(e) => {
            setTocóEtiqueta(true);
            setEtiqueta(e.target.value);
          }}
          placeholder="Agosto 2026"
          className="h-12 w-full min-w-0 rounded-lg border-0 bg-surface-container-high px-3 text-body-lg text-on-surface outline-none focus:ring-2 focus:ring-secondary"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CampoFecha
          etiqueta="Arranca"
          valor={inicio}
          onChange={setInicio}
          bloqueado={estado.con_ventas}
          ayuda={
            estado.con_ventas
              ? "Congelado: ya hay números vendidos."
              : "El día que abre el talonario."
          }
        />
        <CampoFecha
          etiqueta="Cierre de abonos"
          valor={limite}
          onChange={setLimite}
          min={estado.con_ventas ? paraInput(estado.fecha_limite_abonos) : inicio}
          ayuda="Último día para apartar y abonar."
        />
        <CampoFecha
          etiqueta="Se juega"
          valor={sorteo}
          onChange={setSorteo}
          min={estado.con_ventas ? paraInput(estado.fecha_sorteo) : limite || inicio}
          ayuda="Después de este día no se vende más."
        />
      </div>

      {duracion > 0 && !desordenadas && (
        <p className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px]">schedule</span>
          Dura {duracion} días · se juega el {fechaLarga(sorteo)}
        </p>
      )}

      {desordenadas && (
        <p className="flex items-center gap-1.5 text-body-sm font-semibold text-error">
          <span className="material-symbols-outlined text-[16px]">error</span>
          Las fechas tienen que ir en orden: arranque, cierre de abonos y sorteo.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={guardar}
          disabled={guardando || desordenadas || !nombre.trim()}
          className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-body-sm font-semibold text-on-primary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">save</span>
          {guardando ? "Guardando..." : nuevo ? "Arrancar sorteo" : "Guardar fechas"}
        </button>
        {!nuevo && (
          <button
            onClick={() => setAbierto(false)}
            className="flex h-12 items-center justify-center rounded-lg border-2 border-outline-variant px-4 text-body-sm font-semibold text-on-surface-variant"
          >
            Cancelar
          </button>
        )}
      </div>

      {/* Cancelar el sorteo entero: solo mientras no haya nada en juego. */}
      {!nuevo && !estado.con_ventas && (
        <div className="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
          {confirmarCancelar ? (
            <>
              <p className="text-body-sm font-semibold text-on-surface">
                Se borran las fechas y el talonario queda cerrado. Como todavía
                no se vendió nada, no hay dinero que devolver.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={cancelarSorteo}
                  disabled={guardando}
                  className="flex h-12 flex-1 items-center justify-center rounded-lg bg-error text-body-sm font-semibold text-on-error disabled:opacity-60"
                >
                  Sí, cancelar el sorteo
                </button>
                <button
                  onClick={() => setConfirmarCancelar(false)}
                  className="flex h-12 items-center justify-center rounded-lg border-2 border-outline-variant px-4 text-body-sm font-semibold text-on-surface-variant"
                >
                  No
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setConfirmarCancelar(true)}
              className="flex h-11 items-center justify-center gap-2 rounded-lg border-2 border-error/40 text-body-sm font-semibold text-error"
            >
              <span className="material-symbols-outlined text-[18px]">event_busy</span>
              Cancelar este sorteo
            </button>
          )}
        </div>
      )}

      {!nuevo && estado.con_ventas && (
        <p className="flex items-start gap-1.5 rounded-lg bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[18px]">lock</span>
          Ya hay números vendidos, así que este sorteo no se puede cancelar
          desde la app: habría que decidir cómo se devuelve cada abono y qué
          pasa con las comisiones ya pagadas.
        </p>
      )}
    </section>
  );
}

function CampoFecha({
  etiqueta,
  valor,
  onChange,
  min,
  bloqueado,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  min?: string;
  bloqueado?: boolean;
  ayuda?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-label-caps uppercase text-on-surface-variant">
        {etiqueta}
      </span>
      <input
        type="date"
        value={valor}
        min={min || undefined}
        disabled={bloqueado}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full min-w-0 rounded-lg border-0 bg-surface-container-high px-3 text-body-lg text-on-surface outline-none focus:ring-2 focus:ring-secondary disabled:opacity-60"
      />
      {ayuda && <span className="text-body-sm text-on-surface-variant">{ayuda}</span>}
    </label>
  );
}

function Fecha({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-3">
      <span className="text-[10px] font-bold uppercase text-on-surface-variant">
        {etiqueta}
      </span>
      <span className="text-body-sm font-bold text-on-surface">{fechaLarga(valor)}</span>
    </div>
  );
}

/** Vista imprimible tras cerrar (§12.4: "generar PDF resumen" vía
 *  window.print(), sin depender de ninguna librería). */
function ResumenCierre({
  resultado,
  onProgramar,
}: {
  resultado: CierreResultado;
  onProgramar: () => void;
}) {
  const top = "nombre" in resultado.top_vendedor ? resultado.top_vendedor : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <h1 className="text-display-mobile text-primary">Sorteo cerrado</h1>
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
            Cierre de {resultado.etiqueta || `sorteo #${resultado.sorteo_cerrado}`}
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
                Top vendedor del sorteo
              </span>
              <span className="text-body-lg font-semibold">
                {top.nombre} · {top.tickets_activos} tickets activos
              </span>
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2 print:hidden">
        <p className="text-center text-body-sm text-on-surface-variant">
          El talonario quedó limpio y la app está en reposo: no se puede vender
          hasta que programes el siguiente sorteo.
        </p>
        <button
          onClick={onProgramar}
          className="flex h-14 items-center justify-center gap-2 rounded-lg bg-primary text-body-lg font-semibold text-on-primary shadow-lg transition-transform active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[20px]">add_circle</span>
          Programar el próximo sorteo
        </button>
      </div>
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
