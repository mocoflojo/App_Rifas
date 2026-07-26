-- Fase 2: acceso y roles.
-- No usamos Supabase Auth (los vendedores no tienen email/Gmail, ver sección 7).
-- En su lugar, las operaciones sensibles pasan por funciones RPC (SECURITY DEFINER)
-- que validan el código de invitación / clave admin / token de sesión admin
-- server-side, sin exponer esos secretos via SELECT directo al rol anon.

create extension if not exists pgcrypto;

alter table config
  add column if not exists admin_session_token uuid,
  add column if not exists admin_session_expires timestamptz;

-- Clave admin de demo inicial: "admin123" (hasheada). Se cambia en la
-- pantalla de Configuración (Fase 8).
update config
set clave_admin_hash = extensions.crypt('admin123', extensions.gen_salt('bf'))
where id = 1 and clave_admin_hash = 'CAMBIAR_ESTA_CLAVE';

-- Ya no exponemos config ni el detalle de vendedores por SELECT directo:
-- todo pasa por RPC. (numeros se mantiene legible para el talonario, Fase 3).
revoke select on config from anon, authenticated;
drop policy if exists "fase0_lectura_temporal_config" on config;

revoke select, insert, update on vendedores from anon, authenticated;

-- ---------- Login admin ----------
create or replace function login_admin(p_clave text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean;
  v_token uuid;
begin
  select (clave_admin_hash = crypt(p_clave, clave_admin_hash)) into v_ok
  from config where id = 1;

  if not v_ok then
    return null;
  end if;

  v_token := gen_random_uuid();
  update config
    set admin_session_token = v_token,
        admin_session_expires = now() + interval '12 hours'
    where id = 1;

  return v_token;
end;
$$;

grant execute on function login_admin(text) to anon, authenticated;

create or replace function admin_token_valido(p_token uuid)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from config
    where id = 1
      and admin_session_token = p_token
      and admin_session_expires > now()
  );
$$;

grant execute on function admin_token_valido(uuid) to anon, authenticated;

-- ---------- Registro de vendedor ----------
create or replace function registrar_vendedor(
  p_codigo text,
  p_nombre text,
  p_whatsapp text,
  p_device_token uuid
)
returns vendedores
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_codigo_ok boolean;
  v_row vendedores;
begin
  select (codigo_invitacion = p_codigo) into v_codigo_ok from config where id = 1;

  if not v_codigo_ok then
    raise exception 'codigo_invalido';
  end if;

  insert into vendedores (nombre, whatsapp, device_token, cupo, estado)
  select p_nombre, p_whatsapp, p_device_token, cupo_default, 'pendiente'
  from config where id = 1
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function registrar_vendedor(text, text, text, uuid) to anon, authenticated;

-- ---------- Estado de sesión del vendedor (por device_token) ----------
create or replace function vendedor_por_device(p_device_token uuid)
returns vendedores
language sql
security definer
set search_path = public, extensions
as $$
  select * from vendedores where device_token = p_device_token limit 1;
$$;

grant execute on function vendedor_por_device(uuid) to anon, authenticated;

-- ---------- Panel admin: listar / aprobar / rechazar / suspender ----------
create or replace function admin_listar_vendedores(p_admin_token uuid)
returns setof vendedores
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;
  return query select * from vendedores order by fecha_registro desc;
end;
$$;

grant execute on function admin_listar_vendedores(uuid) to anon, authenticated;

create or replace function admin_actualizar_estado_vendedor(
  p_admin_token uuid,
  p_vendedor_id uuid,
  p_estado text
)
returns vendedores
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row vendedores;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;
  if p_estado not in ('pendiente', 'activo', 'suspendido') then
    raise exception 'estado_invalido';
  end if;

  update vendedores set estado = p_estado
  where id = p_vendedor_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function admin_actualizar_estado_vendedor(uuid, uuid, text) to anon, authenticated;
