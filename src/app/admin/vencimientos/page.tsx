"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAdminToken } from "@/lib/session";
import { enlaceWhatsapp } from "@/lib/telefono";
import { mensajeError } from "@/lib/errores";
import { p2AbonoPorVencer, p2ApartadoPorVencer } from "@/lib/plantillas";

type Item = {
  tipo: "apartado" | "abonado";
  numero: number;
  cliente_nombre: string | null;
  cliente_whatsapp: string | null;
  monto_abonado: number;
  falta: number;
  dias_transcurridos: number | null;
  dias_restantes: number;
  apartado_extendido: boolean;
  fecha_cobro_pautada: string | null;
  vendedor_id: string;
  vendedor_nombre: string;
  vendedor_whatsapp: string;
};

const etiqueta = (n: number) => String(n).padStart(3, "0");

/** Urgencia por días restantes: define el color de toda la fila. */
function tono(item: Item) {
  if (item.apartado_extendido) return "extendido";
  if (item.dias_restantes < 0) return "vencido";
  if (item.dias_restantes <= 4) return "urgente";
  return "normal";
}

const BORDES: Record<string, string> = {
  vencido: "border-error",
  urgente: "border-status-pending",
  normal: "border-outline-variant/40",
  extendido: "border-estado-abonado-fg",
};

