"use client";

import { enlaceWhatsapp } from "@/lib/telefono";
import { p3RecordatorioCobro, p4RecordatorioApartado } from "@/lib/plantillas";
import { fechaCorta, fechaLarga } from "@/lib/sorteo";

/** Fila de vendedor_mis_numeros (migración 0011). La comparten "Mis
 *  clientes" y la agenda para que las dos cuenten los plazos igual. */
export type MiNumero = {
  numero: number;
  estado: "apartado" | "abonado" | "activo";
  cliente_nombre: string | null;
  cliente_whatsapp: string | null;
  monto_abonado: number;
  falta: number;
  fecha_apartado: string | null;
  fecha_ultimo_abono: string | null;
  fecha_cobro_pautada: string | null;
  apartado_extendido: boolean;
  pendiente_confirmacion: boolean;
  nota_rechazo: string | null;
  dias_transcurridos: number | null;
  /** Días que faltan para el plazo. null = sin plazo (activo o extendido). */
  dias_restantes: number | null;
};

const etiqueta = (n: number) => String(n).padStart(3, "0");
const dinero = (n: number) => `$${Number(n).toFixed(2)}`;

/** Vive en lib/sorteo junto al resto del manejo de fechas sueltas; se
 *  reexporta porque las pantallas de vendedor ya la importan desde aquí. */
export { fechaCorta } from "@/lib/sorteo";

/** Cuán apremiante es el plazo. Manda el color de toda la tarjeta. */
export function urgencia(n: MiNumero): "vencido" | "urgente" | "normal" | "ninguna" {
  if (n.pendiente_confirmacion || n.estado === "activo") return "ninguna";
  if (n.dias_restantes === null) return "ninguna";
  if (n.dias_restantes < 0) return "vencido";
  if (n.dias_restantes <= 3) return "urgente";
  return "normal";
}

const BORDES: Record<string, string> = {
  vencido: "border-error",
  urgente: "border-status-pending",
  normal: "border-outline-variant/40",
  ninguna: "border-outline-variant/40",
};

function Plazo({ n }: { n: MiNumero }) {
  if (n.pendiente_confirmacion) {
    return (
      <Chip clase="bg-estado-abonado-bg text-estado-abonado-fg">Por confirmar</Chip>
    );
  }
  if (n.estado === "activo") {
    return <Chip clase="bg-estado-libre-bg text-estado-activo-bg">Vendido</Chip>;
  }
  if (n.apartado_extendido) {
    return <Chip clase="bg-estado-abonado-bg text-estado-abonado-fg">Extendido</Chip>;
  }
  if (n.dias_restantes === null) return null;

  const u = urgencia(n);
  const clase =
    u === "vencido"
      ? "bg-error-container text-on-error-container"
      : u === "urgente"
        ? "bg-estado-apartado-bg text-estado-apartado-fg"
        : "bg-surface-container-high text-on-surface-variant";
  const texto =
    n.dias_restantes < 0
      ? "Vencido"
      : n.dias_restantes === 0
        ? "Vence hoy"
        : `${n.dias_restantes} ${n.dias_restantes === 1 ? "día" : "días"}`;

  return <Chip clase={clase}>{texto}</Chip>;
}

function Chip({ children, clase }: { children: React.ReactNode; clase: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${clase}`}
    >
      {children}
    </span>
  );
}

/** Mensaje que le toca a este número: P3 si ya hay dinero de por medio,
 *  P4 si es un apartado sin pagar (§10). */
function recordatorio(
  n: MiNumero,
  abonoMinimo: number,
  fechaLimite: string | null
): string {
  const cliente = n.cliente_nombre ?? "amigo";
  const corte = fechaLimite ? fechaLarga(fechaLimite) : "la fecha de cierre";
  if (n.estado === "apartado") {
    const limite =
      n.dias_restantes !== null
        ? new Date(
            Date.now() + n.dias_restantes * 86400000
          ).toLocaleDateString("es-VE", { day: "numeric", month: "long" })
        : corte;
    return p4RecordatorioApartado(cliente, n.numero, abonoMinimo, limite);
  }
  return p3RecordatorioCobro(cliente, n.numero, Number(n.falta), corte);
}

export function TarjetaNumero({
  n,
  abonoMinimo,
  fechaLimite,
  precioTicket,
  onGestionar,
}: {
  n: MiNumero;
  abonoMinimo: number;
  /** Fecha de corte de abonos del sorteo en curso (migración 0015). */
  fechaLimite: string | null;
  precioTicket: number;
  onGestionar: (numero: number) => void;
}) {
  const pagado = Number(n.monto_abonado);
  const progreso = precioTicket > 0 ? (pagado / precioTicket) * 100 : 0;
  const cerrado = n.estado === "activo" || n.pendiente_confirmacion;

  return (
    <article
      className={`flex flex-col gap-3 rounded-xl border-l-4 bg-surface-container-lowest p-4 shadow-sm ${BORDES[urgencia(n)]}`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => onGestionar(n.numero)}
          aria-label={`Gestionar el número ${etiqueta(n.numero)}`}
          className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-estado-abonado-bg text-grid-number text-primary transition-transform active:scale-95"
        >
          {etiqueta(n.numero)}
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body-lg font-semibold text-on-surface">
            {n.cliente_nombre ?? "Sin nombre"}
          </span>
          <span className="text-body-sm text-on-surface-variant">
            {n.estado === "apartado"
              ? `Apartado hace ${n.dias_transcurridos ?? 0} ${
                  n.dias_transcurridos === 1 ? "día" : "días"
                }`
              : `${dinero(pagado)} de ${dinero(precioTicket)}`}
          </span>
        </div>
        <Plazo n={n} />
      </div>

      {n.nota_rechazo && (
        <p className="flex items-start gap-2 rounded-lg bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          <span className="material-symbols-outlined text-[16px]">error</span>
          El admin rechazó la venta: “{n.nota_rechazo}”
        </p>
      )}

      {n.estado === "abonado" && !cerrado && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-body-sm">
            <span className="text-on-surface-variant">Progreso del pago</span>
            <span className="font-bold text-error">
              Falta {dinero(Number(n.falta))}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full rounded-full bg-linear-to-r from-status-pending to-secondary transition-all duration-700"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}

      {n.fecha_cobro_pautada && (
        <span className="flex items-center gap-1.5 text-body-sm text-secondary">
          <span className="material-symbols-outlined text-[16px]">event</span>
          Cobro pautado para el {fechaCorta(n.fecha_cobro_pautada)}
        </span>
      )}

      {!cerrado && (
        <div className="flex flex-wrap gap-2">
          {n.cliente_whatsapp && (
            <a
              href={enlaceWhatsapp(
                n.cliente_whatsapp,
                recordatorio(n, abonoMinimo, fechaLimite)
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-4 text-body-sm font-semibold text-on-secondary transition-transform active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px]">chat</span>
              Recordarle
            </a>
          )}
          <button
            onClick={() => onGestionar(n.numero)}
            className="flex h-11 items-center gap-2 rounded-lg border-2 border-outline-variant px-4 text-body-sm font-semibold text-on-surface-variant transition-transform active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            Gestionar
          </button>
        </div>
      )}
    </article>
  );
}
