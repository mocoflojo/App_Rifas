-- Fase 8 — Logros y resumen del vendedor (§11)
--
-- Cinco insignias. Tres se evalúan solas al activar un ticket
-- (primera_meta, vendedor_rapido, sesenta) porque solo dependen del
-- vendedor en el momento. Las otras dos dependen del cierre del mes:
--   racha_3   necesita saber si los dos meses ANTERIORES ya cerraron con
--             cupo completo, así que se resuelve aquí en cuanto se repite
--             sesenta un tercer mes seguido.
--   top_mes   compara a TODOS los vendedores entre sí, y esa comparación
--             solo tiene sentido al cerrar el mes (Fase 9), antes de
--             resetear los contadores. Aquí solo se deja preparado el
--             terreno (la columna "visto" y el catálogo del cliente).

alter table logros
  add column if not exists visto boolean not null default false;


-- ---------- Motor de logros ----------
-- Interna: la dispara admin_confirmar_numero, nunca el cliente directo.
create or replace function _verificar_logros(p_vendedor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v          vendedores;
  c          config;
  v_dia      int;
  v_mes_1    text;   -- mes anterior
  v_mes_2    text;   -- hace dos meses
begin
  select * into v from vendedores where id = p_vendedor_id;
  select * into c from config where id = 1;
  v_dia := extract(day from (now() at time zone c.zona_horaria))::int;

  -- primera_meta: histórico, se otorga una sola vez en la vida del vendedor
  -- sin importar en qué mes ocurra ni cuántas veces se repita después.
  if v.tickets_activos >= greatest(coalesce(c.meta_tickets, 10), 1)
     and not exists (
       select 1 from logros
       where vendedor_id = p_vendedor_id and logro_id = 'primera_meta'
     )
  then
    insert into logros (vendedor_id, logro_id, mes)
    values (p_vendedor_id, 'primera_meta', c.mes_actual)
    on conflict do nothing;
  end if;

  -- vendedor_rapido: 30 activos antes del día 8. Se evalúa en el momento:
  -- llegar a 30 el día 10 no lo desbloquea, aunque el mes siga activo.
  if v.tickets_activos >= 30 and v_dia < 8
     and not exists (
       select 1 from logros
       where vendedor_id = p_vendedor_id and logro_id = 'vendedor_rapido'
         and mes = c.mes_actual
     )
  then
    insert into logros (vendedor_id, logro_id, mes)
    values (p_vendedor_id, 'vendedor_rapido', c.mes_actual)
    on conflict do nothing;
  end if;

  -- sesenta: cupo completo (el cupo es el de CADA vendedor, no un 60 fijo).
  if v.tickets_activos >= v.cupo then
    insert into logros (vendedor_id, logro_id, mes)
    values (p_vendedor_id, 'sesenta', c.mes_actual)
    on conflict do nothing;

    -- racha_3: el mes actual y los dos anteriores, consecutivos, con cupo
    -- completo. Se evalúa siempre que se cumpla la condición de este mes,
    -- no solo la primera vez: si "sesenta" ya se había otorgado antes de
    -- que existieran los registros de los dos meses previos, el vendedor
    -- solo alcanza la racha en una confirmación posterior, y esta rama
    -- tiene que seguir corriendo para detectarlo.
    v_mes_1 := to_char(to_date(c.mes_actual || '-01', 'YYYY-MM-DD') - interval '1 month', 'YYYY-MM');
    v_mes_2 := to_char(to_date(c.mes_actual || '-01', 'YYYY-MM-DD') - interval '2 month', 'YYYY-MM');

    if exists (select 1 from logros where vendedor_id = p_vendedor_id and logro_id = 'sesenta' and mes = v_mes_1)
       and exists (select 1 from logros where vendedor_id = p_vendedor_id and logro_id = 'sesenta' and mes = v_mes_2)
    then
      insert into logros (vendedor_id, logro_id, mes)
      values (p_vendedor_id, 'racha_3', c.mes_actual)
      on conflict do nothing;
    end if;
  end if;
end;
$$;

revoke execute on function _verificar_logros(uuid) from public, anon, authenticated;


-- ---------- Confirmar número: ahora también dispara el motor ----------
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
    nota_rechazo           = null,
    -- Un ticket ya vendido no tiene cobro pendiente; dejar la fecha vieja
    -- colgando solo confundiría las alertas de agenda más adelante.
    fecha_cobro_pautada    = null
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

  perform _verificar_logros(v.id);

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


-- ---------- Pantalla "Mis logros" ----------
create or replace function vendedor_mis_logros(p_token uuid)
returns table (
  logro_id text,
  fecha    timestamptz,
  mes      text,
  visto    boolean
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
  select l.logro_id, l.fecha, l.mes, l.visto
  from logros l
  where l.vendedor_id = v.id
  order by l.fecha;
end;
$$;

grant execute on function vendedor_mis_logros(uuid) to anon, authenticated;


-- El vendedor abre "Mis logros" y ya vio la celebración: no debe volver a
-- saltar la próxima vez que entre.
create or replace function vendedor_marcar_logros_vistos(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v vendedores;
begin
  v := _vendedor_activo(p_token);
  update logros set visto = true where vendedor_id = v.id and not visto;
end;
$$;

grant execute on function vendedor_marcar_logros_vistos(uuid) to anon, authenticated;


-- Meses consecutivos (incluyendo el actual) con cupo completo. Vive aparte
-- del logro racha_3: al mes 1 y 2 de una racha en curso el vendedor ya
-- quiere ver "vas 2 de 3", no enterarse recién al tercero.
create or replace function vendedor_racha_actual(p_token uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v      vendedores;
  c      config;
  v_mes  text;
  v_racha int := 0;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;
  v_mes := c.mes_actual;

  loop
    exit when not exists (
      select 1 from logros
      where vendedor_id = v.id and logro_id = 'sesenta' and mes = v_mes
    );
    v_racha := v_racha + 1;
    v_mes := to_char(to_date(v_mes || '-01', 'YYYY-MM-DD') - interval '1 month', 'YYYY-MM');
    exit when v_racha > 60;  -- salvaguarda: nunca debería llegar tan lejos
  end loop;

  return v_racha;
end;
$$;

grant execute on function vendedor_racha_actual(uuid) to anon, authenticated;


-- Posición del mes sin exponer datos de nadie más (§9.5): un número y un
-- total, nada de nombres ni cifras ajenas.
create or replace function vendedor_posicion(p_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v          vendedores;
  v_posicion int;
  v_total    int;
begin
  v := _vendedor_activo(p_token);

  select count(*) + 1 into v_posicion
  from vendedores
  where estado = 'activo' and tickets_activos > v.tickets_activos;

  select count(*) into v_total from vendedores where estado = 'activo';

  return json_build_object(
    'posicion',        v_posicion,
    'total',           v_total,
    'tickets_activos', v.tickets_activos
  );
end;
$$;

grant execute on function vendedor_posicion(uuid) to anon, authenticated;


-- ---------- Alertas: ahora también avisa de logros sin ver ----------
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
  v_logros  int;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;
  v_hoy   := (now() at time zone c.zona_horaria)::date;
  v_corte := date_trunc('month', v_hoy)::date + (c.dia_limite_abonos - 1);

  select
    -- estado <> 'activo': un número ya vendido puede conservar una fecha
    -- pautada de cuando todavía era un apartado/abono, y eso no es un
    -- pendiente real — nadie va a "cobrarle" a un ticket ya cerrado.
    count(*) filter (
      where fecha_cobro_pautada is not null
        and estado <> 'activo'
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
      where (fecha_cobro_pautada is not null and estado <> 'activo'
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

  select count(*) into v_logros from logros where vendedor_id = v.id and not visto;

  return json_build_object(
    'cobros_hoy',      v_cobros,
    'apartados',       v_apart,
    'abonos',          v_abonos,
    'rechazos',        v_rechaz,
    'agenda',          v_agenda,
    'logros_nuevos',   v_logros,
    'dia_limite',      c.dia_limite_abonos,
    'dias_para_corte', v_corte - v_hoy,
    'abono_minimo',    c.abono_minimo,
    'precio_ticket',   c.precio_ticket
  );
end;
$$;

grant execute on function vendedor_alertas(uuid) to anon, authenticated;
