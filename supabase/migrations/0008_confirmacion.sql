-- Fase 5 — Confirmación del admin y activación
--
-- El vendedor marca "pagado" (Fase 4) y el número queda en la cola del admin.
-- Aquí: la cola, confirmar (activo + contador del vendedor), rechazar (vuelve
-- al estado anterior con nota visible al vendedor) y el historial de cambios
-- por número para la ficha del admin.

-- Estado previo para poder deshacer un "pagado" rechazado, y la nota que el
-- vendedor verá al abrir su número.
alter table numeros
  add column if not exists estado_previo text,
  add column if not exists monto_previo  numeric,
  add column if not exists nota_rechazo  text;


-- ---------- Historial de cambios ----------
create table if not exists historial_numeros (
  id                 bigint generated always as identity primary key,
  numero             int not null references numeros(numero),
  fecha              timestamptz not null default now(),
  estado_anterior    text,
  estado_nuevo       text,
  monto_anterior     numeric,
  monto_nuevo        numeric,
  pendiente_anterior boolean,
  pendiente_nuevo    boolean,
  vendedor_id        uuid
);

alter table historial_numeros enable row level security;
-- Sin políticas ni grants: solo se lee a través del RPC del admin.

create index if not exists historial_numeros_numero on historial_numeros (numero, fecha desc);

