/** Catálogo de insignias (§11 del discovery, ampliado en la Fase 9 con el
 *  sistema de bonos y meta colectiva). Los nombres, iconos y descripciones
 *  son presentación pura; la condición real vive en _verificar_logros y
 *  cierre_mes (migración 0013).
 *
 *  "primera_meta" se eliminó del catálogo: no premiaba nada que no fuera a
 *  pasar solo, ya que el vendedor persigue la comisión de $60/10 tickets
 *  de todos modos. Las filas históricas de vendedores que ya la ganaron
 *  simplemente no aparecen (el motor dejó de otorgarlas). */

export type LogroId =
  | "vendedor_rapido"
  | "sesenta"
  | "racha_3"
  | "top_mes_1"
  | "top_mes_2"
  | "top_mes_3";

type DefinicionLogro = {
  emoji: string;
  nombre: string;
  descripcion: (cupo: number, dias: number) => string;
  /** Fondo del emoji cuando la insignia está ganada. */
  color: string;
  /** Solo se resuelve al cerrar el mes: no hay forma de "ir progresando". */
  soloAlCierre?: boolean;
  /** El dinero depende de que el equipo llegue a la meta colectiva. */
  requiereMetaColectiva?: boolean;
};

export const CATALOGO_LOGROS: Record<LogroId, DefinicionLogro> = {
  vendedor_rapido: {
    emoji: "⚡",
    nombre: "Vendedor rápido",
    descripcion: (_cupo, dias) => `30 tickets activos antes del día ${dias} del mes.`,
    color: "bg-estado-apartado-bg",
    requiereMetaColectiva: true,
  },
  sesenta: {
    emoji: "💎",
    nombre: "Cupo completo",
    descripcion: (cupo) => `Alcanzaste tus ${cupo} tickets activos del mes.`,
    color: "bg-estado-abonado-bg",
    requiereMetaColectiva: true,
  },
  racha_3: {
    emoji: "🔥",
    nombre: "En racha",
    descripcion: (cupo) => `Cupo completo (${cupo}/${cupo}) tres meses seguidos.`,
    color: "bg-error-container",
    requiereMetaColectiva: true,
  },
  top_mes_1: {
    emoji: "👑",
    nombre: "Top vendedor #1",
    descripcion: () => "El que más tickets activos tuvo al cerrar el mes.",
    color: "bg-estado-apartado-bg",
    soloAlCierre: true,
  },
  top_mes_2: {
    emoji: "🥈",
    nombre: "Top vendedor #2",
    descripcion: () => "Segundo lugar en tickets activos al cerrar el mes.",
    color: "bg-surface-container-highest",
    soloAlCierre: true,
  },
  top_mes_3: {
    emoji: "🥉",
    nombre: "Top vendedor #3",
    descripcion: () => "Tercer lugar en tickets activos al cerrar el mes.",
    color: "bg-error-container/60",
    soloAlCierre: true,
  },
};

export const ORDEN_LOGROS: LogroId[] = [
  "vendedor_rapido",
  "sesenta",
  "racha_3",
  "top_mes_1",
  "top_mes_2",
  "top_mes_3",
];
