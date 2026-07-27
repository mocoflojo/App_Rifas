"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getVendedorToken } from "@/lib/session";
import { mensajeError } from "@/lib/errores";
import { enlaceWhatsapp } from "@/lib/telefono";

type Accion = "apartar" | "abonar" | "pagado";

type Detalle = {
  numero: number;
  estado: "libre" | "apartado" | "abonado" | "activo";
  propio: boolean;
  cliente_nombre: string | null;
  cliente_whatsapp: string | null;
  monto_abonado: number;
  fecha_apartado: string | null;
  fecha_ultimo_abono: string | null;
  fecha_cobro_pautada: string | null;
  pendiente_confirmacion: boolean;
  nota_rechazo: string | null;
};

type Config = {
  precio_ticket: number;
  abono_minimo: number;
  dias_limite_apartado: number;
};

type Cupo = { cupo: number; tomados: number; disponibles: number };

const dinero = (n: number) => `$${Number(n).toFixed(2)}`;

/* ------------------------------------------------------------------ */

function Campo({
  icono,
  etiqueta,
  ...props
}: { icono: string; etiqueta: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center gap-2 px-1 text-label-caps uppercase text-on-surface-variant">
        <span className="material-symbols-outlined text-[18px]">{icono}</span>
        {etiqueta}
      </span>
      <input
        {...props}
        className="h-14 w-full rounded-lg border-0 bg-surface-container-high px-4 text-body-lg text-on-surface outline-none transition-all placeholder:text-outline/60 focus:ring-2 focus:ring-secondary"
      />
    </label>
  );
}

function OpcionAccion({
  activa,
  icono,
  color,
  titulo,
  descripcion,
  onClick,
}: {
  activa: boolean;
  icono: string;
  color: string;
  titulo: string;
  descripcion: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl border-2 p-4 text-left transition-all ${
        activa
          ? "border-secondary bg-secondary-container/25"
          : "border-transparent bg-surface-container"
      }`}
    >
      <span className="flex items-center gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${color}`}
        >
          <span className="material-symbols-outlined text-[22px]">{icono}</span>
        </span>
        <span className="flex flex-col">
          <span className="text-body-lg font-semibold leading-tight text-on-surface">
            {titulo}
          </span>
          <span className="text-body-sm text-on-surface-variant">{descripcion}</span>
        </span>
      </span>
      {activa && (
        <span className="material-symbols-outlined filled text-secondary">
          check_circle
        </span>
      )}
    </button>
  );
}

