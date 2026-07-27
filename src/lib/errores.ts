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

  // Acceso (migración 0006)
  credenciales_invalidas: "Usuario o clave incorrectos.",
  demasiados_intentos:
    "Demasiados intentos fallidos. Espera 15 minutos o pídele al admin que te restablezca la clave.",
  codigo_invalido: "Código de invitación incorrecto.",
  usuario_ocupado: "Ese usuario ya está tomado. Elige otro.",
  usuario_corto: "El usuario debe tener al menos 3 caracteres.",
  usuario_invalido: "El usuario solo admite letras, números, punto, guion y guion bajo.",
  clave_corta: "La clave debe tener al menos 6 caracteres.",
  nombre_requerido: "Escribe tu nombre completo.",
  vendedor_no_existe: "Ese vendedor ya no existe.",
  clave_actual_incorrecta: "La clave actual no es correcta.",

  // Eliminar vendedor (migración 0007)
  vendedor_con_numeros:
    "Ese vendedor tiene números a su nombre. Libéralos o reasígnalos antes de borrarlo.",
  vendedor_con_historial:
    "Ese vendedor tiene pagos registrados. No se puede borrar sin perder ese historial.",

  // Confirmación (migración 0008)
  nota_requerida: "Escribe el motivo del rechazo: el vendedor lo va a leer.",

  // Bonos opcionales (migración 0014)
  bonos_bloqueados:
    "El mes ya arrancó: si pagas o no dinero por logros solo se decide antes de la primera venta. Podrás cambiarlo al cerrar el mes.",

  // Comisiones (migración 0009)
  sin_meta_disponible:
    "Ese vendedor no tiene metas por cobrar ahora mismo. Recarga la pantalla para ver sus datos al día.",
};

export function mensajeError(error: { message?: string } | null): string {
  const bruto = error?.message ?? "";
  for (const codigo of Object.keys(MENSAJES)) {
    if (bruto.includes(codigo)) return MENSAJES[codigo];
  }
  return "No se pudo completar la operación. Intenta de nuevo.";
}
