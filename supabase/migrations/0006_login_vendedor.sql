-- Acceso del vendedor con usuario y clave
--
-- Reemplaza la identidad por device_token (atada al navegador: si se borraba,
-- el vendedor perdía el acceso y al re-registrarse se duplicaba) por una
-- cuenta real. Mismo patrón que ya usa el admin: bcrypt + token de sesión.
-- Recuperación: el admin restablece la clave desde su panel.

alter table vendedores
  add column if not exists usuario          text,
  add column if not exists clave_hash       text,
  add column if not exists session_token    uuid,
  add column if not exists session_expires  timestamptz,
  add column if not exists intentos_fallidos int not null default 0,
  add column if not exists bloqueado_hasta  timestamptz;

-- El usuario se guarda normalizado, así que la unicidad no distingue mayúsculas.
create unique index if not exists vendedores_usuario_unico on vendedores (usuario);

-- Freno al ensayo y error de claves, también para el admin.
alter table config
  add column if not exists admin_intentos_fallidos int not null default 0,
  add column if not exists admin_bloqueado_hasta   timestamptz;

drop function if exists vendedor_por_device(uuid);
alter table vendedores drop column if exists device_token;


-- Normaliza y valida un nombre de usuario.
create or replace function _normalizar_usuario(p_usuario text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(trim(coalesce(p_usuario, '')));
  if length(v) < 3 then
    raise exception 'usuario_corto';
  end if;
  if v !~ '^[a-z0-9._-]+$' then
    raise exception 'usuario_invalido';
  end if;
  return v;
end;
$$;

revoke execute on function _normalizar_usuario(text) from public, anon, authenticated;


-- ---------- Registro ----------
create or replace function registrar_vendedor(
  p_codigo   text,
  p_nombre   text,
  p_whatsapp text,
  p_usuario  text,
  p_clave    text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_usuario text;
  v_token   uuid;
  v_row     vendedores;
begin
  if (select codigo_invitacion from config where id = 1) is distinct from p_codigo then
    raise exception 'codigo_invalido';
  end if;

  if coalesce(trim(p_nombre), '') = '' then raise exception 'nombre_requerido'; end if;
  if length(coalesce(p_clave, '')) < 6 then raise exception 'clave_corta'; end if;

  v_usuario := _normalizar_usuario(p_usuario);

  if exists (select 1 from vendedores where usuario = v_usuario) then
    raise exception 'usuario_ocupado';
  end if;

  v_token := gen_random_uuid();

  insert into vendedores (
    nombre, whatsapp, usuario, clave_hash, cupo, estado,
    session_token, session_expires
  )
  select trim(p_nombre), trim(p_whatsapp), v_usuario,
         crypt(p_clave, gen_salt('bf')), cupo_default, 'pendiente',
         v_token, now() + interval '30 days'
  from config where id = 1
  returning * into v_row;

  return json_build_object(
    'id', v_row.id, 'token', v_token,
    'nombre', v_row.nombre, 'estado', v_row.estado
  );
end;
$$;

-- La firma vieja (con device_token) desaparece.
drop function if exists registrar_vendedor(text, text, text, uuid);
grant execute on function registrar_vendedor(text, text, text, text, text)
  to anon, authenticated;


-- ---------- Entrar ----------
-- Devuelve token aunque el vendedor esté pendiente o suspendido: así la app
-- puede explicarle su situación en vez de decirle que la clave está mal.
-- Las operaciones de venta sí exigen estado = 'activo'.
create or replace function login_vendedor(p_usuario text, p_clave text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v         vendedores;
  v_usuario text;
  v_token   uuid;
begin
  v_usuario := lower(trim(coalesce(p_usuario, '')));

  select * into v from vendedores where usuario = v_usuario;

  -- Los fallos se DEVUELVEN, no se lanzan con raise: una excepción revierte
  -- la transacción y con ella el contador de intentos, dejando el freno inútil.
  if not found then
    -- Mismo error que una clave mala: no se revela qué usuarios existen.
    return json_build_object('error', 'credenciales_invalidas');
  end if;

  if v.bloqueado_hasta is not null and v.bloqueado_hasta > now() then
    return json_build_object('error', 'demasiados_intentos');
  end if;

  if v.clave_hash is null
     or v.clave_hash <> crypt(p_clave, v.clave_hash) then
    update vendedores set
      intentos_fallidos = intentos_fallidos + 1,
      bloqueado_hasta = case
        when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes'
        else bloqueado_hasta end
    where id = v.id;
    return json_build_object('error', 'credenciales_invalidas');
  end if;

  v_token := gen_random_uuid();

  update vendedores set
    session_token     = v_token,
    session_expires   = now() + interval '30 days',
    intentos_fallidos = 0,
    bloqueado_hasta   = null
  where id = v.id;

  return json_build_object(
    'id', v.id, 'token', v_token, 'nombre', v.nombre, 'estado', v.estado
  );
end;
$$;

grant execute on function login_vendedor(text, text) to anon, authenticated;


-- ---------- Sesión ----------
create or replace function vendedor_por_sesion(p_token uuid)
returns json
language sql
stable
security definer
set search_path = public, extensions
as $$
  select json_build_object(
    'id', id, 'nombre', nombre, 'usuario', usuario, 'estado', estado,
    'cupo', cupo, 'tickets_activos', tickets_activos
  )
  from vendedores
  where session_token = p_token and session_expires > now();
$$;

grant execute on function vendedor_por_sesion(uuid) to anon, authenticated;


create or replace function cerrar_sesion_vendedor(p_token uuid)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update vendedores
  set session_token = null, session_expires = null
  where session_token = p_token;
$$;

grant execute on function cerrar_sesion_vendedor(uuid) to anon, authenticated;


-- Resuelve al vendedor de la sesión. Interna.
-- Se elimina primero porque cambia el nombre del parámetro (antes p_device_token).
drop function if exists _vendedor_activo(uuid);
create function _vendedor_activo(p_token uuid)
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
  where session_token = p_token
    and session_expires > now()
    and estado = 'activo';

  if not found then
    raise exception 'no_autorizado';
  end if;

  return v;
end;
$$;

revoke execute on function _vendedor_activo(uuid) from public, anon, authenticated;


-- ---------- El admin restablece la clave ----------
create or replace function admin_resetear_clave_vendedor(
  p_admin_token uuid,
  p_vendedor_id uuid,
  p_clave_nueva text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v vendedores;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;
  if length(coalesce(p_clave_nueva, '')) < 6 then
    raise exception 'clave_corta';
  end if;

  -- Cierra las sesiones abiertas: si le robaron el teléfono, deja de servir.
  update vendedores set
    clave_hash        = crypt(p_clave_nueva, gen_salt('bf')),
    session_token     = null,
    session_expires   = null,
    intentos_fallidos = 0,
    bloqueado_hasta   = null
  where id = p_vendedor_id
  returning * into v;

  if not found then raise exception 'vendedor_no_existe'; end if;

  return json_build_object(
    'nombre', v.nombre, 'usuario', v.usuario, 'whatsapp', v.whatsapp
  );
end;
$$;

grant execute on function admin_resetear_clave_vendedor(uuid, uuid, text)
  to anon, authenticated;


-- ---------- Mismo freno para la clave del admin ----------
create or replace function login_admin(p_clave text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c       config;
  v_token uuid;
begin
  select * into c from config where id = 1;

  if c.admin_bloqueado_hasta is not null and c.admin_bloqueado_hasta > now() then
    raise exception 'demasiados_intentos';
  end if;

  if c.clave_admin_hash <> crypt(p_clave, c.clave_admin_hash) then
    update config set
      admin_intentos_fallidos = admin_intentos_fallidos + 1,
      admin_bloqueado_hasta = case
        when admin_intentos_fallidos + 1 >= 5 then now() + interval '15 minutes'
        else admin_bloqueado_hasta end
    where id = 1;
    return null;
  end if;

  v_token := gen_random_uuid();

  update config set
    admin_session_token     = v_token,
    admin_session_expires   = now() + interval '12 hours',
    admin_intentos_fallidos = 0,
    admin_bloqueado_hasta   = null
  where id = 1;

  return v_token;
end;
$$;


-- ---------- Renombrado del parámetro en las funciones de venta ----------
-- Ya no es el token del dispositivo sino el de la sesión. El cuerpo apenas
-- cambia: todas resuelven al vendedor con _vendedor_activo(), que en esta
-- migración pasó a buscar por session_token. La excepción es
-- vendedor_numero_detalle, que consultaba device_token directamente.
-- Postgres no permite renombrar parámetros con CREATE OR REPLACE, de ahí los DROP.

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
    n.pendiente_confirmacion
  from numeros n
  where n.numero = p_numero;
end;
$$;
grant execute on function vendedor_numero_detalle(uuid, int) to anon, authenticated;


drop function if exists vendedor_resumen_cupo(uuid);
create function vendedor_resumen_cupo(p_token uuid)
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
  v := _vendedor_activo(p_token);
  select count(*) into v_tomados
  from numeros where vendedor_id = v.id and estado <> 'libre';
  return json_build_object(
    'cupo', v.cupo, 'tomados', v_tomados,
    'disponibles', greatest(v.cupo - v_tomados, 0)
  );
end;
$$;
grant execute on function vendedor_resumen_cupo(uuid) to anon, authenticated;


drop function if exists vendedor_mis_numeros(uuid);
create function vendedor_mis_numeros(p_token uuid)
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
  v := _vendedor_activo(p_token);
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


drop function if exists vendedor_tomar_numero(uuid, int, text, text, text, numeric);
create function vendedor_tomar_numero(
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
    pendiente_confirmacion = v_pendiente
  where numero = p_numero and estado = 'libre';

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'numero_ocupado'; end if;

  return json_build_object(
    'numero', p_numero, 'estado', v_estado,
    'monto_abonado', v_monto, 'pendiente_confirmacion', v_pendiente
  );
end;
$$;
grant execute on function vendedor_tomar_numero(uuid, int, text, text, text, numeric)
  to anon, authenticated;


drop function if exists vendedor_abonar(uuid, int, numeric);
create function vendedor_abonar(p_token uuid, p_numero int, p_monto numeric)
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
    pendiente_confirmacion = v_pendiente
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
grant execute on function vendedor_abonar(uuid, int, numeric) to anon, authenticated;


drop function if exists vendedor_marcar_pagado(uuid, int);
create function vendedor_marcar_pagado(p_token uuid, p_numero int)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v       vendedores;
  c       config;
  v_filas int;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;

  update numeros set
    estado                 = 'abonado',
    monto_abonado          = c.precio_ticket,
    fecha_ultimo_abono     = now(),
    pendiente_confirmacion = true
  where numero = p_numero and vendedor_id = v.id
    and estado in ('apartado', 'abonado') and not pendiente_confirmacion;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object('numero', p_numero, 'pendiente_confirmacion', true);
end;
$$;
grant execute on function vendedor_marcar_pagado(uuid, int) to anon, authenticated;


drop function if exists vendedor_liberar_numero(uuid, int);
create function vendedor_liberar_numero(p_token uuid, p_numero int)
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
    pendiente_confirmacion = false
  where numero = p_numero and vendedor_id = v.id
    and estado = 'apartado' and monto_abonado = 0;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object('numero', p_numero, 'estado', 'libre');
end;
$$;
grant execute on function vendedor_liberar_numero(uuid, int) to anon, authenticated;


drop function if exists vendedor_extender_apartado(uuid, int);
create function vendedor_extender_apartado(p_token uuid, p_numero int)
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
    apartado_extendido = true,
    fecha_apartado     = now()
  where numero = p_numero and vendedor_id = v.id
    and estado = 'apartado' and not apartado_extendido;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object('numero', p_numero, 'apartado_extendido', true);
end;
$$;
grant execute on function vendedor_extender_apartado(uuid, int) to anon, authenticated;
