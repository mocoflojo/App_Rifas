"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getAdminToken } from "@/lib/session";
import { mensajeError } from "@/lib/errores";
import { FASES, fechaLarga, type Fase } from "@/lib/sorteo";

type Premio = { nombre: string; valor: number };

type ConfigForm = {
  precio_ticket: number;
  comision_ticket: number;
  meta_tickets: number;
  pago_meta: number;
  abono_minimo: number;
  dias_limite_apartado: number;
  cupo_default: number;
  codigo_invitacion: string;
  premios: Premio[];
  meta_colectiva: number;
  dias_vendedor_rapido: number;
  premio_vendedor_rapido: number;
  premio_cupo_completo: number;
  premio_racha: number;
  premio_top_1: number;
  premio_top_2: number;
  premio_top_3: number;
  bonos_activos: boolean;
};

type ConfigCompleta = ConfigForm & {
  numero_sorteo: number;
  etiqueta: string;
  fase: Fase;
  /** Las tres fechas del sorteo se editan en la pantalla Sorteo, no aquí:
   *  cambiarlas tiene reglas propias (el arranque se congela con la primera
   *  venta) y mezclarlas con los parámetros invitaría a tocarlas sin querer. */
  fecha_inicio: string | null;
  fecha_limite_abonos: string | null;
  fecha_sorteo: string | null;
  /** Con el sorteo ya en marcha, el interruptor de bonos no se puede tocar. */
  mes_iniciado: boolean;
};

function Campo({
  etiqueta,
  ayuda,
  ...props
}: {
  etiqueta: string;
  ayuda?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label-caps uppercase text-on-surface-variant">
        {etiqueta}
      </span>
      <input
        {...props}
        className="h-12 w-full rounded-lg border-0 bg-surface-container-high px-3 text-body-lg text-on-surface outline-none focus:ring-2 focus:ring-secondary"
      />
      {ayuda && <span className="text-body-sm text-on-surface-variant">{ayuda}</span>}
    </label>
  );
}

function FechaLeida({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-3">
      <span className="text-[10px] font-bold uppercase text-on-surface-variant">
        {etiqueta}
      </span>
      <span className="text-body-sm font-bold text-on-surface">
        {fechaLarga(valor)}
      </span>
    </div>
  );
}

