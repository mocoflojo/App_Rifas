import { supabase } from "@/lib/supabase";
import type { Fase } from "@/lib/sorteo";

/** Avisos del día de cada rol. Los calcula Postgres para que las dos
 *  pantallas y los badges cuenten exactamente lo mismo. */

export type AlertasAdmin = {
  por_confirmar: number;
  vencimientos: number;
  metas_por_pagar: number;
  solicitudes: number;
  fase: Fase;
};

export type AlertasVendedor = {
  cobros_hoy: number;
  apartados: number;
  abonos: number;
  rechazos: number;
  /** Números distintos que reclaman atención hoy — no la suma de los tres
   *  contadores de arriba, que se solapan entre sí. */
  agenda: number;
  logros_nuevos: number;
  fase: Fase;
  etiqueta: string;
  fecha_inicio: string | null;
  /** Día del corte de abonos. Antes era un número (el 25); ahora es una fecha
   *  suelta, porque el sorteo puede empezar y terminar cualquier día. */
  fecha_limite_abonos: string | null;
  fecha_sorteo: string | null;
  dias_para_corte: number;
  abono_minimo: number;
  precio_ticket: number;
};

/** Barrido de vencimientos (§12.2). Sin servidor no hay cron: se dispara al
 *  abrir la app. Es idempotente y toma un candado, así que llamarla de más
 *  no hace daño; por eso tampoco hace falta esperar ni mirar el resultado.
 *  Los errores se tragan a propósito: un barrido fallido no puede impedir
 *  que el usuario entre a trabajar. */
export async function aplicarVencimientos(): Promise<void> {
  try {
    await supabase.rpc("aplicar_vencimientos");
  } catch {
    /* silencio deliberado */
  }
}
