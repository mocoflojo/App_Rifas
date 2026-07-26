-- Fase 3 — Talonario global (sección 12.2 del discovery)
--
-- Sustituye la lectura pública total de `numeros` (placeholder de la Fase 0)
-- por lectura a nivel de COLUMNA. El navegador deja de recibir los datos del
-- cliente: solo ve número, estado y a qué vendedor pertenece.
-- Realtime respeta estos GRANT, así que tampoco viajan en el payload de los
-- eventos postgres_changes.

drop policy if exists "fase0_lectura_temporal_numeros" on numeros;
revoke select on numeros from anon, authenticated;

grant select (numero, estado, vendedor_id, pendiente_confirmacion)
  on numeros to anon, authenticated;

create policy "lectura_talonario" on numeros
  for select using (true);


-- Config visible para la app: excluye el hash de la clave, el código de
-- invitación y los parámetros de comisión (§7: el comprador nunca ve la comisión).
create or replace function config_publica()
returns json
language sql
stable
security definer
set search_path = public, extensions
as $$
  select json_build_object(
    'mes_actual',           mes_actual,
    'precio_ticket',        precio_ticket,
    'abono_minimo',         abono_minimo,
    'dia_limite_abonos',    dia_limite_abonos,
    'dias_limite_apartado', dias_limite_apartado,
    'premios',              premios
  )
  from config where id = 1;
$$;

grant execute on function config_publica() to anon, authenticated;


-- Detalle de un número para un vendedor.
-- Los datos del cliente solo se devuelven si el número es suyo; de lo demás
-- únicamente sabe que está ocupado.
create or replace function vendedor_numero_detalle(
  p_device_token uuid,
  p_numero int
)
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
  v_id uuid;
begin
  select v.id into v_id
  from vendedores v
  where v.device_token = p_device_token and v.estado = 'activo';

  if v_id is null then
    raise exception 'no_autorizado';
  end if;

  return query
  select
    n.numero,
    n.estado,
    (n.vendedor_id = v_id),
    case when n.vendedor_id = v_id then n.cliente_nombre end,
    case when n.vendedor_id = v_id then n.cliente_whatsapp end,
    case when n.vendedor_id = v_id then n.monto_abonado else 0 end,
    case when n.vendedor_id = v_id then n.fecha_apartado end,
    case when n.vendedor_id = v_id then n.fecha_ultimo_abono end,
    case when n.vendedor_id = v_id then n.fecha_cobro_pautada end,
    n.pendiente_confirmacion
  from numeros n
  where n.numero = p_numero;
end;
$$;

grant execute on function vendedor_numero_detalle(uuid, int) to anon, authenticated;


-- Detalle completo para el admin, con los datos del vendedor asignado.
create or replace function admin_numero_detalle(
  p_admin_token uuid,
  p_numero int
)
returns table (
  numero              int,
  estado              text,
  cliente_nombre      text,
  cliente_whatsapp    text,
  monto_abonado       numeric,
  fecha_apartado      timestamptz,
  fecha_ultimo_abono  timestamptz,
  fecha_cobro_pautada timestamptz,
  pendiente_confirmacion boolean,
  vendedor_id         uuid,
  vendedor_nombre     text,
  vendedor_whatsapp   text
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
  select
    n.numero, n.estado, n.cliente_nombre, n.cliente_whatsapp, n.monto_abonado,
    n.fecha_apartado, n.fecha_ultimo_abono, n.fecha_cobro_pautada,
    n.pendiente_confirmacion,
    n.vendedor_id, v.nombre, v.whatsapp
  from numeros n
  left join vendedores v on v.id = n.vendedor_id
  where n.numero = p_numero;
end;
$$;

grant execute on function admin_numero_detalle(uuid, int) to anon, authenticated;
