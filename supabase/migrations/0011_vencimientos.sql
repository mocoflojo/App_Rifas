-- Fase 7 — Vencimientos, agenda y alertas (§12.2 y §9.4)
--
-- Sin servidor no hay cron: los vencimientos se aplican cuando alguien abre
-- la app. aplicar_vencimientos() la llaman los dos layouts al montar, así
-- que puede correr varias veces por minuto y desde varios navegadores a la
-- vez. De ahí las dos defensas: un candado de transacción para que solo una
-- ejecución trabaje, y condiciones dentro de cada UPDATE para que repetirla
-- no cambie nada.


-- ---------- Barrido de vencimientos ----------
-- Dos reglas distintas (§2):
--   Apartado (sin dinero) a los 14 días -> se libera sin penalidad, salvo
--   que el vendedor haya extendido el plazo a su criterio.
--   Abonado que no completó los $12 al día 25 -> pierde el dinero y el cupo;
--   lo abonado se reparte 50% vendedor / 50% banca.
create or replace function aplicar_vencimientos()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c              config;
  v_hoy          date;
  v_dia          int;
  v_apartados    int := 0;
  v_abonos       int := 0;
  v_repartido    numeric := 0;
  n              record;
  v_mitad        numeric;
begin
  -- Si otra pestaña ya está haciendo el barrido, esta se retira: el trabajo
  -- ya se está haciendo y duplicarlo solo generaría contención.
  if not pg_try_advisory_xact_lock(778811) then
    return json_build_object('omitido', true);
  end if;

  select * into c from config where id = 1;
  v_hoy := (now() at time zone c.zona_horaria)::date;
  v_dia := extract(day from v_hoy)::int;

  -- 1. Apartados caducados: el cliente nunca pagó, no hay nada que repartir.
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
  where estado = 'apartado'
    and monto_abonado = 0
    and not apartado_extendido
    and not pendiente_confirmacion
    and fecha_apartado is not null
    and fecha_apartado < now() - make_interval(days => c.dias_limite_apartado);

  get diagnostics v_apartados = row_count;

  -- 2. Abonos incompletos pasado el día límite. Solo se revisan a partir del
  --    día 26: antes de esa fecha el cliente todavía está en plazo.
  if v_dia > c.dia_limite_abonos then
    for n in
      select * from numeros
      where estado = 'abonado'
        and monto_abonado > 0
        and monto_abonado < c.precio_ticket
        and not pendiente_confirmacion   -- esperando al admin: no se toca
        and vendedor_id is not null
      for update
    loop
      v_mitad := round(n.monto_abonado / 2, 2);

      -- El registro del reparto va antes de liberar: si algo falla, la
      -- transacción entera se revierte y el número sigue como estaba.
      insert into pagos_comisiones (vendedor_id, monto, tipo, detalle)
      values (
        n.vendedor_id,
        v_mitad,
        'abonoPerdido',
        format('50%% de abono perdido — #%s (%s, $%s)',
               lpad(n.numero::text, 3, '0'),
               coalesce(n.cliente_nombre, 'sin nombre'),
               trim(to_char(n.monto_abonado, 'FM999999.00')))
      );

      update vendedores set comision_pagada = comision_pagada + v_mitad
      where id = n.vendedor_id;

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
      where numero = n.numero;

      v_abonos    := v_abonos + 1;
      v_repartido := v_repartido + n.monto_abonado;
    end loop;
  end if;

  return json_build_object(
    'apartados_liberados', v_apartados,
    'abonos_vencidos',     v_abonos,
    'monto_perdido',       v_repartido
  );
end;
$$;

-- Sin token: cualquiera que abra la app dispara el barrido. No expone datos
-- (solo devuelve conteos) y no hay forma de dirigirlo contra un número
-- concreto: aplica exactamente las reglas de config.
grant execute on function aplicar_vencimientos() to anon, authenticated;


