-- Fase 6 — Comisiones y metas (§4.2 y §12.3)
--
-- Regla: cada `config.meta_tickets` tickets ACTIVOS acumulados generan una
-- meta de `config.pago_meta` que el admin paga al instante. El contador de
-- tickets nunca se reinicia por pagar (ticket 10, 20, 30...): lo que avanza
-- es `metas_cobradas`. La liquidación del día del sorteo ($6 por ticket
-- suelto) es de la Fase 9 y no se calcula aquí.
--
-- Nada de esto se decide en el navegador: el monto sale de `config` y el
-- cobro de una meta es un UPDATE condicional, así dos clics simultáneos del
-- admin no pueden pagar la misma meta dos veces.


-- ---------- Listado de vendedores para el admin ----------
-- Se rehace por dos motivos:
--   1) Añade el cálculo de metas (§12.3) para no repetirlo en el cliente.
--   2) Deja de devolver `setof vendedores`: esa forma mandaba al navegador
--      del admin el `clave_hash` y el `session_token` de cada vendedor, con
--      los que se podía suplantar a cualquiera. Ahora la lista de columnas
--      es explícita.
drop function if exists admin_listar_vendedores(uuid);
create function admin_listar_vendedores(p_admin_token uuid)
returns table (
  id                uuid,
  nombre            text,
  usuario           text,
  whatsapp          text,
  estado            text,
  cupo              int,
  fecha_registro    timestamptz,
  tickets_activos   int,
  metas_cobradas    int,
  comision_pagada   numeric,
  -- Derivados de la configuración vigente:
  meta_tickets      int,
  pago_meta         numeric,
  metas_disponibles int,
  en_meta           int
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c config;
  v_meta int;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  -- config.id va calificado: `id` también es una columna de salida de esta
  -- función y sin el prefijo Postgres no sabe a cuál se refiere.
  select * into c from config where config.id = 1;
  v_meta := greatest(coalesce(c.meta_tickets, 10), 1);

  return query
  select
    v.id, v.nombre, v.usuario, v.whatsapp, v.estado, v.cupo, v.fecha_registro,
    v.tickets_activos, v.metas_cobradas, v.comision_pagada,
    v_meta,
    c.pago_meta,
    greatest((v.tickets_activos / v_meta) - v.metas_cobradas, 0),
    -- Progreso hacia la primera meta NO cobrada: con 10 activos y 0 metas
    -- pagadas la barra debe verse llena, no en cero.
    least(greatest(v.tickets_activos - (v.metas_cobradas * v_meta), 0), v_meta)
  from vendedores v
  order by v.fecha_registro desc;
end;
$$;

grant execute on function admin_listar_vendedores(uuid) to anon, authenticated;


-- ---------- Pagar una meta ----------
-- Paga de a una meta. Si un vendedor acumuló dos sin cobrar, el admin toca
-- el botón dos veces y quedan dos registros separados en pagos_comisiones.
create or replace function admin_pagar_meta(
  p_admin_token uuid,
  p_vendedor_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c        config;
  v        vendedores;
  v_meta   int;
  v_numero int;   -- qué número de meta se está pagando
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  select * into c from config where id = 1;
  v_meta := greatest(coalesce(c.meta_tickets, 10), 1);

  -- La condición viaja dentro del UPDATE: Postgres bloquea la fila y la
  -- reevalúa, así que dos sesiones del admin pagando a la vez no pueden
  -- pasar ambas. Comprobar antes y actualizar después sí lo permitiría.
  update vendedores set
    metas_cobradas  = metas_cobradas + 1,
    comision_pagada = comision_pagada + c.pago_meta
  where id = p_vendedor_id
    and (tickets_activos / v_meta) - metas_cobradas >= 1
  returning * into v;

  if not found then
    raise exception 'sin_meta_disponible';
  end if;

  v_numero := v.metas_cobradas;

  insert into pagos_comisiones (vendedor_id, monto, tipo, detalle)
  values (
    p_vendedor_id,
    c.pago_meta,
    'meta',
    format('Meta %s (tickets %s-%s)',
           v_numero,
           (v_numero - 1) * v_meta + 1,
           v_numero * v_meta)
  );

  return json_build_object(
    'vendedor_id',       v.id,
    'nombre',            v.nombre,
    'whatsapp',          v.whatsapp,
    'monto',             c.pago_meta,
    'meta_numero',       v_numero,
    'metas_cobradas',    v.metas_cobradas,
    'comision_pagada',   v.comision_pagada,
    'tickets_activos',   v.tickets_activos,
    'metas_disponibles', greatest((v.tickets_activos / v_meta) - v.metas_cobradas, 0)
  );
end;
$$;

grant execute on function admin_pagar_meta(uuid, uuid) to anon, authenticated;


-- ---------- Historial de pagos (admin) ----------
-- Sin p_vendedor_id devuelve todo el mes; con él, solo el de ese vendedor.
create or replace function admin_pagos_comisiones(
  p_admin_token uuid,
  p_vendedor_id uuid default null
)
returns table (
  id              uuid,
  vendedor_id     uuid,
  vendedor_nombre text,
  monto           numeric,
  tipo            text,
  fecha           timestamptz,
  detalle         text
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
  select p.id, p.vendedor_id, v.nombre, p.monto, p.tipo, p.fecha, p.detalle
  from pagos_comisiones p
  join vendedores v on v.id = p.vendedor_id
  where p_vendedor_id is null or p.vendedor_id = p_vendedor_id
  order by p.fecha desc;
end;
$$;

grant execute on function admin_pagos_comisiones(uuid, uuid) to anon, authenticated;


-- ---------- Resumen del vendedor ----------
-- Todo lo que necesita su pantalla "Mi resumen": progreso de meta, cupo,
-- estado de sus números y lo cobrado. Un solo viaje a la base.
create or replace function vendedor_resumen_comisiones(p_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c            config;
  v            vendedores;
  v_meta       int;
  v_en_meta    int;
  v_disponibles int;
  v_apartados  int;
  v_abonados   int;
  v_pendientes int;
  v_historico  numeric;
begin
  v := _vendedor_activo(p_token);

  select * into c from config where id = 1;
  v_meta := greatest(coalesce(c.meta_tickets, 10), 1);

  v_en_meta     := least(greatest(v.tickets_activos - (v.metas_cobradas * v_meta), 0), v_meta);
  v_disponibles := greatest((v.tickets_activos / v_meta) - v.metas_cobradas, 0);

  select
    count(*) filter (where estado = 'apartado'),
    count(*) filter (where estado = 'abonado'),
    count(*) filter (where pendiente_confirmacion)
  into v_apartados, v_abonados, v_pendientes
  from numeros
  where vendedor_id = v.id;

  -- pagos_comisiones no se borra al cerrar el mes: la suma completa es el
  -- total histórico ganado por el vendedor.
  select coalesce(sum(monto), 0) into v_historico
  from pagos_comisiones where vendedor_id = v.id;

  return json_build_object(
    'nombre',            v.nombre,
    'cupo',              v.cupo,
    'tickets_activos',   v.tickets_activos,
    'apartados',         v_apartados,
    'abonados',          v_abonados,
    'pendientes',        v_pendientes,
    'meta_tickets',      v_meta,
    'pago_meta',         c.pago_meta,
    'en_meta',           v_en_meta,
    'faltan',            v_meta - v_en_meta,
    'metas_cobradas',    v.metas_cobradas,
    'metas_disponibles', v_disponibles,
    'comision_pagada',   v.comision_pagada,
    'total_historico',   v_historico
  );
end;
$$;

grant execute on function vendedor_resumen_comisiones(uuid) to anon, authenticated;


-- ---------- Historial de pagos (vendedor) ----------
create or replace function vendedor_mis_pagos(p_token uuid)
returns table (
  id      uuid,
  monto   numeric,
  tipo    text,
  fecha   timestamptz,
  detalle text
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
  select p.id, p.monto, p.tipo, p.fecha, p.detalle
  from pagos_comisiones p
  where p.vendedor_id = v.id
  order by p.fecha desc;
end;
$$;

grant execute on function vendedor_mis_pagos(uuid) to anon, authenticated;


-- ---------- Confirmar número: avisar si se completó una meta ----------
-- Mismo comportamiento que en la Fase 5; solo se amplía la respuesta para
-- que el diálogo de confirmación pueda decir "completó la meta" con el dato
-- real de la base en vez de deducirlo con un módulo en el cliente.
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
  n      numeros;
  v      vendedores;
  c      config;
  v_meta int;
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

  select * into c from config where id = 1;
  v_meta := greatest(coalesce(c.meta_tickets, 10), 1);

  return json_build_object(
    'numero',            n.numero,
    'cliente_nombre',    n.cliente_nombre,
    'cliente_whatsapp',  n.cliente_whatsapp,
    'vendedor_id',       v.id,
    'vendedor_nombre',   v.nombre,
    'tickets_activos',   v.tickets_activos,
    'pago_meta',         c.pago_meta,
    'metas_disponibles', greatest((v.tickets_activos / v_meta) - v.metas_cobradas, 0)
  );
end;
$$;

grant execute on function admin_confirmar_numero(uuid, int) to anon, authenticated;
