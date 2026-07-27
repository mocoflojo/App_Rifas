/** Plantillas de mensajes WhatsApp (sección 10 del discovery).
 *  La app genera el enlace wa.me con los datos reales y el usuario solo
 *  toca enviar. Ningún mensaje al comprador menciona comisiones (§2). */

type Premio = { nombre: string; valor: number };

const dinero = (n: number) => `$${Number(n).toLocaleString("en-US")}`;

function descripcionPremios(premios: Premio[]): string {
  if (!premios?.length) return "los premios del mes";
  const valor = dinero(premios[0].valor);
  return `${premios.length} motos de ${valor}`;
}

/** P1 — Confirmación de número (admin → comprador), al activar. */
export function p1Confirmacion(
  nombre: string,
  numero: number,
  premios: Premio[]
): string {
  return (
    `Hola ${nombre}, tu número para la rifa de este mes es el ` +
    `#${String(numero).padStart(3, "0")}. Participas por ${descripcionPremios(premios)}. ` +
    `El sorteo es el último día del mes en vivo. ` +
    `Guarda este mensaje como comprobante. ¡Mucha suerte! 🏍️`
  );
}

/** P2 — Alerta de abono por vencer (admin → vendedor). */
export function p2AbonoPorVencer(
  vendedor: string,
  cliente: string,
  numero: number,
  monto: number,
  diaLimite: number
): string {
  return (
    `⚠️ Hola ${vendedor}, el abono de ${cliente} ` +
    `(número #${String(numero).padStart(3, "0")}, $${monto.toFixed(2)} pagados) ` +
    `vence el día ${diaLimite}. Recuérdale completar el pago para activar su número.`
  );
}

/** P2b — Alerta de apartado por vencer (admin → vendedor).
 *  Hermana de P2: el apartado no tiene dinero de por medio, así que el
 *  aviso es de cupo, no de cobro. */
export function p2ApartadoPorVencer(
  vendedor: string,
  cliente: string,
  numero: number,
  diasRestantes: number
): string {
  const plazo =
    diasRestantes <= 0
      ? "ya se le venció el plazo"
      : `le ${diasRestantes === 1 ? "queda" : "quedan"} ${diasRestantes} ${
          diasRestantes === 1 ? "día" : "días"
        }`;
  return (
    `⏰ Hola ${vendedor}, el apartado de ${cliente} ` +
    `(número #${String(numero).padStart(3, "0")}) ${plazo}. ` +
    `Si no abona, el número se libera solo y lo pierde. ` +
    `¿Puedes pasarle buscando el abono?`
  );
}

/** P3 — Recordatorio de cobro (vendedor → cliente). */
export function p3RecordatorioCobro(
  cliente: string,
  numero: number,
  restante: number,
  diaLimite: number
): string {
  return (
    `Hola ${cliente} 👋 Te recuerdo tu número #${String(numero).padStart(3, "0")} ` +
    `de la rifa de las 3 motos. Te faltan $${restante.toFixed(2)} para completarlo ` +
    `y el plazo es hasta el día ${diaLimite}. ¿Cuándo paso a cobrarte? 🏍️`
  );
}

/** P4 — Recordatorio de apartado (vendedor → cliente). */
export function p4RecordatorioApartado(
  cliente: string,
  numero: number,
  abonoMinimo: number,
  fecha: string
): string {
  return (
    `Hola ${cliente} 👋 Tienes apartado el número #${String(numero).padStart(3, "0")} ` +
    `de la rifa. Para asegurarlo necesitas abonar mínimo $${abonoMinimo.toFixed(2)} ` +
    `antes del ${fecha}. ¿Te paso a buscar el abono?`
  );
}

/** P6 — Comprobante de pago de meta (admin → vendedor).
 *  Va dirigido al vendedor, no al comprador: aquí sí se habla de comisión. */
export function p6PagoMeta(
  vendedor: string,
  monto: number,
  metaNumero: number,
  ticketsActivos: number
): string {
  return (
    `💰 Hola ${vendedor}, te pagué la comisión de tu meta ${metaNumero}: ` +
    `${dinero(monto)}. Vas por ${ticketsActivos} tickets activos este mes. ` +
    `¡Sigue así! 🏍️`
  );
}

/** P5 — Notificación de ganador (admin → comprador). */
export function p5Ganador(nombre: string, numero: number, valorPremio: number): string {
  return (
    `🎉 ¡FELICIDADES ${nombre}! Tu número #${String(numero).padStart(3, "0")} ` +
    `salió ganador de una MOTO valorada en ${dinero(valorPremio)} en el sorteo de hoy. ` +
    `Te contactamos para coordinar la entrega. 🏍️🏆`
  );
}
