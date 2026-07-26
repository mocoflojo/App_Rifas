/** Traduce los códigos que levantan las funciones de Postgres a algo que el
 *  vendedor pueda leer. Los códigos viven en las migraciones 0004 y 0005. */
const MENSAJES: Record<string, string> = {
  numero_ocupado:
    "Ese número acaba de ser tomado por otro vendedor. Elige otro.",
  cupo_lleno:
    "Llegaste a tu cupo de números. Libera alguno o pídele más cupo al admin.",
  solo_pago_completo:
    "Ya pasó el día de cierre: desde hoy solo se aceptan ventas con pago completo.",
  abono_insuficiente: "El abono mínimo es de $5.",
  monto_excede: "Ese monto pasa del precio del ticket.",
  monto_invalido: "Escribe un monto válido.",
  cliente_requerido: "Escribe el nombre del cliente.",
  accion_invalida: "Elige una acción.",
  ya_enviado: "Este número ya está esperando la confirmación del admin.",
  no_es_tuyo: "Ese número no es tuyo.",
  estado_invalido:
    "El número cambió de estado mientras lo tenías abierto. Vuelve a abrirlo.",
  no_autorizado: "Tu sesión no está activa. Vuelve a entrar.",
};

export function mensajeError(error: { message?: string } | null): string {
  const bruto = error?.message ?? "";
  for (const codigo of Object.keys(MENSAJES)) {
    if (bruto.includes(codigo)) return MENSAJES[codigo];
  }
  return "No se pudo completar la operación. Intenta de nuevo.";
}