-- ---------- Pantalla Vencimientos del admin ----------
-- Una sola consulta con las dos listas; el cliente separa por `tipo`.
create or replace function admin_vencimientos(p_admin_token uuid)
returns table (
  tipo              text,     -- 'apartado' | 'abonado'
  numero            int,
  cliente_nombre    text,
  cliente_whatsapp  text,
  monto_abonado     numeric,
  falta             numeric,
  dias_transcurridos int,     -- apartados: días desde que se apartó
  dias_restantes    int,      -- días que quedan de plazo (negativo = vencido)
  -- Un apartado extendido pasa de los 14 días a propósito: la pantalla no
  -- debe pintarlo en rojo como si el barrido lo hubiera dejado atrás.
  apartado_extendido boolean,
  fecha_cobro_pautada timestamptz,
  vendedor_id       uuid,
  vendedor_nombre   text,
  vendedor_whatsapp text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c       config;
  v_hoy   date;
  v_corte date;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  select * into c from config where id = 1;
  v_hoy := (now() at time zone c.zona_horaria)::date;
  -- Día límite de abonos dentro del mes en curso.
  v_corte := date_trunc('month', v_hoy)::date + (c.dia_limite_abonos - 1);

  return query
  select
    n.estado,
    n.numero,
    n.cliente_nombre,
    n.cliente_whatsapp,
    n.monto_abonado,
    c.precio_ticket - n.monto_abonado,
    case when n.estado = 'apartado'
      then (v_hoy - (n.fecha_apartado at time zone c.zona_horaria)::date) end,
    case when n.estado = 'apartado'
      then c.dias_limite_apartado
           - (v_hoy - (n.fecha_apartado at time zone c.zona_horaria)::date)
      else v_corte - v_hoy end,
    n.apartado_extendido,
    n.fecha_cobro_pautada,
    v.id, v.nombre, v.whatsapp
  from numeros n
  join vendedores v on v.id = n.vendedor_id
  where n.estado in ('apartado', 'abonado')
    and not n.pendiente_confirmacion
    and (n.estado = 'apartado' or n.monto_abonado < c.precio_ticket)
  -- Los extendidos al final: no corren peligro, el vendedor los sostiene.
  order by n.apartado_extendido, 8, n.numero;
end;
$$;

grant execute on function admin_vencimientos(uuid) to anon, authenticated;


-- ---------- Liberar a mano (admin) ----------
-- Solo apartados sin dinero: liberar un abonado antes del día 25 le quitaría
-- al cliente algo que todavía está en plazo, y el reparto 50/50 le
-- corresponde al barrido automático, no a un botón.
create or replace function admin_liberar_numero(
  p_admin_token uuid,
  p_numero      int
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_filas int;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

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
  where numero = p_numero
    and estado = 'apartado'
    and monto_abonado = 0
    and not pendiente_confirmacion;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'estado_invalido'; end if;

  return json_build_object('numero', p_numero, 'estado', 'libre');
end;
$$;

grant execute on function admin_liberar_numero(uuid, int) to anon, authenticated;


-- ---------- Agenda del vendedor ----------
-- Pauta (o borra, con null) la fecha en que piensa pasar a cobrar.
create or replace function vendedor_pautar_cobro(
  p_token  uuid,
  p_numero int,
  p_fecha  date
)
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

  update numeros set fecha_cobro_pautada = p_fecha
  where numero = p_numero and vendedor_id = v.id and estado <> 'libre';

  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'no_es_tuyo'; end if;

  return json_build_object('numero', p_numero, 'fecha_cobro_pautada', p_fecha);
end;
$$;

grant execute on function vendedor_pautar_cobro(uuid, int, date) to anon, authenticated;


-- Los números del vendedor con todo lo que necesitan "Mis clientes" y la
-- agenda: plazos calculados en la base para que las dos pantallas cuenten
-- los días igual.
drop function if exists vendedor_mis_numeros(uuid);
create function vendedor_mis_numeros(p_token uuid)
returns table (
  numero              int,
  estado              text,
  cliente_nombre      text,
  cliente_whatsapp    text,
  monto_abonado       numeric,
  falta               numeric,
  fecha_apartado      timestamptz,
  fecha_ultimo_abono  timestamptz,
  fecha_cobro_pautada timestamptz,
  apartado_extendido  boolean,
  pendiente_confirmacion boolean,
  nota_rechazo        text,
  dias_transcurridos  int,
  dias_restantes      int
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v       vendedores;
  c       config;
  v_hoy   date;
  v_corte date;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;
  v_hoy   := (now() at time zone c.zona_horaria)::date;
  v_corte := date_trunc('month', v_hoy)::date + (c.dia_limite_abonos - 1);

  return query
  select
    n.numero, n.estado, n.cliente_nombre, n.cliente_whatsapp, n.monto_abonado,
    c.precio_ticket - n.monto_abonado,
    n.fecha_apartado, n.fecha_ultimo_abono, n.fecha_cobro_pautada,
    n.apartado_extendido, n.pendiente_confirmacion, n.nota_rechazo,
    case when n.estado = 'apartado'
      then (v_hoy - (n.fecha_apartado at time zone c.zona_horaria)::date) end,
    case
      when n.estado = 'apartado' and n.apartado_extendido then null
      when n.estado = 'apartado'
        then c.dias_limite_apartado
             - (v_hoy - (n.fecha_apartado at time zone c.zona_horaria)::date)
      when n.estado = 'abonado' and n.monto_abonado < c.precio_ticket
        then v_corte - v_hoy
      else null end
  from numeros n
  where n.vendedor_id = v.id and n.estado <> 'libre'
  order by n.numero;
end;
$$;

grant execute on function vendedor_mis_numeros(uuid) to anon, authenticated;


-- ---------- Contadores para los avisos de la navegación ----------
-- Alertas del día del vendedor (§9.4): cobros pautados para hoy o atrasados,
-- apartados a punto de caducar y abonos cerca del día 25.
create or replace function vendedor_alertas(p_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v         vendedores;
  c         config;
  v_hoy     date;
  v_corte   date;
  v_cobros  int;
  v_apart   int;
  v_abonos  int;
  v_rechaz  int;
  v_agenda  int;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;
  v_hoy   := (now() at time zone c.zona_horaria)::date;
  v_corte := date_trunc('month', v_hoy)::date + (c.dia_limite_abonos - 1);

  select
    count(*) filter (
      where fecha_cobro_pautada is not null
        and (fecha_cobro_pautada at time zone c.zona_horaria)::date <= v_hoy),
    count(*) filter (
      where estado = 'apartado' and not apartado_extendido
        and fecha_apartado is not null
        and c.dias_limite_apartado
            - (v_hoy - (fecha_apartado at time zone c.zona_horaria)::date) <= 4),
    count(*) filter (
      where estado = 'abonado' and monto_abonado < c.precio_ticket
        and not pendiente_confirmacion
        and v_corte - v_hoy <= 3),
    count(*) filter (where nota_rechazo is not null),
    -- El aviso cuenta NÚMEROS, no motivos: un abono con cobro pautado para
    -- hoy cae en dos categorías y sumarlas inflaría el badge respecto a lo
    -- que el vendedor ve realmente en la agenda.
    count(*) filter (
      where (fecha_cobro_pautada is not null
             and (fecha_cobro_pautada at time zone c.zona_horaria)::date <= v_hoy)
         or (estado = 'apartado' and not apartado_extendido
             and fecha_apartado is not null
             and c.dias_limite_apartado
                 - (v_hoy - (fecha_apartado at time zone c.zona_horaria)::date) <= 4)
         or (estado = 'abonado' and monto_abonado < c.precio_ticket
             and not pendiente_confirmacion and v_corte - v_hoy <= 3))
  into v_cobros, v_apart, v_abonos, v_rechaz, v_agenda
  from numeros
  where vendedor_id = v.id and estado <> 'libre';

  return json_build_object(
    'cobros_hoy',      v_cobros,
    'apartados',       v_apart,
    'abonos',          v_abonos,
    'rechazos',        v_rechaz,
    'agenda',          v_agenda,
    'dia_limite',      c.dia_limite_abonos,
    'dias_para_corte', v_corte - v_hoy,
    'abono_minimo',    c.abono_minimo,
    'precio_ticket',   c.precio_ticket
  );
end;
$$;

grant execute on function vendedor_alertas(uuid) to anon, authenticated;


-- Avisos del admin para los badges de la navegación.
create or replace function admin_alertas(p_admin_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c          config;
  v_hoy      date;
  v_corte    date;
  v_confirm  int;
  v_apart    int;
  v_abonos   int;
  v_metas    int;
  v_solicit  int;
  v_meta     int;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  select * into c from config where id = 1;
  v_hoy   := (now() at time zone c.zona_horaria)::date;
  v_corte := date_trunc('month', v_hoy)::date + (c.dia_limite_abonos - 1);
  v_meta  := greatest(coalesce(c.meta_tickets, 10), 1);

  select
    count(*) filter (where pendiente_confirmacion),
    count(*) filter (
      where estado = 'apartado' and not apartado_extendido
        and not pendiente_confirmacion
        and fecha_apartado is not null
        and c.dias_limite_apartado
            - (v_hoy - (fecha_apartado at time zone c.zona_horaria)::date) <= 4),
    count(*) filter (
      where estado = 'abonado' and monto_abonado < c.precio_ticket
        and not pendiente_confirmacion
        and v_corte - v_hoy <= 3)
  into v_confirm, v_apart, v_abonos
  from numeros;

  select
    coalesce(sum(greatest((tickets_activos / v_meta) - metas_cobradas, 0)), 0),
    count(*) filter (where estado = 'pendiente')
  into v_metas, v_solicit
  from vendedores;

  return json_build_object(
    'por_confirmar',   v_confirm,
    'vencimientos',    v_apart + v_abonos,
    'metas_por_pagar', v_metas,
    'solicitudes',     v_solicit
  );
end;
$$;

grant execute on function admin_alertas(uuid) to anon, authenticated;
