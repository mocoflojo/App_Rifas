"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getVendedorToken } from "@/lib/session";
import { RegistroNumero } from "@/components/RegistroNumero";
import { TarjetaNumero, type MiNumero } from "@/components/TarjetaNumero";
import type { AlertasVendedor } from "@/lib/alertas";

type Filtro = "todos" | "apartado" | "abonado" | "activo";

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "todos", texto: "Todos" },
  { id: "apartado", texto: "Apartados" },
  { id: "abonado", texto: "Abonados" },
  { id: "activo", texto: "Vendidos" },
];

export default function ClientesPage() {
  const [numeros, setNumeros] = useState<MiNumero[] | null>(null);
  const [config, setConfig] = useState<AlertasVendedor | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const token = getVendedorToken();
      const [n, a] = await Promise.all([
        supabase.rpc("vendedor_mis_numeros", { p_token: token }),
        supabase.rpc("vendedor_alertas", { p_token: token }),
      ]);
      if (cancelado) return;
      if (!n.error && n.data) setNumeros(n.data as MiNumero[]);
      if (!a.error && a.data) setConfig(a.data as AlertasVendedor);
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  if (numeros === null || config === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-mobile text-primary">Mis clientes</h1>
        <div className="h-12 animate-pulse rounded-lg bg-surface-container" />
        <div className="h-32 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  const texto = busqueda.trim().toLowerCase();
  const listados = numeros.filter((n) => {
    if (filtro !== "todos" && n.estado !== filtro) return false;
    if (!texto) return true;
    return (
      (n.cliente_nombre ?? "").toLowerCase().includes(texto) ||
      String(n.numero).padStart(3, "0").includes(texto)
    );
  });

  const cuenta = (f: Filtro) =>
    f === "todos" ? numeros.length : numeros.filter((n) => n.estado === f).length;

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-display-mobile text-primary">Mis clientes</h1>
          <p className="text-body-sm text-on-surface-variant">
            {numeros.length} {numeros.length === 1 ? "número" : "números"} a tu
            nombre este mes.
          </p>
        </div>

        <label className="relative flex items-center">
          <span className="material-symbols-outlined pointer-events-none absolute left-4 text-[20px] text-outline">
            search
          </span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente o número"
            className="h-12 w-full rounded-lg border-0 bg-surface-container-high pl-12 pr-4 text-body-lg text-on-surface outline-none placeholder:text-outline/60 focus:ring-2 focus:ring-secondary"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-label-caps uppercase transition-colors ${
                filtro === f.id
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {f.texto}
              <span
                className={
                  filtro === f.id ? "opacity-70" : "text-outline"
                }
              >
                {cuenta(f.id)}
              </span>
            </button>
          ))}
        </div>

        {listados.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-low px-6 py-12 text-center">
            <span className="material-symbols-outlined text-[40px] text-outline">
              person_search
            </span>
            <p className="text-body-sm text-on-surface-variant">
              {numeros.length === 0
                ? "Todavía no has tomado ningún número. Ve a Números y elige uno."
                : "Ningún cliente coincide con esa búsqueda."}
            </p>
          </div>
        ) : (
          <section className="flex flex-col gap-3">
            {listados.map((n) => (
              <TarjetaNumero
                key={n.numero}
                n={n}
                abonoMinimo={Number(config.abono_minimo)}
                diaLimite={config.dia_limite}
                precioTicket={Number(config.precio_ticket)}
                onGestionar={setAbierto}
              />
            ))}
          </section>
        )}
      </div>

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
