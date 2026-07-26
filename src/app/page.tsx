"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getRol, setRolAdmin, setRolVendedor, getDeviceToken } from "@/lib/session";

type Pestana = "vendedor" | "admin";

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

export default function Entrada() {
  const router = useRouter();
  const [revisando, setRevisando] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("vendedor");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [clave, setClave] = useState("");

  useEffect(() => {
    const rol = getRol();
    if (rol === "admin") router.replace("/admin/resumen");
    else if (rol === "vendedor") router.replace("/vendedor/resumen");
    else setRevisando(false);
  }, [router]);

  function cambiarPestana(p: Pestana) {
    setPestana(p);
    setError(null);
  }

  async function registrarVendedor(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { data, error } = await supabase.rpc("registrar_vendedor", {
      p_codigo: codigo.trim(),
      p_nombre: nombre.trim(),
      p_whatsapp: whatsapp.trim(),
      p_device_token: getDeviceToken(),
    });
    setCargando(false);
    if (error || !data) {
      setError(
        error?.message.includes("codigo_invalido")
          ? "Código de invitación incorrecto."
          : "No se pudo registrar. Intenta de nuevo."
      );
      return;
    }
    setRolVendedor(data.id);
    router.replace("/vendedor/resumen");
  }

  async function entrarAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { data, error } = await supabase.rpc("login_admin", { p_clave: clave });
    setCargando(false);
    if (error || !data) {
      setError("Clave incorrecta.");
      return;
    }
    setRolAdmin(data as string);
    router.replace("/admin/resumen");
  }

  if (revisando) return null;

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
              onClick={() => cambiarPestana(p)}
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
          <form onSubmit={registrarVendedor} className="flex w-full flex-col gap-3">
            <Campo
              icono="person"
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
              icono="key"
              placeholder="Código de invitación"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              required
            />

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-error-container px-4 py-3 text-body-sm text-on-error-container">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="flex h-14 items-center justify-center gap-2 rounded-lg bg-linear-to-r from-primary to-secondary text-body-lg font-semibold text-on-primary shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {cargando ? "Enviando..." : "Solicitar acceso"}
              {!cargando && (
                <span className="material-symbols-outlined text-[20px]">
                  arrow_forward
                </span>
              )}
            </button>

            <div className="flex items-start gap-3 rounded-lg bg-estado-abonado-bg px-4 py-3 text-body-sm text-primary">
              <span className="material-symbols-outlined text-[20px]">info</span>
              Tu solicitud será revisada por el administrador antes de darte acceso.
            </div>
          </form>
        ) : (
          <form onSubmit={entrarAdmin} className="flex w-full flex-col gap-3">
            <Campo
              icono="lock"
              type="password"
              placeholder="Clave maestra"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              required
            />

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-error-container px-4 py-3 text-body-sm text-on-error-container">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="flex h-14 items-center justify-center gap-2 rounded-lg bg-linear-to-r from-primary to-secondary text-body-lg font-semibold text-on-primary shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {cargando ? "Entrando..." : "Entrar"}
              {!cargando && (
                <span className="material-symbols-outlined text-[20px]">
                  arrow_forward
                </span>
              )}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
