"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getRol, setRolAdmin, setRolVendedor } from "@/lib/session";
import { mensajeError } from "@/lib/errores";

type Pestana = "vendedor" | "admin";
type Modo = "entrar" | "registrarse";

/* El rol vive en localStorage, que no existe al renderizar en el servidor.
   useSyncExternalStore devuelve "cargando" en el servidor y en la hidratación,
   y el valor real en el render siguiente: así no hay desajuste de hidratación
   ni un setState dentro de un efecto. */
const sinSuscripcion = () => () => {};
const rolEnServidor = () => "cargando" as const;

/** Input con icono a la izquierda, según el sistema de diseño. */
function Campo({
  icono,
  ...props
}: { icono: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="group relative">
      <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-outline transition-colors group-focus-within:text-secondary">
        {icono}
      </span>
      <input
        {...props}
        className="h-14 w-full rounded-lg border-none bg-surface-container-lowest pl-12 pr-4 text-body-lg text-on-surface shadow-sm outline-none transition-all placeholder:text-outline focus:ring-2 focus:ring-secondary"
      />
    </div>
  );
}

function BannerError({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-error-container px-4 py-3 text-body-sm text-on-error-container">
      <span className="material-symbols-outlined text-[18px]">error</span>
      {texto}
    </div>
  );
}

function BotonEnviar({
  cargando,
  children,
}: {
  cargando: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={cargando}
      className="flex h-14 items-center justify-center gap-2 rounded-lg bg-linear-to-r from-primary to-secondary text-body-lg font-semibold text-on-primary shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
    >
      {children}
      {!cargando && (
        <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
      )}
    </button>
  );
}

