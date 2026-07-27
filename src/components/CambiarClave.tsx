"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { getVendedorToken } from "@/lib/session";
import { mensajeError } from "@/lib/errores";
import { Contenedor } from "./RegistroNumero";

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
        className="h-14 w-full rounded-lg border-none bg-surface-container-high pl-12 pr-4 text-body-lg text-on-surface outline-none transition-all placeholder:text-outline focus:ring-2 focus:ring-secondary"
      />
    </div>
  );
}

export function CambiarClave({ onCerrar }: { onCerrar: () => void }) {
  const [claveActual, setClaveActual] = useState("");
  const [claveNueva, setClaveNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (claveNueva !== confirmacion) {
      setError("La confirmación no coincide con la clave nueva.");
      return;
    }

    setEnviando(true);
    const { error: e1 } = await supabase.rpc("vendedor_cambiar_clave", {
      p_token: getVendedorToken(),
      p_clave_actual: claveActual,
      p_clave_nueva: claveNueva,
    });
    setEnviando(false);

    if (e1) {
      setError(mensajeError(e1));
      return;
    }
    setListo(true);
  }

  if (listo) {
    return (
      <Contenedor titulo="Cambiar clave" onCerrar={onCerrar}>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="material-symbols-outlined filled text-[48px] text-estado-activo-bg">
            check_circle
          </span>
          <p className="text-body-lg text-on-surface">
            Tu clave se actualizó. Úsala la próxima vez que entres.
          </p>
          <button
            onClick={onCerrar}
            className="mt-2 h-12 rounded-lg bg-primary px-8 text-body-lg font-semibold text-on-primary"
          >
            Listo
          </button>
        </div>
      </Contenedor>
    );
  }

  return (
    <Contenedor titulo="Cambiar clave" onCerrar={onCerrar}>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <Campo
          icono="lock"
          type="password"
          placeholder="Clave actual"
          autoComplete="current-password"
          value={claveActual}
          onChange={(e) => setClaveActual(e.target.value)}
          required
        />
        <Campo
          icono="key"
          type="password"
          placeholder="Clave nueva (mínimo 6 caracteres)"
          autoComplete="new-password"
          minLength={6}
          value={claveNueva}
          onChange={(e) => setClaveNueva(e.target.value)}
          required
        />
        <Campo
          icono="key"
          type="password"
          placeholder="Repite la clave nueva"
          autoComplete="new-password"
          minLength={6}
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
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
          disabled={enviando}
          className="flex h-14 items-center justify-center gap-2 rounded-lg bg-primary text-body-lg font-semibold text-on-primary shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {enviando ? "Guardando..." : "Guardar clave nueva"}
        </button>
      </form>
    </Contenedor>
  );
}
