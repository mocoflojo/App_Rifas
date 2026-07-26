-- Migración inicial: modelo de datos de la app de rifas (ver sección 6 del discovery)

create table config (
  id int primary key default 1,
  mes_actual text not null,
  precio_ticket numeric not null default 12,
  comision_ticket numeric not null default 6,
  meta_tickets int not null default 10,
  pago_meta numeric not null default 60,
  abono_minimo numeric not null default 5,
  dia_limite_abonos int not null default 25,
  dias_limite_apartado int not null default 14,
  premios jsonb not null default '[{"nombre":"Moto 1","valor":1200},{"nombre":"Moto 2","valor":1200},{"nombre":"Moto 3","valor":1200}]',
  cupo_default int not null default 60,
  codigo_invitacion text not null default 'RIFA2026',
  clave_admin_hash text not null,
  constraint solo_una_fila check (id = 1)
);

create table vendedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  whatsapp text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','activo','suspendido')),
  cupo int not null default 60,
  fecha_registro timestamptz not null default now(),
  device_token uuid,
  tickets_activos int not null default 0,
  metas_cobradas int not null default 0,
  comision_pagada numeric not null default 0
);

create table numeros (
  numero int primary key check (numero between 1 and 1000),
  estado text not null default 'libre' check (estado in ('libre','apartado','abonado','activo')),
  vendedor_id uuid references vendedores(id),
  cliente_nombre text,
  cliente_whatsapp text,
  monto_abonado numeric not null default 0,
  fecha_apartado timestamptz,
  fecha_ultimo_abono timestamptz,
  fecha_activacion timestamptz,
  fecha_cobro_pautada timestamptz,
  apartado_extendido boolean not null default false,
  pendiente_confirmacion boolean not null default false
);

create table pagos_comisiones (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid references vendedores(id),
  monto numeric not null,
  tipo text not null check (tipo in ('meta','liquidacion','abonoPerdido')),
  fecha timestamptz not null default now(),
  detalle text
);

create table logros (
  vendedor_id uuid references vendedores(id),
  logro_id text not null,
  fecha timestamptz not null default now(),
  mes text not null,
  primary key (vendedor_id, logro_id, mes)
);

create table historico (
  mes text primary key,
  tickets_vendidos int not null,
  ingresos numeric not null,
  comisiones_pagadas numeric not null,
  abonos_perdidos numeric not null,
  numeros_banca int not null,
  motos_ganadas_banca int not null,
  ganadores jsonb not null,
  top_vendedor jsonb not null,
  vendedores_activos int not null
);

alter publication supabase_realtime add table numeros;

-- Seed inicial: fila única de config (clave admin de prueba — CAMBIAR antes de producción)
insert into config (id, mes_actual, clave_admin_hash)
values (1, to_char(now(), 'YYYY-MM'), 'CAMBIAR_ESTA_CLAVE');

-- Seed inicial: 1000 números en estado libre
insert into numeros (numero)
select generate_series(1, 1000);