function Seccion({
  icono,
  titulo,
  descripcion,
  children,
}: {
  icono: string;
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary-fixed text-primary">
          <span className="material-symbols-outlined text-[18px]">{icono}</span>
        </span>
        <div className="flex flex-col">
          <h2 className="text-headline text-primary">{titulo}</h2>
          {descripcion && (
            <p className="text-body-sm text-on-surface-variant">{descripcion}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

export default function ConfigPage() {
  const [datos, setDatos] = useState<ConfigCompleta | null>(null);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [claveActual, setClaveActual] = useState("");
  const [claveNueva, setClaveNueva] = useState("");
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [okClave, setOkClave] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("admin_config", {
        p_admin_token: getAdminToken(),
      });
      if (data) {
        setDatos(data as ConfigCompleta);
        setForm(data as ConfigForm);
      }
    })();
  }, []);

  function num(campo: keyof ConfigForm) {
    return {
      value: form ? String(form[campo]) : "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => (f ? { ...f, [campo]: Number(e.target.value) } : f)),
    };
  }

  function texto(campo: keyof ConfigForm) {
    return {
      value: form ? String(form[campo]) : "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => (f ? { ...f, [campo]: e.target.value } : f)),
    };
  }

  function actualizarPremio(i: number, campo: keyof Premio, valor: string) {
    setForm((f) => {
      if (!f) return f;
      const premios = [...f.premios];
      premios[i] = {
        ...premios[i],
        [campo]: campo === "valor" ? Number(valor) : valor,
      };
      return { ...f, premios };
    });
  }

  function agregarPremio() {
    setForm((f) =>
      f
        ? { ...f, premios: [...f.premios, { nombre: `Moto ${f.premios.length + 1}`, valor: 1200 }] }
        : f
    );
  }

  function quitarPremio(i: number) {
    setForm((f) => (f ? { ...f, premios: f.premios.filter((_, j) => j !== i) } : f));
  }

  async function guardar() {
    if (!form) return;
    setError(null);
    setOk(false);
    setGuardando(true);
    const { error: e } = await supabase.rpc("admin_actualizar_config", {
      p_admin_token: getAdminToken(),
      p_precio_ticket: form.precio_ticket,
      p_comision_ticket: form.comision_ticket,
      p_meta_tickets: form.meta_tickets,
      p_pago_meta: form.pago_meta,
      p_abono_minimo: form.abono_minimo,
      p_dias_limite_apartado: form.dias_limite_apartado,
      p_cupo_default: form.cupo_default,
      p_codigo_invitacion: form.codigo_invitacion,
      p_premios: form.premios,
      p_meta_colectiva: form.meta_colectiva,
      p_dias_vendedor_rapido: form.dias_vendedor_rapido,
      p_premio_vendedor_rapido: form.premio_vendedor_rapido,
      p_premio_cupo_completo: form.premio_cupo_completo,
      p_premio_racha: form.premio_racha,
      p_premio_top_1: form.premio_top_1,
      p_premio_top_2: form.premio_top_2,
      p_premio_top_3: form.premio_top_3,
      p_bonos_activos: form.bonos_activos,
    });
    setGuardando(false);
    if (e) {
      setError(mensajeError(e));
      return;
    }
    setOk(true);
    setDatos((d) => (d ? { ...d, ...form } : d));
    setTimeout(() => setOk(false), 4000);
  }

  async function cambiarClave() {
    setErrorClave(null);
    setOkClave(false);
    setCambiandoClave(true);
    const { error: e } = await supabase.rpc("admin_cambiar_clave", {
      p_admin_token: getAdminToken(),
      p_clave_actual: claveActual,
      p_clave_nueva: claveNueva,
    });
    setCambiandoClave(false);
    if (e) {
      setErrorClave(mensajeError(e));
      return;
    }
    setClaveActual("");
    setClaveNueva("");
    setOkClave(true);
    setTimeout(() => setOkClave(false), 4000);
  }

  if (!datos || !form) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-mobile text-primary">Configuración</h1>
        <div className="h-64 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  const huboCambioRetroactivo =
    form.precio_ticket !== datos.precio_ticket ||
    form.meta_tickets !== datos.meta_tickets;

  const fase = FASES[datos.fase];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label-caps uppercase text-secondary">
          {datos.etiqueta || "Sin sorteo activo"}
        </span>
        <h1 className="text-display-mobile text-primary">Configuración</h1>
      </div>

      {/* Las fechas viven en la pantalla Sorteo; aquí solo se muestran para
          no obligar al admin a ir y volver para recordarlas. */}
      <section className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-5 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary-fixed text-primary">
              <span className="material-symbols-outlined text-[18px]">calendar_month</span>
            </span>
            <h2 className="text-headline text-primary">Fechas del sorteo</h2>
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-body-sm font-semibold ${fase.clase}`}
          >
            <span className="material-symbols-outlined text-[16px]">{fase.icono}</span>
            {fase.texto}
          </span>
        </div>

        {datos.fase === "sin_sorteo" ? (
          <p className="text-body-sm text-on-surface-variant">
            No hay ningún sorteo programado. El talonario está cerrado hasta
            que crees el próximo.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <FechaLeida etiqueta="Arranca" valor={datos.fecha_inicio} />
            <FechaLeida etiqueta="Cierre de abonos" valor={datos.fecha_limite_abonos} />
            <FechaLeida etiqueta="Se juega" valor={datos.fecha_sorteo} />
          </div>
        )}

        <Link
          href="/admin/sorteo"
          className="flex h-11 items-center justify-center gap-2 rounded-lg border-2 border-outline-variant text-body-sm font-semibold text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
          {datos.fase === "sin_sorteo" ? "Programar un sorteo" : "Cambiar las fechas"}
        </Link>
      </section>

      {huboCambioRetroactivo && (
        <div className="flex items-start gap-2 rounded-lg bg-estado-apartado-bg px-4 py-3 text-body-sm text-estado-apartado-fg">
          <span className="material-symbols-outlined text-[18px]">warning</span>
          Cambiar el precio o la meta de comisión afecta de inmediato a las
          ventas que ya están en curso, no solo a las nuevas.
        </div>
      )}

      <Seccion icono="storefront" titulo="Parámetros de la rifa">
        <Campo etiqueta="Precio del ticket ($)" type="number" step="0.01" {...num("precio_ticket")} />
        <Campo etiqueta="Abono mínimo ($)" type="number" step="0.01" {...num("abono_minimo")} />
        <Campo etiqueta="Días de plazo del apartado" type="number" min={1} {...num("dias_limite_apartado")} />
        <Campo etiqueta="Cupo por vendedor (nuevos)" type="number" min={1} {...num("cupo_default")} />
        <Campo etiqueta="Código de invitación" {...texto("codigo_invitacion")} />
      </Seccion>

      <Seccion
        icono="emoji_events"
        titulo="Comisión por metas"
        descripcion="Cada bloque de tickets activos paga un monto fijo al vendedor."
      >
        <Campo etiqueta="Tickets por meta" type="number" min={1} {...num("meta_tickets")} />
        <Campo etiqueta="Pago por meta ($)" type="number" step="0.01" {...num("pago_meta")} />
        <Campo etiqueta="Comisión por ticket suelto ($)" type="number" step="0.01" {...num("comision_ticket")} />
      </Seccion>

      {/* Interruptor maestro de los bonos */}
      <section className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-fixed text-primary">
            <span className="material-symbols-outlined text-[18px]">toll</span>
          </span>
          <div className="flex flex-col">
            <h2 className="text-headline text-primary">¿Pagar dinero por logros?</h2>
            <p className="text-body-sm text-on-surface-variant">
              Con los bonos apagados, las insignias se siguen ganando y
              mostrando, pero no generan ningún pago.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {[
            { valor: true, texto: "Sí, con bonos", icono: "payments" },
            { valor: false, texto: "No, solo insignias", icono: "military_tech" },
          ].map((o) => (
            <button
              key={String(o.valor)}
              disabled={datos.mes_iniciado}
              onClick={() =>
                setForm((f) => (f ? { ...f, bonos_activos: o.valor } : f))
              }
              className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border-2 text-body-sm font-semibold transition-colors disabled:opacity-50 ${
                form.bonos_activos === o.valor
                  ? "border-secondary bg-secondary-container/25 text-secondary"
                  : "border-outline-variant text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{o.icono}</span>
              {o.texto}
            </button>
          ))}
        </div>

        {datos.mes_iniciado && (
          <div className="flex items-start gap-2 rounded-lg bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">lock</span>
            El sorteo ya arrancó, así que esta decisión queda congelada hasta
            el próximo cierre. Cambiarla ahora dejaría a unos vendedores
            cobrando y a otros no por el mismo logro.
          </div>
        )}
      </section>

      {form.bonos_activos && (
        <>
          <Seccion
            icono="groups"
            titulo="Bonos de equipo y meta colectiva"
            descripcion="El dinero de estos tres bonos no se paga hasta que TODO el equipo junte la meta colectiva."
          >
            <Campo etiqueta="Meta colectiva (tickets)" type="number" min={1} {...num("meta_colectiva")} />
            <Campo
              etiqueta="Vendedor rápido: primeros N días"
              ayuda="Contados desde que arranca el sorteo, no desde el día 1 del mes."
              type="number"
              min={1}
              max={90}
              {...num("dias_vendedor_rapido")}
            />
            <Campo etiqueta="Bono vendedor rápido ($)" type="number" step="0.01" {...num("premio_vendedor_rapido")} />
            <Campo etiqueta="Bono cupo completo ($)" type="number" step="0.01" {...num("premio_cupo_completo")} />
            <Campo etiqueta="Bono en racha (3 sorteos) ($)" type="number" step="0.01" {...num("premio_racha")} />
          </Seccion>

          <Seccion
            icono="military_tech"
            titulo="Top vendedor del sorteo"
            descripcion="Se paga al cerrar el sorteo, sin depender de la meta colectiva."
          >
            <Campo etiqueta="Premio 1er lugar ($)" type="number" step="0.01" {...num("premio_top_1")} />
            <Campo etiqueta="Premio 2do lugar ($)" type="number" step="0.01" {...num("premio_top_2")} />
            <Campo etiqueta="Premio 3er lugar ($)" type="number" step="0.01" {...num("premio_top_3")} />
          </Seccion>
        </>
      )}

      <section className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-fixed text-primary">
            <span className="material-symbols-outlined text-[18px]">
              redeem
            </span>
          </span>
          <h2 className="text-headline text-primary">Premios del sorteo</h2>
        </div>
        <div className="flex flex-col gap-2">
          {form.premios.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={p.nombre}
                onChange={(e) => actualizarPremio(i, "nombre", e.target.value)}
                placeholder="Nombre del premio"
                className="h-11 min-w-0 flex-1 rounded-lg border-0 bg-surface-container-high px-3 text-body-sm text-on-surface outline-none focus:ring-2 focus:ring-secondary"
              />
              <input
                type="number"
                step="0.01"
                value={p.valor}
                onChange={(e) => actualizarPremio(i, "valor", e.target.value)}
                placeholder="Valor $"
                className="h-11 w-24 shrink-0 rounded-lg border-0 bg-surface-container-high px-3 text-body-sm text-on-surface outline-none focus:ring-2 focus:ring-secondary"
              />
              <button
                onClick={() => quitarPremio(i)}
                aria-label="Quitar premio"
                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-error"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ))}
          <button
            onClick={agregarPremio}
            className="flex h-11 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant text-body-sm font-semibold text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Agregar premio
          </button>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-error-container px-4 py-3 text-body-sm text-on-error-container">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}
      {ok && (
        <div className="flex items-center gap-2 rounded-lg bg-estado-libre-bg px-4 py-3 text-body-sm text-estado-activo-bg">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          Configuración guardada.
        </div>
      )}

      <button
        onClick={guardar}
        disabled={guardando}
        className="flex h-14 items-center justify-center gap-2 rounded-lg bg-primary text-body-lg font-semibold text-on-primary shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        <span className="material-symbols-outlined text-[20px]">save</span>
        {guardando ? "Guardando..." : "Guardar cambios"}
      </button>

      {/* Cambiar la clave del admin */}
      <section className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-[0_10px_25px_rgba(26,82,118,0.05)]">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-fixed text-primary">
            <span className="material-symbols-outlined text-[18px]">lock</span>
          </span>
          <h2 className="text-headline text-primary">Tu clave de acceso</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo
            etiqueta="Clave actual"
            type="password"
            value={claveActual}
            onChange={(e) => setClaveActual(e.target.value)}
          />
          <Campo
            etiqueta="Clave nueva"
            type="password"
            value={claveNueva}
            onChange={(e) => setClaveNueva(e.target.value)}
          />
        </div>
        {errorClave && (
          <div className="flex items-center gap-2 rounded-lg bg-error-container px-4 py-3 text-body-sm text-on-error-container">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {errorClave}
          </div>
        )}
        {okClave && (
          <div className="flex items-center gap-2 rounded-lg bg-estado-libre-bg px-4 py-3 text-body-sm text-estado-activo-bg">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            Clave actualizada.
          </div>
        )}
        <button
          onClick={cambiarClave}
          disabled={cambiandoClave || !claveActual || claveNueva.length < 6}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border-2 border-outline-variant text-body-sm font-semibold text-on-surface-variant disabled:opacity-50"
        >
          {cambiandoClave ? "Cambiando..." : "Cambiar clave"}
        </button>
      </section>
    </div>
  );
}
