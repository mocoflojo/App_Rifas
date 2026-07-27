"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAdminToken } from "@/lib/session";
import { mensajeError } from "@/lib/errores";

type Premio = { nombre: string; valor: number };

type ConfigForm = {
  precio_ticket: number;
  comision_ticket: number;
  meta_tickets: number;
  pago_meta: number;
  abono_minimo: number;
  dia_limite_abonos: number;
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
};

type ConfigCompleta = ConfigForm & { mes_actual: string };

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
      p_dia_limite_abonos: form.dia_limite_abonos,
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
    form.dia_limite_abonos !== datos.dia_limite_abonos ||
    form.meta_tickets !== datos.meta_tickets;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label-caps uppercase text-secondary">
          {datos.mes_actual}
        </span>
        <h1 className="text-display-mobile text-primary">Configuración</h1>
      </div>

      {huboCambioRetroactivo && (
        <div className="flex items-start gap-2 rounded-lg bg-estado-apartado-bg px-4 py-3 text-body-sm text-estado-apartado-fg">
          <span className="material-symbols-outlined text-[18px]">warning</span>
          Cambiar el precio, la meta de comisión o el día límite de abonos
          afecta de inmediato a las ventas que ya están en curso este mes,
          no solo a las nuevas.
        </div>
      )}

      <Seccion icono="storefront" titulo="Parámetros de la rifa">
        <Campo etiqueta="Precio del ticket ($)" type="number" step="0.01" {...num("precio_ticket")} />
        <Campo etiqueta="Abono mínimo ($)" type="number" step="0.01" {...num("abono_minimo")} />
        <Campo etiqueta="Día límite de abonos" type="number" min={1} max={28} {...num("dia_limite_abonos")} />
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

      <Seccion
        icono="groups"
        titulo="Bonos de equipo y meta colectiva"
        descripcion="El dinero de estos tres bonos no se paga hasta que TODO el equipo junte la meta colectiva."
      >
        <Campo etiqueta="Meta colectiva (tickets)" type="number" min={1} {...num("meta_colectiva")} />
        <Campo etiqueta="Vendedor rápido: antes del día" type="number" min={1} max={28} {...num("dias_vendedor_rapido")} />
        <Campo etiqueta="Bono vendedor rápido ($)" type="number" step="0.01" {...num("premio_vendedor_rapido")} />
        <Campo etiqueta="Bono cupo completo ($)" type="number" step="0.01" {...num("premio_cupo_completo")} />
        <Campo etiqueta="Bono en racha (3 meses) ($)" type="number" step="0.01" {...num("premio_racha")} />
      </Seccion>

      <Seccion
        icono="military_tech"
        titulo="Top vendedor del mes"
        descripcion="Se paga siempre al cerrar el mes, sin depender de la meta colectiva."
      >
        <Campo etiqueta="Premio 1er lugar ($)" type="number" step="0.01" {...num("premio_top_1")} />
        <Campo etiqueta="Premio 2do lugar ($)" type="number" step="0.01" {...num("premio_top_2")} />
        <Campo etiqueta="Premio 3er lugar ($)" type="number" step="0.01" {...num("premio_top_3")} />
      </Seccion>

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
                className="h-11 flex-1 rounded-lg border-0 bg-surface-container-high px-3 text-body-sm text-on-surface outline-none focus:ring-2 focus:ring-secondary"
              />
              <input
                type="number"
                step="0.01"
                value={p.valor}
                onChange={(e) => actualizarPremio(i, "valor", e.target.value)}
                placeholder="Valor $"
                className="h-11 w-28 rounded-lg border-0 bg-surface-container-high px-3 text-body-sm text-on-surface outline-none focus:ring-2 focus:ring-secondary"
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
