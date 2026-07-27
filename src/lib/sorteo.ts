/** El sorteo ya no es "el mes": tiene fecha de arranque, fecha de corte de
 *  abonos y fecha de juego, todas puestas a mano por el admin (migración
 *  0015). Estas son las cinco fases que devuelve `_fase_sorteo()` en Postgres
 *  y lo que cada una significa en pantalla. */

export type Fase =
  | "sin_sorteo"   // no hay ninguno programado
  | "programado"   // hay fechas, pero todavía no abre
  | "venta"        // apartar, abonar y pagar
  | "solo_pago"    // pasó el corte de abonos: solo pago completo
  | "cerrando";    // ya se jugó; falta cerrarlo

/** Si el vendedor puede tomar números nuevos ahora mismo. */
export const puedeVender = (f: Fase) => f === "venta" || f === "solo_pago";

export const FASES: Record<Fase, { texto: string; icono: string; clase: string }> = {
  sin_sorteo: {
    texto: "Sin sorteo activo",
    icono: "event_busy",
    clase: "bg-surface-container text-on-surface-variant",
  },
  programado: {
    texto: "Programado",
    icono: "event_upcoming",
    clase: "bg-estado-abonado-bg text-estado-abonado-fg",
  },
  venta: {
    texto: "En venta",
    icono: "storefront",
    clase: "bg-estado-activo-bg text-estado-activo-fg",
  },
  solo_pago: {
    texto: "Solo pago completo",
    icono: "hourglass_bottom",
    clase: "bg-estado-apartado-bg text-estado-apartado-fg",
  },
  cerrando: {
    texto: "Listo para cerrar",
    icono: "lock_clock",
    clase: "bg-error-container text-on-error-container",
  },
};

/** Una fecha suelta ('2026-08-15') es un día del calendario, no un instante.
 *  Pasarla por `new Date(iso)` la interpreta en UTC y luego la baja a la hora
 *  local: en Venezuela (UTC-4) eso la corre un día hacia atrás. Se arma
 *  partiendo el texto. */
export function aFecha(iso: string): Date {
  const [anio, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

/** "15 ago" — para chips y listas apretadas. */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return aFecha(iso).toLocaleDateString("es-VE", { day: "numeric", month: "short" });
}

/** "15 de agosto de 2026" — para textos explicativos. */
export function fechaLarga(iso: string | null): string {
  if (!iso) return "—";
  return aFecha(iso).toLocaleDateString("es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Formato que entiende un <input type="date">. */
export function paraInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function hoyISO(): string {
  const h = new Date();
  const mes = String(h.getMonth() + 1).padStart(2, "0");
  const dia = String(h.getDate()).padStart(2, "0");
  return `${h.getFullYear()}-${mes}-${dia}`;
}

/** Días entre dos fechas sueltas, sin que la hora meta ruido. */
export function diasEntre(desde: string, hasta: string): number {
  const ms = aFecha(hasta).getTime() - aFecha(desde).getTime();
  return Math.round(ms / 86_400_000);
}

/** Nombre por defecto de un sorteo, a partir de sus fechas: "Agosto 2026" si
 *  empieza y termina en el mismo mes, "Ago–Sep 2026" si lo cruza. */
export function etiquetaSugerida(inicio: string, fin: string): string {
  if (!inicio || !fin) return "";
  const a = aFecha(inicio);
  const b = aFecha(fin);
  const anio = b.getFullYear();
  const largo = (d: Date) => d.toLocaleDateString("es-VE", { month: "long" });
  const corto = (d: Date) => d.toLocaleDateString("es-VE", { month: "short" }).replace(".", "");
  const may = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  if (a.getMonth() === b.getMonth() && a.getFullYear() === anio) {
    return `${may(largo(b))} ${anio}`;
  }
  return `${may(corto(a))}–${may(corto(b))} ${anio}`;
}
