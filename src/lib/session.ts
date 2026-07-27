export type Rol = "admin" | "vendedor";

const KEY_ROL = "rifas_rol";
const KEY_ADMIN_TOKEN = "rifas_admin_token";
const KEY_VENDEDOR_TOKEN = "rifas_vendedor_token";
const KEY_VENDEDOR_ID = "rifas_vendedor_id";

export function getRol(): Rol | null {
  if (typeof window === "undefined") return null;
  const rol = window.localStorage.getItem(KEY_ROL);
  return rol === "admin" || rol === "vendedor" ? rol : null;
}

export function setRolVendedor(token: string, id: string) {
  window.localStorage.setItem(KEY_ROL, "vendedor");
  window.localStorage.setItem(KEY_VENDEDOR_TOKEN, token);
  window.localStorage.setItem(KEY_VENDEDOR_ID, id);
}

export function setRolAdmin(adminToken: string) {
  window.localStorage.setItem(KEY_ROL, "admin");
  window.localStorage.setItem(KEY_ADMIN_TOKEN, adminToken);
}

export function getAdminToken(): string | null {
  return window.localStorage.getItem(KEY_ADMIN_TOKEN);
}

/** Token de sesión del vendedor. Lo emite la base al entrar o registrarse. */
export function getVendedorToken(): string | null {
  return window.localStorage.getItem(KEY_VENDEDOR_TOKEN);
}

/** Solo para pintar la grilla: marca cuáles números son suyos. */
export function getVendedorId(): string | null {
  return window.localStorage.getItem(KEY_VENDEDOR_ID);
}

export function limpiarSesion() {
  window.localStorage.removeItem(KEY_ROL);
  window.localStorage.removeItem(KEY_ADMIN_TOKEN);
  window.localStorage.removeItem(KEY_VENDEDOR_TOKEN);
  window.localStorage.removeItem(KEY_VENDEDOR_ID);
}