-- El trigger registra todo cambio relevante venga de donde venga (RPCs de
-- venta, confirmación, vencimientos futuros), sin depender de que cada
-- función se acuerde de escribir el log.
create or replace function _log_cambio_numero()
returns trigger
language plpgsql
as $$
begin
  if (old.estado, old.monto_abonado, old.pendiente_confirmacion)
     is distinct from
     (new.estado, new.monto_abonado, new.pendiente_confirmacion) then
    insert into historial_numeros (
      numero, estado_anterior, estado_nuevo, monto_anterior, monto_nuevo,
      pendiente_anterior, pendiente_nuevo, vendedor_id
    ) values (
      new.numero, old.estado, new.estado, old.monto_abonado, new.monto_abonado,
      old.pendiente_confirmacion, new.pendiente_confirmacion,
      coalesce(new.vendedor_id, old.vendedor_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists log_cambio_numero on numeros;
create trigger log_cambio_numero
  after update on numeros
  for each row execute function _log_cambio_numero();


-- ---------- Cola "Por confirmar" ----------
create or replace function admin_cola_confirmacion(p_admin_token uuid)
returns table (
  numero             int,
  cliente_nombre     text,
  cliente_whatsapp   text,
  monto_abonado      numeric,
  fecha_ultimo_abono timestamptz,
  vendedor_id        uuid,
  vendedor_nombre    text,
  vendedor_whatsapp  text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  return query
  select n.numero, n.cliente_nombre, n.cliente_whatsapp, n.monto_abonado,
         n.fecha_ultimo_abono, v.id, v.nombre, v.whatsapp
  from numeros n
  join vendedores v on v.id = n.vendedor_id
  where n.pendiente_confirmacion
  order by n.fecha_ultimo_abono;
end;
$$;

grant execute on function admin_cola_confirmacion(uuid) to anon, authenticated;


-- ---------- Confirmar: dinero recibido -> número ACTIVO ----------
create or replace function admin_confirmar_numero(
  p_admin_token uuid,
  p_numero      int
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n numeros;
  v vendedores;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  update numeros set
    estado                 = 'activo',
    fecha_activacion       = now(),
    pendiente_confirmacion = false,
    estado_previo          = null,
    monto_previo           = null,
    nota_rechazo           = null
  where numero = p_numero and pendiente_confirmacion
  returning * into n;

  if not found then
    -- Ya lo confirmó/rechazó otra sesión, o el número cambió de estado.
    raise exception 'estado_invalido';
  end if;

  -- Solo cuenta para la meta al activarse (§12.3).
  update vendedores set tickets_activos = tickets_activos + 1
  where id = n.vendedor_id
  returning * into v;

  return json_build_object(
    'numero', n.numero,
    'cliente_nombre', n.cliente_nombre,
    'cliente_whatsapp', n.cliente_whatsapp,
    'vendedor_nombre', v.nombre,
    'tickets_activos', v.tickets_activos
  );
end;
$$;

grant execute on function admin_confirmar_numero(uuid, int) to anon, authenticated;


-- ---------- Rechazar: vuelve al estado anterior con nota ----------
-- Si venía de 'libre' (pago completo directo), se revierte a 'apartado' en
-- vez de soltarlo: así el vendedor conserva el número, ve la nota y decide
-- si liberar o corregir. Revertir a 'libre' borraría al cliente y la nota
-- no la vería nadie.
create or replace function admin_rechazar_numero(
  p_admin_token uuid,
  p_numero      int,
  p_nota        text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n numeros;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'nota_requerida';
  end if;

  update numeros set
    estado = case
      when coalesce(estado_previo, 'apartado') = 'libre' then 'apartado'
      else coalesce(estado_previo, 'apartado') end,
    monto_abonado          = coalesce(monto_previo, 0),
    pendiente_confirmacion = false,
    estado_previo          = null,
    monto_previo           = null,
    nota_rechazo           = trim(p_nota)
  where numero = p_numero and pendiente_confirmacion
  returning * into n;

  if not found then
    raise exception 'estado_invalido';
  end if;

  return json_build_object('numero', n.numero, 'estado', n.estado);
end;
$$;

grant execute on function admin_rechazar_numero(uuid, int, text) to anon, authenticated;


-- ---------- Historial para la ficha del admin ----------
create or replace function admin_numero_historial(
  p_admin_token uuid,
  p_numero      int
)
returns table (
  fecha              timestamptz,
  estado_anterior    text,
  estado_nuevo       text,
  monto_anterior     numeric,
  monto_nuevo        numeric,
  pendiente_nuevo    boolean,
  vendedor_nombre    text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  return query
  select h.fecha, h.estado_anterior, h.estado_nuevo, h.monto_anterior,
         h.monto_nuevo, h.pendiente_nuevo, v.nombre
  from historial_numeros h
  left join vendedores v on v.id = h.vendedor_id
  where h.numero = p_numero
  order by h.fecha desc
  limit 20;
end;
$$;

grant execute on function admin_numero_historial(uuid, int) to anon, authenticated;


-- ---------- Las funciones de venta guardan el estado previo ----------
-- (y limpian la nota de rechazo cuando el vendedor vuelve a operar)

create or replace function vendedor_tomar_numero(
  p_token            uuid,
  p_numero           int,
  p_cliente_nombre   text,
  p_cliente_whatsapp text,
  p_accion           text,
  p_monto            numeric default 0
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v           vendedores;
  c           config;
  v_tomados   int;
  v_estado    text;
  v_monto     numeric := 0;
  v_pendiente boolean := false;
  v_filas     int;
  v_dia       int;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;

  if p_accion not in ('apartar', 'abonar', 'pagado') then
    raise exception 'accion_invalida';
  end if;
  if coalesce(trim(p_cliente_nombre), '') = '' then
    raise exception 'cliente_requerido';
  end if;

  v_dia := extract(day from (now() at time zone c.zona_horaria))::int;
  if v_dia > c.dia_limite_abonos and p_accion <> 'pagado' then
    raise exception 'solo_pago_completo';
  end if;

  select count(*) into v_tomados
  from numeros where vendedor_id = v.id and estado <> 'libre';
  if v_tomados >= v.cupo then raise exception 'cupo_lleno'; end if;

  if p_accion = 'apartar' then
    v_estado := 'apartado';
  elsif p_accion = 'abonar' then
    if p_monto < c.abono_minimo then raise exception 'abono_insuficiente'; end if;
    if p_monto >= c.precio_ticket then raise exception 'monto_excede'; end if;
    v_estado := 'abonado';
    v_monto  := p_monto;
  else
    v_estado    := 'abonado';
    v_monto     := c.precio_ticket;
    v_pendiente := true;
  end if;

  update numeros set
    estado                 = v_estado,
    vendedor_id            = v.id,
    cliente_nombre         = trim(p_cliente_nombre),
    cliente_whatsapp       = nullif(trim(p_cliente_whatsapp), ''),
    monto_abonado          = v_monto,
    fecha_apartado         = now(),
    fecha_ultimo_abono     = case when v_monto > 0 then now() end,
    fecha_activacion       = null,
    fecha_cobro_pautada    = null,
    apartado_extendido     = false,
    pendiente_confirmacion = v_pendiente,
    estado_previo          = case when v_pendiente then 'libre' end,
    monto_previo           = case when v_pendiente then 0 end,
    nota_rechazo           = null
  where numero = p_numero and estado = 'libre';

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'numero_ocupado'; end if;

  return json_build_object(
    'numero', p_numero, 'estado', v_estado,
    'monto_abonado', v_monto, 'pendiente_confirmacion', v_pendiente
  );
end;
$$;


create or replace function vendedor_abonar(p_token uuid, p_numero int, p_monto numeric)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v           vendedores;
  c           config;
  n           numeros;
  v_total     numeric;
  v_pendiente boolean;
  v_filas     int;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;

  if p_monto is null or p_monto <= 0 then raise exception 'monto_invalido'; end if;

  select * into n from numeros where numero = p_numero;
  if n.vendedor_id is distinct from v.id then raise exception 'no_es_tuyo'; end if;
  if n.pendiente_confirmacion then raise exception 'ya_enviado'; end if;
  if n.estado not in ('apartado', 'abonado') then raise exception 'estado_invalido'; end if;

  v_total := n.monto_abonado + p_monto;
  if v_total > c.precio_ticket then raise exception 'monto_excede'; end if;
  if v_total < c.abono_minimo then raise exception 'abono_insuficiente'; end if;
  v_pendiente := (v_total >= c.precio_ticket);

  update numeros set
    estado                 = 'abonado',
    monto_abonado          = v_total,
    fecha_ultimo_abono     = now(),
    pendiente_confirmacion = v_pendiente,
    estado_previo          = case when v_pendiente then n.estado end,
    monto_previo           = case when v_pendiente then n.monto_abonado end,
    nota_rechazo           = null
  where numero = p_numero and vendedor_id = v.id
    and estado in ('apartado', 'abonado') and not pendiente_confirmacion;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object(
    'numero', p_numero, 'monto_abonado', v_total,
    'pendiente_confirmacion', v_pendiente
  );
end;
$$;


create or replace function vendedor_marcar_pagado(p_token uuid, p_numero int)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v       vendedores;
  c       config;
  n       numeros;
  v_filas int;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;

  select * into n from numeros where numero = p_numero;

  update numeros set
    estado                 = 'abonado',
    monto_abonado          = c.precio_ticket,
    fecha_ultimo_abono     = now(),
    pendiente_confirmacion = true,
    estado_previo          = n.estado,
    monto_previo           = n.monto_abonado,
    nota_rechazo           = null
  where numero = p_numero and vendedor_id = v.id
    and estado in ('apartado', 'abonado') and not pendiente_confirmacion;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object('numero', p_numero, 'pendiente_confirmacion', true);
end;
$$;


-- Liberar también limpia los campos nuevos.
create or replace function vendedor_liberar_numero(p_token uuid, p_numero int)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v       vendedores;
  v_filas int;
begin
  v := _vendedor_activo(p_token);

  update numeros set
    estado                 = 'libre',
    vendedor_id            = null,
    cliente_nombre         = null,
    cliente_whatsapp       = null,
    monto_abonado          = 0,
    fecha_apartado         = null,
    fecha_ultimo_abono     = null,
    fecha_cobro_pautada    = null,
    apartado_extendido     = false,
    pendiente_confirmacion = false,
    estado_previo          = null,
    monto_previo           = null,
    nota_rechazo           = null
  where numero = p_numero and vendedor_id = v.id
    and estado = 'apartado' and monto_abonado = 0;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object('numero', p_numero, 'estado', 'libre');
end;
$$;


-- ---------- El vendedor ve la nota de rechazo ----------
drop function if exists vendedor_numero_detalle(uuid, int);
create function vendedor_numero_detalle(p_token uuid, p_numero int)
returns table (
  numero              int,
  estado              text,
  propio              boolean,
  cliente_nombre      text,
  cliente_whatsapp    text,
  monto_abonado       numeric,
  fecha_apartado      timestamptz,
  fecha_ultimo_abono  timestamptz,
  fecha_cobro_pautada timestamptz,
  pendiente_confirmacion boolean,
  nota_rechazo        text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v vendedores;
begin
  v := _vendedor_activo(p_token);

  return query
  select
    n.numero,
    n.estado,
    (n.vendedor_id = v.id),
    case when n.vendedor_id = v.id then n.cliente_nombre end,
    case when n.vendedor_id = v.id then n.cliente_whatsapp end,
    case when n.vendedor_id = v.id then n.monto_abonado else 0 end,
    case when n.vendedor_id = v.id then n.fecha_apartado end,
    case when n.vendedor_id = v.id then n.fecha_ultimo_abono end,
    case when n.vendedor_id = v.id then n.fecha_cobro_pautada end,
    n.pendiente_confirmacion,
    case when n.vendedor_id = v.id then n.nota_rechazo end
  from numeros n
  where n.numero = p_numero;
end;
$$;
grant execute on function vendedor_numero_detalle(uuid, int) to anon, authenticated;
