"use client";

/** Historial de comisiones. Lo usan las dos caras de la app: el admin lo abre
 *  por vendedor y el vendedor ve el suyo en "Mi resumen" (§13, Fase 6). */

export type Pago = {
  id: string;
  monto: number;
  tipo: "meta" | "liquidacion" | "abonoPerdido" | "logro";
  fecha: string;
  detalle: string | null;
};

const TIPOS: Record<Pago["tipo"], { etiqueta: string; icono: string; color: string }> = {
  meta: {
    etiqueta: "Meta",
    icono: "emoji_events",
    color: "bg-estado-libre-bg text-estado-activo-bg",
  },
  liquidacion: {
    etiqueta: "Liquidación",
    icono: "receipt_long",
    color: "bg-estado-abonado-bg text-estado-abonado-fg",
  },
  abonoPerdido: {
    etiqueta: "Abono perdido",
    icono: "call_split",
    color: "bg-estado-apartado-bg text-estado-apartado-fg",
  },
  // Bono por logro: medalla y ámbar, para no confundirlo con una meta de $60.
  logro: {
    etiqueta: "Bono por logro",
    icono: "military_tech",
    color: "bg-estado-apartado-bg text-estado-apartado-fg",
  },
};

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString("es-VE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ListaPagos({ pagos }: { pagos: Pago[] }) {
  if (pagos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-container-low px-6 py-8 text-center">
        <span className="material-symbols-outlined text-[32px] text-outline">
          savings
        </span>
        <p className="text-body-sm text-on-surface-variant">
          Todavía no hay comisiones pagadas este mes.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {pagos.map((p) => {
        const tipo = TIPOS[p.tipo] ?? TIPOS.meta;
        return (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3"
          >
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tipo.color}`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {tipo.icono}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-sm font-semibold text-on-surface">
                {p.detalle || tipo.etiqueta}
              </span>
              <span className="text-label-caps uppercase text-on-surface-variant">
                {fechaCorta(p.fecha)}
              </span>
            </div>
            <span className="shrink-0 text-body-lg font-bold text-secondary">
              +${Number(p.monto).toFixed(2)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
