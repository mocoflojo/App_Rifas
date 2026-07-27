/** Deja solo dígitos y arregla el formato local venezolano (0424...) al
 *  internacional que necesita wa.me (58424...). Sin esto, un número guardado
 *  como "04247718876" genera un enlace que WhatsApp no puede resolver. */
export function numeroWhatsapp(texto: string): string {
  const digitos = texto.replace(/\D/g, "");

  if (digitos.startsWith("58")) return digitos;
  if (digitos.startsWith("0") && digitos.length === 11) return "58" + digitos.slice(1);
  if (digitos.length === 10 && digitos.startsWith("4")) return "58" + digitos;

  return digitos;
}

export function enlaceWhatsapp(numero: string, mensaje?: string): string {
  const base = `https://wa.me/${numeroWhatsapp(numero)}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}
