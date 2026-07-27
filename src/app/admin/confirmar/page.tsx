"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAdminToken } from "@/lib/session";
import { mensajeError } from "@/lib/errores";
import { enlaceWhatsapp } from "@/lib/telefono";
import { p1Confirmacion } from "@/lib/plantillas";

type Pendiente = {
  numero: number;
  cliente_nombre: string;
  cliente_whatsapp: string | null;
  monto_abonado: number;
  fecha_ultimo_abono: string;
  vendedor_id: string;
  vendedor_nombre: string;
  vendedor_whatsapp: string;
};

type Premio = { nombre: string; valor: number };

/** Confirmación exitosa: datos para el mensaje P1 al comprador. */
type Confirmado = {
  numero: number;
  cliente_nombre: string;
  cliente_whatsapp: string | null;
  vendedor_nombre: string;
  tickets_activos: number;
};

const etiqueta = (n: number) => `#${String(n).padStart(3, "0")}`;

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString("es-VE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ConfirmarPage() {
  const [cola, setCola] = useState<Pendiente[] | null>(null);
  const [premios, setPremios] = useState<Premio[]>([]);
  const [procesando, setProcesando] = useState<number | null>(null);
  /** Número cuyo formulario de rechazo está abierto, y su nota. */
  const [rechazando, setRechazando] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<Confirmado | null>(null);

  /* Se incrementa para volver a pedir la cola (tras una acción o un evento). */
  const [recarga, setRecarga] = useState(0);
  const cargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const [q, c] = await Promise.all([
        supabase.rpc("admin_cola_confirmacion", { p_admin_token: getAdminToken() }),
        supabase.rpc("config_publica"),
      ]);
      if (cancelado) return;
      if (!q.error && q.data) setCola(q.data as Pendiente[]);
      if (c.data?.premios) setPremios(c.data.premios as Premio[]);
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  /* La cola se refresca sola cuando un vendedor marca un pagado. */
  useEffect(() => {
    const canal = supabase
      .channel("cola-confirmacion")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "numeros" },
        () => cargar()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [cargar]);

  async function confirmar(p: Pendiente) {
    setError(null);
    setProcesando(p.numero);
    const { data, error: e } = await supabase.rpc("admin_confirmar_numero", {
      p_admin_token: getAdminToken(),
      p_numero: p.numero,
    });
    setProcesando(null);
    if (e || !data) {
      setError(mensajeError(e));
      cargar();
      return;
    }
    setConfirmado(data as Confirmado);
    cargar();
  }

  async function rechazar(p: Pendiente) {
    setError(null);
    setProcesando(p.numero);
    const { error: e } = await supabase.rpc("admin_rechazar_numero", {
      p_admin_token: getAdminToken(),
      p_numero: p.numero,
      p_nota: nota,
    });
    setProcesando(null);
    if (e) {
      setError(mensajeError(e));
      return;
    }
    setRechazando(null);
    setNota("");
    cargar();
  }

  if (cola === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-mobile text-primary">Por confirmar</h1>
        <div className="h-32 animate-pulse rounded-xl bg-surface-container" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  const totalDinero = cola.reduce((s, p) => s + Number(p.monto_abonado), 0);
  const vendedoresUnicos = new Set(cola.map((p) => p.vendedor_id)).size;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-display-mobile text-primary">Por confirmar</h1>

      {/* Resumen */}
      <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl bg-primary p-6 text-on-primary shadow-xl">
        <span className="material-symbols-outlined filled pointer-events-none absolute -right-4 -top-4 text-[120px] opacity-10">
          pending_actions
        </span>
        <span className="flex items-center gap-2 text-label-caps uppercase tracking-widest opacity-80">
          <span className="material-symbols-outlined text-[16px]">payments</span>
          Dinero por verificar
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-display-mobile">${totalDinero.toFixed(2)}</span>
          <span className="text-body-sm opacity-60">USD</span>
        </div>
        <div className="mt-2 flex gap-4">
          <div className="flex flex-col">
            <span className="text-[18px] font-bold">{cola.length}</span>
            <span className="text-[10px] font-bold uppercase opacity-60">Ventas</span>
          </div>
          <div className="h-8 w-px bg-white/20" />
          <div className="flex flex-col">
            <span className="text-[18px] font-bold">{vendedoresUnicos}</span>
            <span className="text-[10px] font-bold uppercase opacity-60">
              Vendedores
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-error-container px-4 py-3 text-body-sm text-on-error-container">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}

      {/* Cola */}
      {cola.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-low px-6 py-12 text-center">
          <span className="material-symbols-outlined text-[40px] text-outline">
            task_alt
          </span>
          <p className="text-body-sm text-on-surface-variant">
            No hay ventas esperando confirmación.
          </p>
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          {cola.map((p) => (
            <div
              key={p.numero}
              className="flex flex-col gap-4 rounded-xl border-l-4 border-status-pending bg-surface-container-lowest p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-estado-abonado-bg text-body-sm font-bold text-primary">
                    {iniciales(p.vendedor_nombre)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-label-caps uppercase text-on-surface-variant">
                      Vendedor
                    </span>
                    <span className="text-body-lg font-semibold text-on-surface">
                      {p.vendedor_nombre}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-label-caps uppercase text-on-surface-variant">
                    Monto
                  </span>
                  <span className="text-[18px] font-bold text-secondary">
                    ${Number(p.monto_abonado).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg bg-surface-container-low p-3">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase text-on-surface-variant">
                    Número
                  </span>
                  <span className="flex items-center gap-1 text-grid-number text-primary">
                    <span className="material-symbols-outlined text-[18px]">
                      confirmation_number
                    </span>
                    {etiqueta(p.numero)}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="text-[10px] font-bold uppercase text-on-surface-variant">
                    Cliente
                  </span>
                  <span className="truncate text-body-sm text-on-surface">
                    {p.cliente_nombre}
                  </span>
                </div>
              </div>

              <span className="text-body-sm text-on-surface-variant">
                Marcado el {fechaCorta(p.fecha_ultimo_abono)}
              </span>

              {rechazando === p.numero ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="¿Por qué se rechaza? El vendedor verá esta nota."
                    rows={2}
                    className="w-full rounded-lg border-0 bg-surface-container-high p-3 text-body-sm text-on-surface outline-none placeholder:text-outline/60 focus:ring-2 focus:ring-error"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={procesando === p.numero || !nota.trim()}
                      onClick={() => rechazar(p)}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-error text-body-sm font-semibold text-on-error transition-transform active:scale-[0.98] disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">block</span>
                      Rechazar venta
                    </button>
                    <button
                      onClick={() => {
                        setRechazando(null);
                        setNota("");
                      }}
                      className="h-11 rounded-lg border-2 border-outline-variant px-4 text-body-sm font-semibold text-on-surface-variant"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    disabled={procesando === p.numero}
                    onClick={() => confirmar(p)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-estado-activo-bg py-3 text-label-caps uppercase tracking-wider text-on-primary shadow-sm transition-transform active:scale-95 disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      check_circle
                    </span>
                    Confirmar recibido
                  </button>
                  <button
                    disabled={procesando === p.numero}
                    onClick={() => {
                      setRechazando(p.numero);
                      setNota("");
                    }}
                    aria-label={`Rechazar el ${etiqueta(p.numero)}`}
                    className="flex items-center justify-center rounded-lg bg-surface-container-high px-4 py-3 text-on-surface-variant transition-colors active:bg-error-container active:text-on-error-container disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[20px]">block</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Activado: mensaje P1 listo para el comprador */}
      {confirmado && (
        <ActivadoDialog
          datos={confirmado}
          premios={premios}
          onCerrar={() => setConfirmado(null)}
        />
      )}
    </div>
  );
}

/** Tras activar: el enlace P1 al comprador, y aviso de meta si completó una. */
function ActivadoDialog({
  datos,
  premios,
  onCerrar,
}: {
  datos: Confirmado;
  premios: Premio[];
  onCerrar: () => void;
}) {
  const meta = datos.tickets_activos % 10 === 0;
  const mensaje = p1Confirmacion(datos.cliente_nombre, datos.numero, premios);

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
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="material-symbols-outlined filled text-[48px] text-estado-activo-bg">
            verified
          </span>
          <h2 className="text-headline text-primary">
            {etiqueta(datos.numero)} activado
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            {datos.cliente_nombre} ya participa en el sorteo.
            {" "}{datos.vendedor_nombre} lleva {datos.tickets_activos} tickets activos.
          </p>
        </div>

        {meta && (
          <div className="flex items-start gap-2 rounded-lg bg-estado-libre-bg px-4 py-3 text-body-sm text-estado-activo-bg">
            <span className="material-symbols-outlined text-[18px]">emoji_events</span>
            ¡{datos.vendedor_nombre} completó una meta de 10! Recuerda pagarle sus $60.
          </div>
        )}

        {datos.cliente_whatsapp ? (
          <a
            href={enlaceWhatsapp(datos.cliente_whatsapp, mensaje)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-14 items-center justify-center gap-2 rounded-lg bg-secondary text-body-lg font-semibold text-on-secondary shadow-lg transition-transform active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[20px]">chat</span>
            Enviar comprobante al comprador
          </a>
        ) : (
          <div className="rounded-lg bg-surface-container px-4 py-3 text-center text-body-sm text-on-surface-variant">
            El cliente no tiene WhatsApp registrado.
          </div>
        )}

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
