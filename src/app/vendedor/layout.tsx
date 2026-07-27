"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, type NavItem } from "@/components/AppShell";
import { CambiarClave } from "@/components/CambiarClave";
import { limpiarSesion, getVendedorToken } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { aplicarVencimientos, type AlertasVendedor } from "@/lib/alertas";
import { fechaLarga } from "@/lib/sorteo";

const items: NavItem[] = [
  { href: "/vendedor/resumen", label: "Resumen", icon: "dashboard" },
  { href: "/vendedor/numeros", label: "Números", icon: "grid_view" },
  { href: "/vendedor/clientes", label: "Clientes", icon: "contacts" },
  { href: "/vendedor/agenda", label: "Agenda", icon: "calendar_month" },
  { href: "/vendedor/logros", label: "Logros", icon: "military_tech" },
];

type Estado = "verificando" | "pendiente" | "suspendido" | "no_registrado" | "activo";

/** Pantalla de bloqueo para vendedores no aprobados. */
function Aviso({
  icono,
  titulo,
  mensaje,
  tono,
  onSalir,
}: {
  icono: string;
  titulo: string;
  mensaje: string;
  tono: "espera" | "error";
  onSalir: () => void;
}) {
  const colores =
    tono === "espera"
      ? "bg-estado-apartado-bg text-estado-apartado-fg"
      : "bg-error-container text-on-error-container";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <div className={`flex size-20 items-center justify-center rounded-full ${colores}`}>
        <span className="material-symbols-outlined filled text-[36px]">{icono}</span>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-display-mobile text-primary">{titulo}</h1>
        <p className="max-w-sm text-body-lg text-on-surface-variant">{mensaje}</p>
      </div>
      <button
        onClick={onSalir}
        className="h-12 rounded-lg border-2 border-secondary px-8 text-body-lg font-semibold text-secondary transition-colors active:bg-secondary/10"
      >
        Salir
      </button>
    </main>
  );
}

/** Aviso de cabecera cuando el talonario no está en venta normal. Vive en el
 *  layout y no en cada pantalla porque la fase afecta a todas por igual: sin
 *  esto, el vendedor descubre que no puede vender recién al tocar un número
 *  y recibir un error. En fase "venta" no muestra nada. */
function BannerFase({ a }: { a: AlertasVendedor }) {
  const aviso = {
    sin_sorteo: {
      icono: "event_busy",
      clase: "bg-surface-container-highest text-on-surface-variant",
      texto:
        "No hay ningún sorteo abierto. Espera a que el admin programe el próximo para volver a vender.",
    },
    programado: {
      icono: "event_upcoming",
      clase: "bg-estado-abonado-bg text-estado-abonado-fg",
      texto: `${a.etiqueta} abre el ${fechaLarga(a.fecha_inicio)}. Todavía no puedes tomar números.`,
    },
    solo_pago: {
      icono: "hourglass_bottom",
      clase: "bg-estado-apartado-bg text-estado-apartado-fg",
      texto: `Ya pasó el cierre de abonos (${fechaLarga(a.fecha_limite_abonos)}): desde ahora solo se venden números con pago completo.`,
    },
    cerrando: {
      icono: "lock_clock",
      clase: "bg-error-container text-on-error-container",
      texto: `El sorteo del ${fechaLarga(a.fecha_sorteo)} ya se jugó. No se pueden tomar más números.`,
    },
    venta: null,
  }[a.fase];

  if (!aviso) return null;

  return (
    <div
      className={`mb-4 flex items-start gap-2 rounded-xl px-4 py-3 text-body-sm font-semibold ${aviso.clase}`}
    >
      <span className="material-symbols-outlined shrink-0 text-[18px]">
        {aviso.icono}
      </span>
      {aviso.texto}
    </div>
  );
}

export default function VendedorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [nombre, setNombre] = useState("");
  const [mostrarCuenta, setMostrarCuenta] = useState(false);
  const [alertas, setAlertas] = useState<AlertasVendedor | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function verificar() {
      const token = getVendedorToken();
      if (!token) {
        if (!cancelado) setEstado("no_registrado");
        return;
      }
      const { data, error } = await supabase.rpc("vendedor_por_sesion", {
        p_token: token,
      });
      if (cancelado) return;
      // Sin fila: el token expiró, se cerró la sesión o el admin la revocó.
      if (error || !data) {
        setEstado("no_registrado");
        return;
      }
      setNombre(data.nombre);
      setEstado(data.estado as Estado);
    }
    verificar();
    return () => {
      cancelado = true;
    };
  }, []);

  /* Igual que en el panel del admin: primero se aplican los vencimientos,
     después se cuentan los avisos. Un apartado que acaba de caducar no
     debe seguir contando como pendiente. */
  useEffect(() => {
    if (estado !== "activo") return;
    let cancelado = false;
    (async () => {
      await aplicarVencimientos();
      const { data } = await supabase.rpc("vendedor_alertas", {
        p_token: getVendedorToken(),
      });
      if (!cancelado && data) setAlertas(data as AlertasVendedor);
    })();
    return () => {
      cancelado = true;
    };
  }, [estado]);

  function salir() {
    const token = getVendedorToken();
    if (token) supabase.rpc("cerrar_sesion_vendedor", { p_token: token });
    limpiarSesion();
    router.replace("/");
  }

  if (estado === "verificando") return null;

  if (estado === "no_registrado") {
    limpiarSesion();
    router.replace("/");
    return null;
  }

  if (estado === "pendiente") {
    return (
      <Aviso
        icono="hourglass_top"
        titulo="Solicitud enviada"
        mensaje={`Hola ${nombre}, tu registro está pendiente de aprobación por el admin. Vuelve a abrir la app más tarde.`}
        tono="espera"
        onSalir={salir}
      />
    );
  }

  if (estado === "suspendido") {
    return (
      <Aviso
        icono="block"
        titulo="Cuenta suspendida"
        mensaje="Tu acceso fue suspendido por el admin. Contáctalo si crees que es un error."
        tono="error"
        onSalir={salir}
      />
    );
  }

  return (
    <>
      <AppShell
        titulo="Mis ventas"
        usuario={nombre}
        items={items.map((i) => {
          if (!alertas) return i;
          if (i.href === "/vendedor/agenda")
            return { ...i, badge: alertas.agenda };
          if (i.href === "/vendedor/clientes")
            return { ...i, badge: alertas.rechazos };
          if (i.href === "/vendedor/logros")
            return { ...i, badge: alertas.logros_nuevos };
          return i;
        })}
        onCuenta={() => setMostrarCuenta(true)}
        onSalir={salir}
      >
        {alertas && <BannerFase a={alertas} />}
        {children}
      </AppShell>
      {mostrarCuenta && <CambiarClave onCerrar={() => setMostrarCuenta(false)} />}
    </>
  );
}