function Aviso({ texto, tono }: { texto: string; tono: "error" | "info" }) {
  const clases =
    tono === "error"
      ? "bg-error-container text-on-error-container"
      : "bg-estado-abonado-bg text-primary";
  return (
    <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-body-sm ${clases}`}>
      <span className="material-symbols-outlined text-[18px]">
        {tono === "error" ? "error" : "info"}
      </span>
      {texto}
    </div>
  );
}

function BotonAccion({
  children,
  icono,
  variante = "primario",
  ...props
}: {
  icono: string;
  variante?: "primario" | "secundario" | "borde" | "peligro";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const estilos = {
    primario: "bg-primary text-on-primary shadow-lg",
    secundario: "bg-secondary text-on-secondary shadow-lg",
    borde: "border-2 border-outline-variant text-on-surface-variant",
    peligro: "border-2 border-error text-error",
  }[variante];

  return (
    <button
      {...props}
      className={`flex h-14 flex-1 items-center justify-center gap-2 rounded-lg text-body-lg font-semibold transition-transform active:scale-[0.98] disabled:opacity-50 ${estilos}`}
    >
      <span className="material-symbols-outlined text-[20px]">{icono}</span>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */

type Props = {
  numero: number;
  onCerrar: () => void;
  /** Se llama tras una operación exitosa, con un texto para el aviso. */
  onListo: (mensaje: string) => void;
};

export function RegistroNumero({ numero, onCerrar, onListo }: Props) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [cupo, setCupo] = useState<Cupo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [accion, setAccion] = useState<Accion | null>(null);
  const [monto, setMonto] = useState("");
  /** yyyy-mm-dd para el <input type="date">. */
  const [fechaCobro, setFechaCobro] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const token = getVendedorToken();
      const [d, c, q] = await Promise.all([
        supabase.rpc("vendedor_numero_detalle", {
          p_token: token,
          p_numero: numero,
        }),
        supabase.rpc("config_publica"),
        supabase.rpc("vendedor_resumen_cupo", { p_token: token }),
      ]);
      if (cancelado) return;
      const fila = Array.isArray(d.data) ? (d.data[0] ?? null) : null;
      setDetalle(fila);
      // El <input type="date"> solo entiende yyyy-mm-dd.
      setFechaCobro(fila?.fecha_cobro_pautada?.slice(0, 10) ?? "");
      setConfig(c.data as Config);
      setCupo(q.data as Cupo);
    })();
    return () => {
      cancelado = true;
    };
  }, [numero]);

  /* Los builders de supabase-js son "thenables", no Promise, de ahí PromiseLike. */
  async function ejecutar(
    fn: () => PromiseLike<{ error: { message?: string } | null }>,
    ok: string
  ) {
    setError(null);
    setEnviando(true);
    const { error: e } = await fn();
    setEnviando(false);
    if (e) {
      setError(mensajeError(e));
      return;
    }
    onListo(ok);
  }

  if (!detalle || !config) {
    return (
      <Contenedor onCerrar={onCerrar} titulo={`#${String(numero).padStart(3, "0")}`}>
        <div className="h-40 animate-pulse rounded-xl bg-surface-container" />
      </Contenedor>
    );
  }

  const etiqueta = `#${String(numero).padStart(3, "0")}`;
  const restante = config.precio_ticket - detalle.monto_abonado;

  /* ---------- Número ajeno ---------- */
  if (!detalle.propio && detalle.estado !== "libre") {
    return (
      <Contenedor onCerrar={onCerrar} titulo={etiqueta}>
        <Aviso tono="info" texto="Este número lo tiene otro vendedor." />
      </Contenedor>
    );
  }

  /* ---------- Número libre: registrar ---------- */
  if (detalle.estado === "libre") {
    /* Cambiar de acción descarta el error de la acción anterior. */
    const elegir = (a: Accion) => {
      setAccion(a);
      setError(null);
    };
    const montoNum = Number(monto) || 0;
    const aRegistrar =
      accion === "apartar" ? 0 : accion === "pagado" ? config.precio_ticket : montoNum;

    const listo =
      nombre.trim().length > 0 &&
      accion !== null &&
      (accion !== "abonar" ||
        (montoNum >= config.abono_minimo && montoNum < config.precio_ticket));

    const resumen =
      accion === "apartar"
        ? `Queda reservado ${config.dias_limite_apartado} días sin pago. Puedes extenderlo o liberarlo cuando quieras.`
        : accion === "abonar"
          ? `Se registra el abono. Faltarán ${dinero(config.precio_ticket - montoNum)} para completar el ticket.`
          : accion === "pagado"
            ? "Pasa a la cola del admin. El número se activa cuando él confirme que recibió el dinero."
            : "Elige una acción para continuar.";

    return (
      <Contenedor onCerrar={onCerrar} titulo={`Registrar ${etiqueta}`}>
        <div className="flex flex-col gap-5">
          {/* Cabecera */}
          <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl bg-primary-container p-5">
            <span className="material-symbols-outlined filled pointer-events-none absolute -right-4 -top-4 text-[110px] opacity-10">
              confirmation_number
            </span>
            <span className="text-label-caps uppercase tracking-widest text-on-primary-container">
              Número seleccionado
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-display-mobile text-on-primary-container">
                {etiqueta}
              </span>
              <span className="text-body-sm text-on-primary-container/80">
                {dinero(config.precio_ticket)}
              </span>
            </div>
            {cupo && (
              <span className="text-body-sm text-on-primary-container/80">
                Te quedan {cupo.disponibles} de {cupo.cupo} números de tu cupo.
              </span>
            )}
          </div>

          {cupo?.disponibles === 0 && (
            <Aviso
              tono="error"
              texto="Ya usaste todo tu cupo. Libera un apartado o pídele más cupo al admin."
            />
          )}

          <Campo
            icono="person"
            etiqueta="Nombre del cliente"
            placeholder="Ej. Juan Pérez"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <Campo
            icono="chat"
            etiqueta="WhatsApp"
            type="tel"
            placeholder="+58 414 000 0000"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />

          <div className="flex flex-col gap-3">
            <span className="flex items-center gap-2 px-1 text-label-caps uppercase text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">payments</span>
              Tipo de operación
            </span>
            <OpcionAccion
              activa={accion === "apartar"}
              onClick={() => elegir("apartar")}
              icono="schedule"
              color="bg-estado-apartado-bg text-estado-apartado-fg"
              titulo="Apartar"
              descripcion="Reserva sin pago"
            />
            <OpcionAccion
              activa={accion === "abonar"}
              onClick={() => elegir("abonar")}
              icono="account_balance_wallet"
              color="bg-estado-abonado-bg text-estado-abonado-fg"
              titulo="Abonar"
              descripcion={`Pago parcial, mínimo ${dinero(config.abono_minimo)}`}
            />
            <OpcionAccion
              activa={accion === "pagado"}
              onClick={() => elegir("pagado")}
              icono="verified"
              color="bg-estado-libre-bg text-estado-activo-bg"
              titulo="Pago completo"
              descripcion={`Los ${dinero(config.precio_ticket)} entregados a la banca`}
            />
          </div>

          {accion === "abonar" && (
            <div className="flex flex-col gap-2">
              <Campo
                icono="attach_money"
                etiqueta="Monto del abono"
                type="number"
                inputMode="decimal"
                min={config.abono_minimo}
                max={config.precio_ticket - 0.01}
                step="0.5"
                placeholder={String(config.abono_minimo)}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
              <div className="flex gap-2">
                {[config.abono_minimo, 6, 8, 10].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMonto(String(m))}
                    className="flex-1 rounded-full bg-surface-container py-2 text-label-caps text-on-surface-variant transition-colors"
                  >
                    {dinero(m)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resumen */}
          <div className="flex flex-col gap-3 rounded-xl bg-surface-container-low p-5">
            <div className="flex items-center justify-between">
              <span className="text-body-sm text-on-surface-variant">
                Monto a registrar
              </span>
              <span className="text-headline text-primary">{dinero(aRegistrar)}</span>
            </div>
            <p className="rounded-lg bg-primary/5 p-3 text-center text-body-sm text-primary">
              {resumen}
            </p>

            {error && <Aviso tono="error" texto={error} />}

            <BotonAccion
              icono="arrow_forward"
              disabled={!listo || enviando || cupo?.disponibles === 0}
              onClick={() =>
                ejecutar(
                  () =>
                    supabase.rpc("vendedor_tomar_numero", {
                      p_token: getVendedorToken(),
                      p_numero: numero,
                      p_cliente_nombre: nombre,
                      p_cliente_whatsapp: whatsapp,
                      p_accion: accion,
                      p_monto: accion === "abonar" ? montoNum : 0,
                    }),
                  accion === "apartar"
                    ? `Número ${etiqueta} apartado para ${nombre.trim()}.`
                    : accion === "abonar"
                      ? `Abono de ${dinero(montoNum)} registrado en el ${etiqueta}.`
                      : `${etiqueta} enviado al admin para confirmar.`
                )
              }
            >
              {enviando ? "Registrando..." : "Confirmar registro"}
            </BotonAccion>
          </div>
        </div>
      </Contenedor>
    );
  }

  /* ---------- Número propio: gestionar ---------- */
  const montoNum = Number(monto) || 0;
  const progreso = (detalle.monto_abonado / config.precio_ticket) * 100;

  return (
    <Contenedor onCerrar={onCerrar} titulo={`Gestionar ${etiqueta}`}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-xl bg-primary-container p-5">
          <span className="text-label-caps uppercase tracking-widest text-on-primary-container">
            {detalle.estado === "apartado" ? "Apartado" : "Abonado"}
          </span>
          <span className="text-display-mobile text-on-primary-container">{etiqueta}</span>
          <span className="text-body-lg text-on-primary-container">
            {detalle.cliente_nombre}
          </span>
          {detalle.cliente_whatsapp && (
            <a
              href={enlaceWhatsapp(detalle.cliente_whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-body-sm text-on-primary-container"
            >
              <span className="material-symbols-outlined text-[16px]">chat</span>
              {detalle.cliente_whatsapp}
            </a>
          )}
        </div>

        {/* Progreso del pago */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-label-caps uppercase text-on-surface-variant">
              Abonado
            </span>
            <span className="text-body-lg font-semibold text-primary">
              {dinero(detalle.monto_abonado)} de {dinero(config.precio_ticket)}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full rounded-full bg-linear-to-r from-primary to-secondary transition-all duration-700"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>

        {detalle.nota_rechazo && (
          <Aviso
            tono="error"
            texto={`El admin rechazó tu venta: "${detalle.nota_rechazo}". Resuélvelo con el cliente y vuelve a intentarlo.`}
          />
        )}

        {!detalle.pendiente_confirmacion && (
          <div className="flex flex-col gap-2">
            <Campo
              icono="event"
              etiqueta="Fecha de cobro pautada"
              type="date"
              value={fechaCobro}
              onChange={(e) => setFechaCobro(e.target.value)}
            />
            <div className="flex gap-2">
              <BotonAccion
                icono="event_available"
                variante="borde"
                disabled={enviando || !fechaCobro}
                onClick={() =>
                  ejecutar(
                    () =>
                      supabase.rpc("vendedor_pautar_cobro", {
                        p_token: getVendedorToken(),
                        p_numero: numero,
                        p_fecha: fechaCobro,
                      }),
                    `Cobro del ${etiqueta} pautado para el ${fechaCobro}.`
                  )
                }
              >
                Pautar cobro
              </BotonAccion>
              {detalle.fecha_cobro_pautada && (
                <BotonAccion
                  icono="event_busy"
                  variante="borde"
                  disabled={enviando}
                  onClick={() =>
                    ejecutar(
                      () =>
                        supabase.rpc("vendedor_pautar_cobro", {
                          p_token: getVendedorToken(),
                          p_numero: numero,
                          p_fecha: null,
                        }),
                      `Se quitó la fecha de cobro del ${etiqueta}.`
                    )
                  }
                >
                  Quitar
                </BotonAccion>
              )}
            </div>
          </div>
        )}

        {detalle.pendiente_confirmacion ? (
          <Aviso
            tono="info"
            texto="Ya marcaste este número como pagado. Está esperando que el admin confirme el dinero; mientras tanto no se puede modificar."
          />
        ) : (
          <>
            {/* Abonar más */}
            <div className="flex flex-col gap-2">
              <Campo
                icono="attach_money"
                etiqueta={`Registrar abono (faltan ${dinero(restante)})`}
                type="number"
                inputMode="decimal"
                min={0.5}
                max={restante}
                step="0.5"
                placeholder="0.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
              <BotonAccion
                icono="savings"
                variante="secundario"
                disabled={enviando || montoNum <= 0 || montoNum > restante}
                onClick={() =>
                  ejecutar(
                    () =>
                      supabase.rpc("vendedor_abonar", {
                        p_token: getVendedorToken(),
                        p_numero: numero,
                        p_monto: montoNum,
                      }),
                    `Abono de ${dinero(montoNum)} registrado en el ${etiqueta}.`
                  )
                }
              >
                Registrar abono
              </BotonAccion>
            </div>

            {error && <Aviso tono="error" texto={error} />}

            <div className="flex flex-col gap-2 border-t border-outline-variant/40 pt-4">
              <BotonAccion
                icono="verified"
                disabled={enviando}
                onClick={() =>
                  ejecutar(
                    () =>
                      supabase.rpc("vendedor_marcar_pagado", {
                        p_token: getVendedorToken(),
                        p_numero: numero,
                      }),
                    `${etiqueta} enviado al admin para confirmar.`
                  )
                }
              >
                Pagó completo y entregué el dinero
              </BotonAccion>

              {detalle.estado === "apartado" && (
                <div className="flex gap-2">
                  <BotonAccion
                    icono="more_time"
                    variante="borde"
                    disabled={enviando}
                    onClick={() =>
                      ejecutar(
                        () =>
                          supabase.rpc("vendedor_extender_apartado", {
                            p_token: getVendedorToken(),
                            p_numero: numero,
                          }),
                        `Plazo del ${etiqueta} extendido.`
                      )
                    }
                  >
                    Extender
                  </BotonAccion>
                  <BotonAccion
                    icono="lock_open"
                    variante="peligro"
                    disabled={enviando}
                    onClick={() =>
                      ejecutar(
                        () =>
                          supabase.rpc("vendedor_liberar_numero", {
                            p_token: getVendedorToken(),
                            p_numero: numero,
                          }),
                        `${etiqueta} liberado.`
                      )
                    }
                  >
                    Liberar
                  </BotonAccion>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Contenedor>
  );
}

/* ------------------------------------------------------------------ */

/** Hoja que sube desde abajo en móvil y diálogo centrado en escritorio. */
export function Contenedor({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      <button
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="pb-safe relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl bg-background md:max-h-[85dvh] md:max-w-lg md:rounded-xl"
      >
        <header className="glass flex h-16 shrink-0 items-center gap-2 border-b border-outline-variant/30 px-4">
          <button
            onClick={onCerrar}
            aria-label="Volver"
            className="flex size-10 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 className="text-headline text-primary">{titulo}</h2>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
