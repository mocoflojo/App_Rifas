-- Fase 4 — Flujo de ventas del vendedor
--
-- Todas las transiciones de estado viven en la base, no en el cliente:
-- el navegador solo puede pedirlas a través de estas funciones, que validan
-- pertenencia, cupo, montos y concurrencia antes de escribir.

-- El corte del día 25 depende de la hora local, no de UTC (§2).
alter table config
  add column if not exists zona_horaria text not null default 'America/Caracas';


/* Resuelve al vendedor a partir de su dispositivo. Interna: no se otorga
   permiso de ejecución a anon. */
create or replace function _vendedor_activo(p_device_token uuid)
returns vendedores
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v vendedores;
begin
  select * into v
  from vendedores
  where device_token = p_device_token and estado = 'activo';

  if not found then
    raise exception 'no_autorizado';
  end if;

  return v;
end;
$$;

revoke execute on function _vendedor_activo(uuid) from public, anon, authenticated;


-- Cupo del vendedor: cuántos números tiene tomados de cuántos puede.
create or replace function vendedor_resumen_cupo(p_device_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v vendedores;
  v_tomados int;
begin
  v := _vendedor_activo(p_device_token);

  select count(*) into v_tomados
  from numeros
  where vendedor_id = v.id and estado <> 'libre';

  return json_build_object(
    'cupo',        v.cupo,
    'tomados',     v_tomados,
    'disponibles', greatest(v.cupo - v_tomados, 0)
  );
end;
$$;

grant execute on function vendedor_resumen_cupo(uuid) to anon, authenticated;


-- Los números del vendedor, con el detalle completo de sus clientes.
create or replace function vendedor_mis_numeros(p_device_token uuid)
returns table (
  numero              int,
  estado              text,
  cliente_nombre      text,
  cliente_whatsapp    text,
  monto_abonado       numeric,
  fecha_apartado      timestamptz,
  fecha_ultimo_abono  timestamptz,
  apartado_extendido  boolean,
  pendiente_confirmacion boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v vendedores;
begin
  v := _vendedor_activo(p_device_token);

  return query
  select n.numero, n.estado, n.cliente_nombre, n.cliente_whatsapp, n.monto_abonado,
         n.fecha_apartado, n.fecha_ultimo_abono, n.apartado_extendido,
         n.pendiente_confirmacion
  from numeros n
  where n.vendedor_id = v.id and n.estado <> 'libre'
  order by n.numero;
end;
$$;

grant execute on function vendedor_mis_numeros(uuid) to anon, authenticated;


/* Toma un número libre. El UPDATE condicional sobre estado = 'libre' es lo
   que evita la toma doble: si dos vendedores llegan a la vez, Postgres
   serializa las escrituras de la fila y el segundo afecta 0 filas (§12.1). */
create or replace function vendedor_tomar_numero(
  p_device_token     uuid,
  p_numero           int,
  p_cliente_nombre   text,
  p_cliente_whatsapp text,
  p_accion           text,              -- 'apartar' | 'abonar' | 'pagado'
  p_monto            numeric default 0
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v          vendedores;
  c          config;
  v_tomados  int;
  v_estado   text;
  v_monto    numeric := 0;
  v_pendiente boolean := false;
  v_filas    int;
  v_dia      int;
begin
  v := _vendedor_activo(p_device_token);
  select * into c from config where id = 1;

  if p_accion not in ('apartar', 'abonar', 'pagado') then
    raise exception 'accion_invalida';
  end if;

  if coalesce(trim(p_cliente_nombre), '') = '' then
    raise exception 'cliente_requerido';
  end if;

  -- Cierre de ventas: pasado el día límite solo se aceptan pagos completos (§2).
  v_dia := extract(day from (now() at time zone c.zona_horaria))::int;
  if v_dia > c.dia_limite_abonos and p_accion <> 'pagado' then
    raise exception 'solo_pago_completo';
  end if;

  select count(*) into v_tomados
  from numeros where vendedor_id = v.id and estado <> 'libre';
  if v_tomados >= v.cupo then
    raise exception 'cupo_lleno';
  end if;

  if p_accion = 'apartar' then
    v_estado := 'apartado';
  elsif p_accion = 'abonar' then
    if p_monto < c.abono_minimo then raise exception 'abono_insuficiente'; end if;
    if p_monto >= c.precio_ticket then raise exception 'monto_excede'; end if;
    v_estado := 'abonado';
    v_monto  := p_monto;
  else
    -- El vendedor solo declara el pago; activar es potestad del admin (§3).
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
    pendiente_confirmacion = v_pendiente
  where numero = p_numero and estado = 'libre';

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'numero_ocupado';
  end if;

  return json_build_object(
    'numero', p_numero, 'estado', v_estado,
    'monto_abonado', v_monto, 'pendiente_confirmacion', v_pendiente
  );
end;
$$;

grant execute on function vendedor_tomar_numero(uuid, int, text, text, text, numeric)
  to anon, authenticated;


-- Abono adicional sobre un número propio. Al completar el precio, el número
-- queda a la espera de que el admin confirme el dinero.
create or replace function vendedor_abonar(
  p_device_token uuid,
  p_numero       int,
  p_monto        numeric
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v          vendedores;
  c          config;
  n          numeros;
  v_total    numeric;
  v_pendiente boolean;
  v_filas    int;
begin
  v := _vendedor_activo(p_device_token);
  select * into c from config where id = 1;

  if p_monto is null or p_monto <= 0 then
    raise exception 'monto_invalido';
  end if;

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
    pendiente_confirmacion = v_pendiente
  where numero = p_numero
    and vendedor_id = v.id
    and estado in ('apartado', 'abonado')
    and not pendiente_confirmacion;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object(
    'numero', p_numero, 'monto_abonado', v_total,
    'pendiente_confirmacion', v_pendiente
  );
end;
$$;

grant execute on function vendedor_abonar(uuid, int, numeric) to anon, authenticated;


-- "El cliente pagó los $12 y ya entregué el dinero": pasa a la cola del admin.
create or replace function vendedor_marcar_pagado(
  p_device_token uuid,
  p_numero       int
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v      vendedores;
  c      config;
  v_filas int;
begin
  v := _vendedor_activo(p_device_token);
  select * into c from config where id = 1;

  update numeros set
    estado                 = 'abonado',
    monto_abonado          = c.precio_ticket,
    fecha_ultimo_abono     = now(),
    pendiente_confirmacion = true
  where numero = p_numero
    and vendedor_id = v.id
    and estado in ('apartado', 'abonado')
    and not pendiente_confirmacion;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object('numero', p_numero, 'pendiente_confirmacion', true);
end;
$$;

grant execute on function vendedor_marcar_pagado(uuid, int) to anon, authenticated;


-- Liberar un apartado propio. Solo apartados: si hay dinero de por medio, el
-- número no se suelta desde aquí.
create or replace function vendedor_liberar_numero(
  p_device_token uuid,
  p_numero       int
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v      vendedores;
  v_filas int;
begin
  v := _vendedor_activo(p_device_token);

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
    pendiente_confirmacion = false
  where numero = p_numero
    and vendedor_id = v.id
    and estado = 'apartado'
    and monto_abonado = 0;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object('numero', p_numero, 'estado', 'libre');
end;
$$;

grant execute on function vendedor_liberar_numero(uuid, int) to anon, authenticated;


-- Extender el plazo de un apartado: el vendedor conoce a su cliente y asume
-- el riesgo (§2). Los extendidos no los libera el barrido automático.
create or replace function vendedor_extender_apartado(
  p_device_token uuid,
  p_numero       int
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v      vendedores;
  v_filas int;
begin
  v := _vendedor_activo(p_device_token);

  update numeros set
    apartado_extendido = true,
    fecha_apartado     = now()
  where numero = p_numero
    and vendedor_id = v.id
    and estado = 'apartado'
    and not apartado_extendido;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object('numero', p_numero, 'apartado_extendido', true);
end;
$$;

grant execute on function vendedor_extender_apartado(uuid, int) to anon, authenticated;
