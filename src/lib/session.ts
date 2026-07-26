export type Rol = "admin" | "vendedor";

const KEY_ROL = "rifas_rol";
const KEY_DEVICE_TOKEN = "rifas_device_token";
const KEY_ADMIN_TOKEN = "rifas_admin_token";
const KEY_VENDEDOR_ID = "rifas_vendedor_id";

export function getRol(): Rol | null {
  if (typeof window === "undefined") return null;
  const rol = window.localStorage.getItem(KEY_ROL);
  return rol === "admin" || rol === "vendedor" ? rol : null;
}

export function setRolVendedor(vendedorId: string) {
  window.localStorage.setItem(KEY_ROL, "vendedor");
  window.localStorage.setItem(KEY_VENDEDOR_ID, vendedorId);
}

export function setRolAdmin(adminToken: string) {
  window.localStorage.setItem(KEY_ROL, "admin");
  window.localStorage.setItem(KEY_ADMIN_TOKEN, adminToken);
}

export function getAdminToken(): string | null {
  return window.localStorage.getItem(KEY_ADMIN_TOKEN);
}

export function getVendedorId(): string | null {
  return window.localStorage.getItem(KEY_VENDEDOR_ID);
}

export function limpiarSesion() {
  window.localStorage.removeItem(KEY_ROL);
  window.localStorage.removeItem(KEY_ADMIN_TOKEN);
  window.localStorage.removeItem(KEY_VENDEDOR_ID);
}

export function getDeviceToken(): string {
  let token = window.localStorage.getItem(KEY_DEVICE_TOKEN);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(KEY_DEVICE_TOKEN, token);
  }
  return token;
}
