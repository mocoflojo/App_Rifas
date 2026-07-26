export type Rol = "admin" | "vendedor";

const KEY_ROL = "rifas_rol";
const KEY_DEVICE_TOKEN = "rifas_device_token";

export function getRol(): Rol | null {
  if (typeof window === "undefined") return null;
  const rol = window.localStorage.getItem(KEY_ROL);
  return rol === "admin" || rol === "vendedor" ? rol : null;
}

export function setRol(rol: Rol) {
  window.localStorage.setItem(KEY_ROL, rol);
}

export function limpiarSesion() {
  window.localStorage.removeItem(KEY_ROL);
}

export function getDeviceToken(): string {
  let token = window.localStorage.getItem(KEY_DEVICE_TOKEN);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(KEY_DEVICE_TOKEN, token);
  }
  return token;
}