function Plazo({ item }: { item: Item }) {
  const t = tono(item);
  const estilos: Record<string, string> = {
    vencido: "bg-error-container text-on-error-container",
    urgente: "bg-estado-apartado-bg text-estado-apartado-fg",
    normal: "bg-surface-container-high text-on-surface-variant",
    extendido: "bg-estado-abonado-bg text-estado-abonado-fg",
  };
  const texto =
    t === "extendido"
      ? "Plazo extendido"
      : item.dias_restantes < 0
        ? "Vencido"
        : item.dias_restantes === 0
          ? "Vence hoy"
          : `${item.dias_restantes} ${item.dias_restantes === 1 ? "día" : "días"}`;

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${estilos[t]}`}
    >
      {texto}
    </span>
  );
}

export default function VencimientosPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<number | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [diaLimite, setDiaLimite] = useState(25);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const [v, c] = await Promise.all([
        supabase.rpc("admin_vencimientos", { p_admin_token: getAdminToken() }),
        supabase.rpc("config_publica"),
      ]);
      if (cancelado) return;
      if (!v.error && v.data) setItems(v.data as Item[]);
      if (c.data?.dia_limite_abonos) setDiaLimite(c.data.dia_limite_abonos);
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  async function liberar(item: Item) {
    if (
      !confirm(
        `¿Liberar el #${etiqueta(item.numero)}? El número vuelve a quedar disponible para cualquier vendedor.`
      )
    ) {
      return;
    }
    setError(null);
    setProcesando(item.numero);
    const { error: e } = await supabase.rpc("admin_liberar_numero", {
      p_admin_token: getAdminToken(),
      p_numero: item.numero,
    });
    setProcesando(null);
    if (e) {
      setError(mensajeError(e));
      return;
    }
    setRecarga((n) => n + 1);
  }

  if (items === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-mobile text-primary">Vencimientos</h1>
        <div className="h-32 animate-pulse rounded-xl bg-surface-container" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  const apartados = items.filter((i) => i.tipo === "apartado");
  const abonados = items.filter((i) => i.tipo === "abonado");
  const urgentes = items.filter(
    (i) => !i.apartado_extendido && i.dias_restantes <= 4
  ).length;
  const porCobrar = abonados.reduce((s, i) => s + Number(i.falta), 0);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-display-mobile text-primary">Vencimientos</h1>

      {/* Resumen */}
      <section className="relative flex flex-col gap-3 overflow-hidden rounded-xl bg-primary p-6 text-on-primary shadow-xl">
        <span className="material-symbols-outlined filled pointer-events-none absolute -right-4 -top-4 text-[120px] opacity-10">
          alarm
        </span>
        <span className="text-label-caps uppercase tracking-widest opacity-80">
          Plazos críticos
        </span>
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col">
            <span className="text-display-mobile text-status-pending">
              {urgentes}
            </span>
            <span className="text-[10px] font-bold uppercase opacity-70">
              Por vencer
            </span>
          </div>
          <div className="w-px bg-white/20" />
          <div className="flex flex-col">
            <span className="text-display-mobile">{items.length}</span>
            <span className="text-[10px] font-bold uppercase opacity-70">
              En seguimiento
            </span>
          </div>
          <div className="w-px bg-white/20" />
          <div className="flex flex-col">
            <span className="text-display-mobile">${porCobrar.toFixed(2)}</span>
            <span className="text-[10px] font-bold uppercase opacity-70">
              Por cobrar
            </span>
          </div>
        </div>
        <p className="flex items-start gap-1.5 text-body-sm opacity-80">
          <span className="material-symbols-outlined text-[16px]">
            auto_delete
          </span>
          Los apartados caducados y los abonos que no se completaron se liberan
          solos al abrir la app.
        </p>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-error-container px-4 py-3 text-body-sm text-on-error-container">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}

      {/* Apartados */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-headline text-primary">
            <span className="material-symbols-outlined text-[20px]">
              bookmark
            </span>
            Apartados
          </h2>
          <span className="text-body-sm text-on-surface-variant">
            Sin dinero · plazo de 14 días
          </span>
        </div>

        {apartados.length === 0 ? (
          <Vacio texto="No hay apartados en seguimiento." />
        ) : (
          apartados.map((i) => (
            <article
              key={i.numero}
              className={`flex flex-col gap-3 rounded-xl border-l-4 bg-surface-container-lowest p-4 shadow-sm ${BORDES[tono(i)]}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-estado-abonado-bg text-grid-number text-primary">
                  {etiqueta(i.numero)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-lg font-semibold text-on-surface">
                    {i.cliente_nombre ?? "Sin nombre"}
                  </span>
                  <span className="text-body-sm text-on-surface-variant">
                    Apartado hace {i.dias_transcurridos}{" "}
                    {i.dias_transcurridos === 1 ? "día" : "días"} · {i.vendedor_nombre}
                  </span>
                </div>
                <Plazo item={i} />
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={enlaceWhatsapp(
                    i.vendedor_whatsapp,
                    p2ApartadoPorVencer(
                      i.vendedor_nombre,
                      i.cliente_nombre ?? "su cliente",
                      i.numero,
                      i.dias_restantes
                    )
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-4 text-body-sm font-semibold text-on-secondary transition-transform active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                  Avisar al vendedor
                </a>
                {/* Liberar solo aparece donde hace falta: los apartados en
                    plazo se sueltan solos al vencer, y los extendidos son
                    justo los que el barrido nunca va a tocar. */}
                {(i.apartado_extendido || i.dias_restantes <= 0) && (
                  <button
                    disabled={procesando === i.numero}
                    onClick={() => liberar(i)}
                    className="flex h-11 items-center gap-2 rounded-lg border-2 border-error px-4 text-body-sm font-semibold text-error transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      lock_open
                    </span>
                    Liberar
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>

      {/* Abonos */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-headline text-primary">
            <span className="material-symbols-outlined text-[20px]">savings</span>
            Abonos
          </h2>
          <span className="flex items-center gap-1 text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">event</span>
            Límite: día {diaLimite}
          </span>
        </div>

        {abonados.length === 0 ? (
          <Vacio texto="No hay abonos a medio pagar." />
        ) : (
          abonados.map((i) => {
            const pagado = Number(i.monto_abonado);
            const total = pagado + Number(i.falta);
            const progreso = total > 0 ? (pagado / total) * 100 : 0;

            return (
              <article
                key={i.numero}
                className={`flex flex-col gap-3 rounded-xl border-l-4 bg-surface-container-lowest p-4 shadow-sm ${BORDES[tono(i)]}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-estado-abonado-bg text-grid-number text-primary">
                    {etiqueta(i.numero)}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-lg font-semibold text-on-surface">
                      {i.cliente_nombre ?? "Sin nombre"}
                    </span>
                    <span className="text-body-sm text-on-surface-variant">
                      {i.vendedor_nombre}
                    </span>
                  </div>
                  <Plazo item={i} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="text-on-surface-variant">
                      Pagó ${pagado.toFixed(2)} de ${total.toFixed(2)}
                    </span>
                    <span className="font-bold text-error">
                      Falta ${Number(i.falta).toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-status-pending to-secondary transition-all duration-700"
                      style={{ width: `${progreso}%` }}
                    />
                  </div>
                </div>

                <a
                  href={enlaceWhatsapp(
                    i.vendedor_whatsapp,
                    p2AbonoPorVencer(
                      i.vendedor_nombre,
                      i.cliente_nombre ?? "su cliente",
                      i.numero,
                      pagado,
                      diaLimite
                    )
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-secondary text-body-sm font-semibold text-on-secondary transition-transform active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                  Avisar al vendedor
                </a>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-low px-6 py-10 text-center">
      <span className="material-symbols-outlined text-[36px] text-outline">
        task_alt
      </span>
      <p className="text-body-sm text-on-surface-variant">{texto}</p>
    </div>
  );
}
