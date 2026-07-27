"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAdminToken, getVendedorToken, getVendedorId } from "@/lib/session";

export type EstadoNumero = "libre" | "apartado" | "abonado" | "activo";

/** Solo estas columnas llegan al navegador (ver migración 0004). */
type NumeroFila = {
  numero: number;
  estado: EstadoNumero;
  vendedor_id: string | null;
  pendiente_confirmacion: boolean;
};

/* El vendedor no ve el estado real de los números ajenos: solo "ocupado". */
type Apariencia = EstadoNumero | "ocupado";

const CLASES: Record<Apariencia, string> = {
  libre: "bg-estado-libre-bg text-estado-libre-fg",
  apartado: "bg-estado-apartado-bg text-estado-apartado-fg",
  abonado: "bg-estado-abonado-bg text-estado-abonado-fg",
  activo: "bg-estado-activo-bg text-estado-activo-fg",
  ocupado: "bg-surface-container-high text-outline",
};

const ETIQUETAS: Record<Apariencia, string> = {
  libre: "Libre",
  apartado: "Apartado",
  abonado: "Abonado",
  activo: "Vendido",
  ocupado: "Ocupado",
};

/* ------------------------------------------------------------------ */

/** Una celda. `memo` evita repintar las 1,000 cuando cambia una sola. */
const Celda = memo(function Celda({
  numero,
  apariencia,
  propio,
  seleccionado,
}: {
  numero: number;
  apariencia: Apariencia;
  propio: boolean;
  seleccionado: boolean;
}) {
  return (
    <button
      id={`num-${numero}`}
      data-numero={numero}
      aria-label={`Número ${numero}, ${ETIQUETAS[apariencia]}`}
      className={`relative flex aspect-square items-center justify-center rounded-lg text-grid-number transition-transform duration-200 active:scale-90 ${
        CLASES[apariencia]
      } ${seleccionado ? "z-10 scale-110 ring-4 ring-secondary" : ""}`}
    >
      {String(numero).padStart(3, "0")}
      {propio && (
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-current opacity-60" />
      )}
    </button>
  );
});

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-label-caps uppercase transition-colors ${
        activo
          ? "bg-primary text-on-primary"
          : "bg-surface-container text-on-surface-variant"
      }`}
    >
      {children}
    </button>
  );
}

function Punto({ clase }: { clase: string }) {
  return <span className={`size-3 shrink-0 rounded-full ${clase}`} />;
}

/* ------------------------------------------------------------------ */

type Detalle = Record<string, unknown> | null;

type Props = {
  modo: "admin" | "vendedor";
  /** Habilita el botón de acción sobre números libres o propios. */
  onAbrir?: (numero: number) => void;
  /** Cambia para forzar una recarga desde fuera (tras registrar una venta). */
  recarga?: number;
};

export function Talonario({ modo, onAbrir, recarga = 0 }: Props) {
  const [numeros, setNumeros] = useState<NumeroFila[] | null>(null);
  const [filtro, setFiltro] = useState<string>("todos");
  const [filtroVendedor, setFiltroVendedor] = useState<string>("todos");
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Detalle>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [envivo, setEnvivo] = useState(false);

  /* Se lee una sola vez. En el render del servidor no hay localStorage, pero
     ahí solo se pinta el esqueleto, que no depende de este valor. */
  const [miId] = useState<string | null>(() =>
    typeof window === "undefined" || modo !== "vendedor" ? null : getVendedorId()
  );

  /* --- Carga inicial: un solo request para las 1,000 filas --------- */
  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      const { data, error } = await supabase
        .from("numeros")
        .select("numero,estado,vendedor_id,pendiente_confirmacion")
        .order("numero")
        .limit(1000);
      if (!cancelado && !error && data) setNumeros(data as NumeroFila[]);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  /* --- Tiempo real: una sola suscripción a la tabla ---------------- */
  useEffect(() => {
    const canal = supabase
      .channel("talonario")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "numeros" },
        (payload) => {
          const fila = payload.new as Partial<NumeroFila>;
          if (typeof fila?.numero !== "number") return;
          setNumeros((prev) =>
            prev
              ? prev.map((n) => (n.numero === fila.numero ? { ...n, ...fila } : n))
              : prev
          );
        }
      )
      .subscribe((estado) => setEnvivo(estado === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  /* --- Lista de vendedores para el filtro del admin ---------------- */
  useEffect(() => {
    if (modo !== "admin") return;
    supabase
      .rpc("admin_listar_vendedores", { p_admin_token: getAdminToken() })
      .then(({ data }) => {
        if (data) setVendedores(data as { id: string; nombre: string }[]);
      });
  }, [modo]);

  /* --- Derivados ---------------------------------------------------- */
  const apariencia = useCallback(
    (n: NumeroFila): Apariencia => {
      if (n.estado === "libre") return "libre";
      if (modo === "admin") return n.estado;
      return n.vendedor_id === miId ? n.estado : "ocupado";
    },
    [modo, miId]
  );

  const conteos = useMemo(() => {
    const c = { libre: 0, apartado: 0, abonado: 0, activo: 0, mios: 0 };
    for (const n of numeros ?? []) {
      c[n.estado] += 1;
      if (n.vendedor_id && n.vendedor_id === miId) c.mios += 1;
    }
    return c;
  }, [numeros, miId]);

  const visibles = useMemo(() => {
    let lista = numeros ?? [];
    if (filtro === "mios") lista = lista.filter((n) => n.vendedor_id === miId);
    else if (filtro !== "todos") lista = lista.filter((n) => n.estado === filtro);
    if (modo === "admin" && filtroVendedor !== "todos") {
      lista = lista.filter((n) => n.vendedor_id === filtroVendedor);
    }
    return lista;
  }, [numeros, filtro, filtroVendedor, modo, miId]);

  /* --- Selección ---------------------------------------------------- */
  const seleccionar = useCallback(
    async (numero: number) => {
      setSeleccionado(numero);
      setDetalle(null);
      setCargandoDetalle(true);
      const { data } =
        modo === "admin"
          ? await supabase.rpc("admin_numero_detalle", {
              p_admin_token: getAdminToken(),
              p_numero: numero,
            })
          : await supabase.rpc("vendedor_numero_detalle", {
              p_token: getVendedorToken(),
              p_numero: numero,
            });
      setCargandoDetalle(false);
      setDetalle(Array.isArray(data) ? (data[0] ?? null) : null);
    },
    [modo]
  );

  /* Un único listener delegado en el contenedor, no 1,000 closures. */
  const clicEnGrilla = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-numero]");
      if (!btn) return;
      seleccionar(Number(btn.dataset.numero));
    },
    [seleccionar]
  );

  function buscar(valor: string) {
    setBusqueda(valor);
    const n = Number(valor);
    if (!valor || !Number.isInteger(n) || n < 1 || n > 1000) return;
    // Si el filtro activo lo esconde, se limpia para poder mostrarlo.
    if (!visibles.some((x) => x.numero === n)) {
      setFiltro("todos");
      setFiltroVendedor("todos");
    }
    seleccionar(n);
    requestAnimationFrame(() => {
      document
        .getElementById(`num-${n}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function cerrarDetalle() {
    setSeleccionado(null);
    setDetalle(null);
  }

  /* --- Render ------------------------------------------------------- */
  if (numeros === null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-14 animate-pulse rounded-xl bg-surface-container" />
        <div className="grid grid-cols-5 gap-grid-gap sm:grid-cols-8 md:grid-cols-10">
          {Array.from({ length: 60 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-surface-container" />
          ))}
        </div>
      </div>
    );
  }

  const filtros: { valor: string; texto: string }[] =
    modo === "admin"
      ? [
          { valor: "todos", texto: "Todos" },
          { valor: "libre", texto: `Libres ${conteos.libre}` },
          { valor: "apartado", texto: `Apartados ${conteos.apartado}` },
          { valor: "abonado", texto: `Abonados ${conteos.abonado}` },
          { valor: "activo", texto: `Vendidos ${conteos.activo}` },
        ]
      : [
          { valor: "todos", texto: "Todos" },
          { valor: "libre", texto: `Libres ${conteos.libre}` },
          { valor: "mios", texto: `Míos ${conteos.mios}` },
        ];

  const seleccion = numeros.find((n) => n.numero === seleccionado);
  const aparienciaSel = seleccion ? apariencia(seleccion) : null;
  const esPropio =
    modo === "vendedor" && !!seleccion?.vendedor_id && seleccion.vendedor_id === miId;

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-label-caps uppercase text-on-surface-variant">
            Talonario global
          </span>
          <h1 className="text-display-mobile text-primary">1,000 números</h1>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-label-caps uppercase ${
            envivo
              ? "bg-estado-libre-bg text-estado-activo-bg"
              : "bg-surface-container text-on-surface-variant"
          }`}
        >
          <span
            className={`size-2 rounded-full ${envivo ? "animate-pulse bg-status-active" : "bg-outline"}`}
          />
          {envivo ? "En vivo" : "Conectando"}
        </span>
      </div>

      {/* Buscador */}
      <div className="group relative">
        <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-outline transition-colors group-focus-within:text-secondary">
          search
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          value={busqueda}
          onChange={(e) => buscar(e.target.value)}
          placeholder="Ir a un número (1-1000)..."
          className="h-14 w-full rounded-lg border-none bg-surface-container-lowest pl-12 pr-4 text-body-lg text-on-surface shadow-sm outline-none transition-all placeholder:text-outline focus:ring-2 focus:ring-secondary"
        />
      </div>

      {/* Filtros */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {filtros.map((f) => (
          <Chip key={f.valor} activo={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
            {f.texto}
          </Chip>
        ))}
      </div>

      {modo === "admin" && vendedores.length > 0 && (
        <select
          value={filtroVendedor}
          onChange={(e) => setFiltroVendedor(e.target.value)}
          className="h-12 w-full rounded-lg border-none bg-surface-container-lowest px-4 text-body-sm text-on-surface shadow-sm outline-none focus:ring-2 focus:ring-secondary md:max-w-xs"
        >
          <option value="todos">Todos los vendedores</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nombre}
            </option>
          ))}
        </select>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap gap-2">
        {(modo === "admin"
          ? (["libre", "apartado", "abonado", "activo"] as const)
          : (["libre", "apartado", "abonado", "activo", "ocupado"] as const)
        ).map((a) => (
          <div
            key={a}
            className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2"
          >
            <Punto clase={CLASES[a].split(" ")[0]} />
            <span className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
              {ETIQUETAS[a]}
            </span>
          </div>
        ))}
        {modo === "vendedor" && (
          <div className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2">
            <span className="size-1.5 rounded-full bg-on-surface-variant" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
              El punto marca los tuyos
            </span>
          </div>
        )}
      </div>

      {/* Grilla */}
      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-low px-6 py-12 text-center">
          <span className="material-symbols-outlined text-[40px] text-outline">
            filter_alt_off
          </span>
          <p className="text-body-sm text-on-surface-variant">
            Ningún número coincide con este filtro.
          </p>
        </div>
      ) : (
        <div
          onClick={clicEnGrilla}
          className="grid grid-cols-5 gap-grid-gap pb-24 sm:grid-cols-8 md:grid-cols-10"
        >
          {visibles.map((n) => (
            <Celda
              key={n.numero}
              numero={n.numero}
              apariencia={apariencia(n)}
              propio={modo === "vendedor" && n.vendedor_id === miId}
              seleccionado={n.numero === seleccionado}
            />
          ))}
        </div>
      )}

      {/* Panel de detalle */}
      {seleccion && aparienciaSel && (
        <div className="pb-safe fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md rounded-xl bg-primary p-4 text-on-primary shadow-2xl md:bottom-6 md:left-auto md:right-8 md:mx-0 md:w-[340px]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                Seleccionado
              </span>
              <span className="text-display-mobile tracking-widest">
                #{String(seleccion.numero).padStart(3, "0")}
              </span>
              <span className="flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
                <Punto clase={CLASES[aparienciaSel].split(" ")[0]} />
                {ETIQUETAS[aparienciaSel]}
              </span>
            </div>
            <div className="flex gap-2">
              {onAbrir && (seleccion.estado === "libre" || esPropio) && (
                <button
                  onClick={() => onAbrir(seleccion.numero)}
                  className="flex h-12 items-center rounded-lg bg-secondary px-6 text-body-lg font-semibold text-on-secondary shadow-lg transition-transform active:scale-95"
                >
                  {seleccion.estado === "libre" ? "Apartar" : "Gestionar"}
                </button>
              )}
              <button
                onClick={cerrarDetalle}
                aria-label="Cerrar"
                className="flex size-12 items-center justify-center rounded-lg bg-white/10"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>

          {cargandoDetalle && (
            <div className="mt-3 h-4 w-32 animate-pulse rounded bg-white/20" />
          )}

          {!cargandoDetalle && detalle && (
            <DatosDetalle detalle={detalle} modo={modo} />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Linea({ icono, texto }: { icono: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5 text-body-sm opacity-90">
      <span className="material-symbols-outlined text-[16px]">{icono}</span>
      {texto}
    </span>
  );
}

/** Los campos vienen vacíos cuando el rol no tiene derecho a verlos. */
function DatosDetalle({ detalle, modo }: { detalle: Detalle; modo: Props["modo"] }) {
  if (!detalle) return null;
  const d = detalle as Record<string, string | number | boolean | null>;

  const lineas: { icono: string; texto: string }[] = [];

  if (modo === "admin" && d.vendedor_nombre) {
    lineas.push({ icono: "person", texto: `Vendedor: ${d.vendedor_nombre}` });
  }
  if (d.cliente_nombre) {
    lineas.push({ icono: "badge", texto: `Cliente: ${d.cliente_nombre}` });
  }
  if (d.cliente_whatsapp) {
    lineas.push({ icono: "chat", texto: String(d.cliente_whatsapp) });
  }
  if (Number(d.monto_abonado) > 0) {
    lineas.push({
      icono: "payments",
      texto: `Abonado: $${Number(d.monto_abonado).toFixed(2)}`,
    });
  }
  if (d.pendiente_confirmacion) {
    lineas.push({ icono: "hourglass_top", texto: "Abono por confirmar" });
  }
  if (modo === "vendedor" && d.propio === false && d.estado !== "libre") {
    lineas.push({ icono: "lock", texto: "Tomado por otro vendedor" });
  }

  if (lineas.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-white/15 pt-3">
      {lineas.map((l) => (
        <Linea key={l.texto} icono={l.icono} texto={l.texto} />
      ))}
    </div>
  );
}
