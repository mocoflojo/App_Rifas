"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Cosas que reclaman atención en esa sección. 0 o ausente = sin aviso. */
  badge?: number;
};

/** Contador rojo. Por encima de 9 pasa a "9+" para no deformar el círculo
 *  en las pantallas chicas. */
function Badge({ n, flotante }: { n: number; flotante?: boolean }) {
  return (
    <span
      aria-label={`${n} pendientes`}
      className={`flex min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold leading-[18px] text-on-error ${
        flotante ? "absolute -right-2.5 -top-1" : ""
      }`}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

type Props = {
  titulo: string;
  usuario: string;
  /** Hasta 4 items visibles en la barra inferior. */
  items: NavItem[];
  /** Secciones secundarias, accesibles desde el botón "Más". */
  itemsSecundarios?: NavItem[];
  /** Si se pasa, muestra un botón de cuenta junto a "Salir" (p.ej. cambiar clave). */
  onCuenta?: () => void;
  onSalir: () => void;
  children: React.ReactNode;
};

export function AppShell({
  titulo,
  usuario,
  items,
  itemsSecundarios = [],
  onCuenta,
  onSalir,
  children,
}: Props) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const activoEnSecundarios = itemsSecundarios.some((i) => i.href === pathname);
  const todos = [...items, ...itemsSecundarios];
  const avisosSecundarios = itemsSecundarios.reduce(
    (s, i) => s + (i.badge ?? 0),
    0
  );

  return (
    <div className="min-h-dvh bg-background md:flex md:mx-auto md:max-w-[1280px]">
      {/* Sidebar — solo desktop */}
      <aside className="hidden md:flex md:w-[248px] md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-outline-variant/40 md:px-3 md:py-5">
        <div className="mb-4 flex items-center gap-2 px-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-on-primary">
            <span className="material-symbols-outlined text-[20px]">
              confirmation_number
            </span>
          </div>
          <span className="text-headline text-primary">Rifas</span>
        </div>
        {todos.map((item) => {
          const activo = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-sm transition-colors ${
                activo
                  ? "bg-primary-fixed font-semibold text-primary"
                  : "text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {!!item.badge && <Badge n={item.badge} />}
            </Link>
          );
        })}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header glass */}
        <header className="glass pt-safe sticky top-0 z-50 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
          <div className="flex h-16 items-center justify-between px-4 md:px-8">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary md:hidden">
                <span className="material-symbols-outlined text-[18px]">
                  confirmation_number
                </span>
              </div>
              <h1 className="text-headline text-primary">{titulo}</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-body-sm text-on-surface-variant sm:inline">
                {usuario}
              </span>
              {onCuenta && (
                <button
                  onClick={onCuenta}
                  aria-label="Cambiar clave"
                  className="flex size-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    manage_accounts
                  </span>
                </button>
              )}
              <button
                onClick={onSalir}
                aria-label="Salir"
                className="flex size-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">
                  logout
                </span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10">
          <div className="mx-auto w-full max-w-[900px]">{children}</div>
        </main>
      </div>

      {/* Menú "Más" — solo mobile */}
      {menuAbierto && (
        <>
          <button
            aria-label="Cerrar menú"
            onClick={() => setMenuAbierto(false)}
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
          />
          <div className="pb-safe fixed inset-x-0 bottom-16 z-50 rounded-t-xl bg-surface-container-lowest p-4 shadow-2xl md:hidden">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant" />
            <div className="grid grid-cols-2 gap-2">
              {itemsSecundarios.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuAbierto(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-body-sm transition-colors ${
                    pathname === item.href
                      ? "bg-primary-fixed font-semibold text-primary"
                      : "bg-surface-container-low text-on-surface-variant"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && <Badge n={item.badge} />}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Barra inferior — solo mobile */}
      <nav className="glass pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-outline-variant/30 md:hidden">
        <div className="flex h-16 items-stretch">
          {items.map((item) => {
            const activo = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuAbierto(false)}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                  activo ? "text-secondary" : "text-on-surface-variant"
                }`}
              >
                <span className="relative">
                  <span
                    className={`material-symbols-outlined text-[22px] ${
                      activo ? "filled" : ""
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!!item.badge && <Badge n={item.badge} flotante />}
                </span>
                <span className="text-[11px] font-semibold tracking-wide">
                  {item.label}
                </span>
              </Link>
            );
          })}

          {itemsSecundarios.length > 0 && (
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                menuAbierto || activoEnSecundarios
                  ? "text-secondary"
                  : "text-on-surface-variant"
              }`}
            >
              <span className="relative">
                <span className="material-symbols-outlined text-[22px]">
                  {menuAbierto ? "close" : "more_horiz"}
                </span>
                {/* Lo escondido en "Más" también avisa, si no el aviso se
                    pierde detrás del menú. */}
                {!menuAbierto && avisosSecundarios > 0 && (
                  <Badge n={avisosSecundarios} flotante />
                )}
              </span>
              <span className="text-[11px] font-semibold tracking-wide">Más</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