export default function Entrada() {
  const router = useRouter();
  const rol = useSyncExternalStore(sinSuscripcion, getRol, rolEnServidor);
  const [pestana, setPestana] = useState<Pestana>("vendedor");
  const [modo, setModo] = useState<Modo>("entrar");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [claveAdmin, setClaveAdmin] = useState("");

  useEffect(() => {
    if (rol === "admin") router.replace("/admin/resumen");
    else if (rol === "vendedor") router.replace("/vendedor/resumen");
  }, [rol, router]);

  function cambiar(cambio: () => void) {
    cambio();
    setError(null);
  }

  async function entrarVendedor(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { data, error: e1 } = await supabase.rpc("login_vendedor", {
      p_usuario: usuario,
      p_clave: clave,
    });
    setCargando(false);

    if (e1) return setError(mensajeError(e1));
    // Los fallos de credenciales vienen en el cuerpo, no como excepción.
    if (!data || data.error) return setError(mensajeError({ message: data?.error }));

    setRolVendedor(data.token, data.id);
    router.replace("/vendedor/resumen");
  }

  async function registrarVendedor(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { data, error: e1 } = await supabase.rpc("registrar_vendedor", {
      p_codigo: codigo.trim(),
      p_nombre: nombre.trim(),
      p_whatsapp: whatsapp.trim(),
      p_usuario: usuario,
      p_clave: clave,
    });
    setCargando(false);

    if (e1 || !data) return setError(mensajeError(e1));

    setRolVendedor(data.token, data.id);
    router.replace("/vendedor/resumen");
  }

  async function entrarAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { data, error: e1 } = await supabase.rpc("login_admin", {
      p_clave: claveAdmin,
    });
    setCargando(false);

    if (e1) return setError(mensajeError(e1));
    if (!data) return setError("Clave incorrecta.");

    setRolAdmin(data as string);
    router.replace("/admin/resumen");
  }

  /* Mientras no se sepa el rol, o si hay sesión y toca redirigir, no se pinta
     la pantalla de acceso para no verla parpadear. */
  if (rol !== null) return null;

  return (
    <main className="flex min-h-dvh flex-col items-center px-6 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        {/* Marca */}
        <div className="flex size-24 items-center justify-center rounded-full bg-surface-container-lowest shadow-[0_10px_25px_rgba(26,82,118,0.08)]">
          <div className="flex size-16 items-center justify-center rounded-xl bg-primary text-on-primary">
            <span className="material-symbols-outlined text-[32px]">
              confirmation_number
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-display-mobile text-primary">¡Bienvenido!</h1>
          <p className="text-body-lg text-on-surface-variant">
            Gestiona la rifa mensual y tus ventas desde un solo lugar.
          </p>
        </div>

        {/* Selector de rol */}
        <div className="flex w-full rounded-lg bg-surface-container p-1">
          {(["vendedor", "admin"] as const).map((p) => (
            <button
              key={p}
              onClick={() => cambiar(() => setPestana(p))}
              className={`flex-1 rounded-[0.75rem] py-3 text-label-caps uppercase transition-all ${
                pestana === p
                  ? "bg-surface-container-lowest text-primary shadow-sm"
                  : "text-on-surface-variant"
              }`}
            >
              {p === "vendedor" ? "Soy vendedor" : "Soy admin"}
            </button>
          ))}
        </div>

        {pestana === "vendedor" ? (
          <div className="flex w-full flex-col gap-4">
            {/* Entrar / Crear cuenta */}
            <div className="flex gap-2">
              {(["entrar", "registrarse"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => cambiar(() => setModo(m))}
                  className={`flex-1 rounded-full py-2 text-label-caps uppercase transition-colors ${
                    modo === m
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  {m === "entrar" ? "Entrar" : "Crear cuenta"}
                </button>
              ))}
            </div>

            {modo === "entrar" ? (
              <form onSubmit={entrarVendedor} className="flex flex-col gap-3">
                <Campo
                  icono="person"
                  placeholder="Usuario"
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  required
                />
                <Campo
                  icono="lock"
                  type="password"
                  placeholder="Clave"
                  autoComplete="current-password"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  required
                />

                {error && <BannerError texto={error} />}

                <BotonEnviar cargando={cargando}>
                  {cargando ? "Entrando..." : "Entrar"}
                </BotonEnviar>

                <p className="px-1 text-body-sm text-on-surface-variant">
                  ¿Olvidaste tu clave? Escríbele al administrador por WhatsApp y él
                  te la restablece.
                </p>
              </form>
            ) : (
              <form onSubmit={registrarVendedor} className="flex flex-col gap-3">
                <Campo
                  icono="badge"
                  placeholder="Nombre completo"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
                <Campo
                  icono="chat"
                  placeholder="WhatsApp (+58...)"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  required
                />
                <Campo
                  icono="person"
                  placeholder="Usuario (para entrar)"
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  required
                />
                <Campo
                  icono="lock"
                  type="password"
                  placeholder="Clave (mínimo 6 caracteres)"
                  autoComplete="new-password"
                  minLength={6}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  required
                />
                <Campo
                  icono="key"
                  placeholder="Código de invitación"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  required
                />

                {error && <BannerError texto={error} />}

                <BotonEnviar cargando={cargando}>
                  {cargando ? "Enviando..." : "Solicitar acceso"}
                </BotonEnviar>

                <div className="flex items-start gap-3 rounded-lg bg-estado-abonado-bg px-4 py-3 text-body-sm text-primary">
                  <span className="material-symbols-outlined text-[20px]">info</span>
                  Tu solicitud será revisada por el administrador antes de darte
                  acceso.
                </div>
              </form>
            )}
          </div>
        ) : (
          <form onSubmit={entrarAdmin} className="flex w-full flex-col gap-3">
            <Campo
              icono="lock"
              type="password"
              placeholder="Clave maestra"
              autoComplete="current-password"
              value={claveAdmin}
              onChange={(e) => setClaveAdmin(e.target.value)}
              required
            />

            {error && <BannerError texto={error} />}

            <BotonEnviar cargando={cargando}>
              {cargando ? "Entrando..." : "Entrar"}
            </BotonEnviar>
          </form>
        )}
      </div>
    </main>
  );
}
