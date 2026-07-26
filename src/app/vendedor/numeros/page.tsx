"use client";

import { useEffect, useState } from "react";
import { Talonario } from "@/components/Talonario";
import { RegistroNumero } from "@/components/RegistroNumero";

export default function NumerosVendedorPage() {
  const [abierto, setAbierto] = useState<number | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);

  // El aviso de éxito se retira solo.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  return (
    <>
      <Talonario modo="vendedor" onAbrir={setAbierto} recarga={recarga} />

      {abierto !== null && (
        <RegistroNumero
          numero={abierto}
          onCerrar={() => setAbierto(null)}
          onListo={(mensaje) => {
            setAbierto(null);
            setAviso(mensaje);
            setRecarga((n) => n + 1);
          }}
        />
      )}

      {aviso && (
        <div
          role="status"
          className="pb-safe fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md items-center gap-2 rounded-lg bg-estado-activo-bg px-4 py-3 text-body-sm text-estado-activo-fg shadow-2xl md:bottom-6"
        >
          <span className="material-symbols-outlined filled text-[20px]">
            check_circle
          </span>
          {aviso}
        </div>
      )}
    </>
  );
}
