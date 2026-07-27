/** Catálogo de insignias (§11 del discovery). Los nombres, iconos y
 *  descripciones son presentación pura; la condición real vive en
 *  _verificar_logros (migración 0012). */

export type LogroId =
  | "primera_meta"
  | "vendedor_rapido"
  | "sesenta"
  | "racha_3"
  | "top_mes";

type DefinicionLogro = {
  emoji: string;
  nombre: string;
  /** cupo/meta se sustituyen con los valores reales de config del vendedor. */
  descripcion: (cupo: number, meta: number) => string;
  /** Solo la otorga el cierre de mes (Fase 9): no hay forma de "ir progresando". */
  soloAlCierre?: boolean;
};

export const CATALOGO_LOGROS: Record<LogroId, DefinicionLogro> = {
  primera_meta: {
    emoji: "🥉",
    nombre: "Primera meta",
    descripcion: (_cupo, meta) => `Completaste tu primer bloque de ${meta} tickets activos.`,
  },
  vendedor_rapido: {
    emoji: "⚡",
    nombre: "Vendedor rápido",
    descripcion: () => "30 tickets activos antes del día 8 del mes.",
  },
  sesenta: {
    emoji: "💎",
    nombre: "Cupo completo",
    descripcion: (cupo) => `Alcanzaste tus ${cupo} tickets activos del mes.`,
  },
  racha_3: {
    emoji: "🔥",
    nombre: "En racha",
    descripcion: (cupo) => `Cupo completo (${cupo}/${cupo}) tres meses seguidos.`,
  },
  top_mes: {
    emoji: "👑",
    nombre: "Top vendedor",
    descripcion: () => "Quien más tickets activos tuvo al cerrar el mes.",
    soloAlCierre: true,
  },
};

export const ORDEN_LOGROS: LogroId[] = [
  "primera_meta",
  "vendedor_rapido",
  "sesenta",
  "racha_3",
  "top_mes",
];
