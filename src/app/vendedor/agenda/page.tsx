"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getVendedorToken } from "@/lib/session";
import { RegistroNumero } from "@/components/RegistroNumero";
import { TarjetaNumero, type MiNumero } from "@/components/TarjetaNumero";
import type { AlertasVendedor } from "@/lib/alertas";

/** Fecha de hoy en formato yyyy-mm-dd según el reloj del teléfono.
 *  en-CA es el atajo estándar para conseguir ese formato sin armarlo a mano. */
const hoyISO = () => new Date().toLocaleDateString("en-CA");

/** El día pautado se guarda como fecha, sin hora: basta con comparar los
 *  primeros 10 caracteres para no arrastrar líos de zona horaria. */
const diaPautado = (n: MiNumero) => n.fecha_cobro_pautada?.slice(0, 10) ?? null;

function Seccion({
  icono,
  titulo,
  descripcion,
  tono,
  numeros,
  config,
  onGestionar,
}: {
  icono: string;
  titulo: string;
  descripcion: string;
  tono: "urgente" | "aviso" | "normal";
  numeros: MiNumero[];
  config: AlertasVendedor;
  onGestionar: (n: number) => void;
}) {
  if (numeros.length === 0) return null;

  const colores = {
    urgente: "bg-error-container text-on-error-container",
    aviso: "bg-estado-apartado-bg text-estado-apartado-fg",
    normal: "bg-estado-abonado-bg text-estado-abonado-fg",
  }[tono];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${colores}`}>
          <span className="material-symbols-outlined text-[20px]">{icono}</span>
        </div>
        <div className="flex min-w-0 flex-col">
          <h2 className="text-headline text-primary">
            {titulo} ({numeros.length})
          </h2>
          <p className="text-body-sm text-on-surface-variant">{descripcion}</p>
        </div>
      </div>
      {numeros.map((n) => (
        <TarjetaNumero
          key={n.numero}
          n={n}
          abonoMinimo={Number(config.abono_minimo)}
          diaLimite={config.dia_limite}
          precioTicket={Number(config.precio_ticket)}
          onGestionar={onGestionar}
        />
      ))}
    </section>
  );
}

export default function AgendaPage() {
  const [numeros, setNumeros] = useState<MiNumero[] | null>(null);
  const [config, setConfig] = useState<AlertasVendedor | null>(null);
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
        <h1 className="text-display-mobile text-primary">Agenda de cobros</h1>
        <div className="h-32 animate-pulse rounded-xl bg-surface-container" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  const hoy = hoyISO();
  const abiertos = numeros.filter(
    (n) => !n.pendiente_confirmacion && n.estado !== "activo"
  );

  /* Cada número entra en una sola lista, en orden de urgencia: lo pautado
     para hoy manda sobre el plazo, porque es un compromiso que el vendedor
     ya tomó con el cliente. */
  const paraHoy = abiertos.filter((n) => {
    const d = diaPautado(n);
    return d !== null && d <= hoy;
  });
  const yaListados = new Set(paraHoy.map((n) => n.numero));

  const apartadosPorVencer = abiertos.filter(
    (n) =>
      !yaListados.has(n.numero) &&
      n.estado === "apartado" &&
      !n.apartado_extendido &&
      n.dias_restantes !== null &&
      n.dias_restantes <= 4
  );
  apartadosPorVencer.forEach((n) => yaListados.add(n.numero));

  const abonosPorCerrar = abiertos.filter(
    (n) =>
      !yaListados.has(n.numero) &&
      n.estado === "abonado" &&
      n.dias_restantes !== null &&
      n.dias_restantes <= 3
  );
  abonosPorCerrar.forEach((n) => yaListados.add(n.numero));

  const proximos = abiertos
    .filter((n) => !yaListados.has(n.numero) && diaPautado(n) !== null)
    .sort((a, b) => (diaPautado(a)! < diaPautado(b)! ? -1 : 1));

  const totalAlertas =
    paraHoy.length + apartadosPorVencer.length + abonosPorCerrar.length;

  const fechaLarga = new Date().toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-label-caps uppercase text-secondary">
            {fechaLarga}
          </span>
          <h1 className="text-display-mobile text-primary">Agenda de cobros</h1>
        </div>

        {/* Resumen del día */}
        <section className="relative flex flex-col gap-3 overflow-hidden rounded-xl bg-primary p-6 text-on-primary shadow-xl">
          <span className="material-symbols-outlined filled pointer-events-none absolute -right-4 -top-4 text-[120px] opacity-10">
            calendar_month
          </span>
          <span className="text-label-caps uppercase tracking-widest opacity-80">
            Tu día
          </span>
          {totalAlertas === 0 ? (
            <p className="flex items-center gap-2 text-body-lg">
              <span className="material-symbols-outlined filled text-[22px] text-secondary-fixed">
                check_circle
              </span>
              Nada urgente hoy. Buen momento para vender.
            </p>
          ) : (
            <div className="flex flex-wrap gap-6">
              <div className="flex flex-col">
                <span className="text-display-mobile">{paraHoy.length}</span>
                <span className="text-[10px] font-bold uppercase opacity-70">
                  Cobros de hoy
                </span>
              </div>
              <div className="w-px bg-white/20" />
              <div className="flex flex-col">
                <span className="text-display-mobile text-status-pending">
                  {apartadosPorVencer.length}
                </span>
                <span className="text-[10px] font-bold uppercase opacity-70">
                  Apartados por vencer
                </span>
              </div>
              <div className="w-px bg-white/20" />
              <div className="flex flex-col">
                <span className="text-display-mobile text-status-pending">
                  {abonosPorCerrar.length}
                </span>
                <span className="text-[10px] font-bold uppercase opacity-70">
                  Abonos por cerrar
                </span>
              </div>
            </div>
          )}
          <span className="flex items-start gap-1.5 text-body-sm opacity-80">
            <span className="material-symbols-outlined text-[16px]">event</span>
            {config.dias_para_corte >= 0
              ? `Quedan ${config.dias_para_corte} ${
                  config.dias_para_corte === 1 ? "día" : "días"
                } para el cierre de abonos (día ${config.dia_limite}).`
              : `Ya pasó el día ${config.dia_limite}: desde ahora solo se aceptan ventas con pago completo.`}
          </span>
        </section>

        <Seccion
          icono="today"
          titulo="Para hoy"
          descripcion="Cobros que pautaste para hoy o antes."
          tono="urgente"
          numeros={paraHoy}
          config={config}
          onGestionar={setAbierto}
        />
        <Seccion
          icono="bookmark"
          titulo="Apartados por vencer"
          descripcion="Si no abonan, el número se libera solo."
          tono="aviso"
          numeros={apartadosPorVencer}
          config={config}
          onGestionar={setAbierto}
        />
        <Seccion
          icono="savings"
          titulo="Abonos por cerrar"
          descripcion={`Deben completar los pagos antes del día ${config.dia_limite} o pierden el dinero.`}
          tono="aviso"
          numeros={abonosPorCerrar}
          config={config}
          onGestionar={setAbierto}
        />
        <Seccion
          icono="event_upcoming"
          titulo="Próximos cobros"
          descripcion="Fechas que pautaste más adelante."
          tono="normal"
          numeros={proximos}
          config={config}
          onGestionar={setAbierto}
        />

        {totalAlertas === 0 && proximos.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-low px-6 py-12 text-center">
            <span className="material-symbols-outlined text-[40px] text-outline">
              event_available
            </span>
            <p className="text-body-sm text-on-surface-variant">
              No tienes cobros pautados. Abre un número en Mis clientes y
              ponle fecha para que aparezca aquí.
            </p>
          </div>
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
