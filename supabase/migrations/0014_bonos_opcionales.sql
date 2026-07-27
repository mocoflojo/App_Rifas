-- Los bonos por logros pasan a ser opcionales.
--
-- El admin puede decidir operar la rifa SIN pagar dinero por logros: las
-- insignias se siguen ganando, se siguen celebrando y se siguen viendo en
-- el panel del vendedor, pero no generan ningún pago.
--
-- La decisión se toma al ARRANCAR la rifa y queda congelada en cuanto el
-- mes empieza a moverse. El motivo es que cambiarla a mitad de camino es
-- injusto en las dos direcciones: apagarla le quita a quien ya se ganó el
-- bono, y encenderla obliga a decidir si se paga retroactivamente lo que
-- se ganó mientras estaba apagada. Bloquearla elimina el dilema entero.

alter table config
  add column if not exists bonos_activos boolean not null default true;


-- El mes "arrancó" cuando ya hay al menos un número tomado. Justo después
-- de cerrar el mes el talonario queda limpio, que es la ventana en la que
-- el admin configura las reglas del mes entrante.
create or replace function _mes_iniciado()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (select 1 from numeros where estado <> 'libre');
$$;

revoke execute on function _mes_iniciado() from public, anon, authenticated;


-- ---------- Liberar bonos: no hace nada si están apagados ----------
create or replace function _liberar_bonos_colectivos()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c        config;
  v_total  int;
  fila     record;
  v_premio numeric;
  v_nombre text;
begin
  select * into c from config where id = 1;

  -- Con los bonos apagados las insignias se siguen otorgando (eso lo hace
  -- _verificar_logros, que no toca dinero); aquí solo se corta el pago.
  if not c.bonos_activos then
    return;
  end if;

  select coalesce(sum(tickets_activos), 0) into v_total from vendedores;
  if v_total < c.meta_colectiva then
    return;
  end if;

  for fila in
    select l.vendedor_id, l.logro_id, l.mes
    from logros l
    where l.mes = c.mes_actual
      and l.logro_id in ('vendedor_rapido', 'sesenta', 'racha_3')
      and not l.pagado
    for update
  loop
    v_premio := case fila.logro_id
      when 'vendedor_rapido' then c.premio_vendedor_rapido
      when 'sesenta'         then c.premio_cupo_completo
      when 'racha_3'         then c.premio_racha
    end;
    v_nombre := case fila.logro_id
      when 'vendedor_rapido' then 'Vendedor rápido'
      when 'sesenta'         then 'Cupo completo'
      when 'racha_3'         then 'En racha'
    end;

    insert into pagos_comisiones (vendedor_id, monto, tipo, detalle)
    values (
      fila.vendedor_id, v_premio, 'logro',
      format('Bono "%s" (el equipo llegó a %s tickets activos)', v_nombre, c.meta_colectiva)
    );
    update vendedores set comision_pagada = comision_pagada + v_premio where id = fila.vendedor_id;
    update logros set pagado = true
    where vendedor_id = fila.vendedor_id and logro_id = fila.logro_id and mes = fila.mes;
  end loop;
end;
$$;

revoke execute on function _liberar_bonos_colectivos() from public, anon, authenticated;


-- ---------- Cierre de mes: el top 3 también respeta el interruptor ----------
create or replace function cierre_mes(p_admin_token uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c                    config;
  v_inicio             timestamptz;
  v_tickets_vendidos   int;
  v_ingresos           numeric;
  v_comisiones_pagadas numeric;
  v_abonos_perdidos    numeric;
  v_numeros_banca      int;
  v_motos_banca        int;
  v_vendedores_activos int;
  v_top_vendedor       jsonb := '{}'::jsonb;
  fila                 record;
  v_puesto             int := 0;
  v_premio             numeric;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  select * into c from config where id = 1;
  if c.ganadores_registrados is null then
    raise exception 'sorteo_no_registrado';
  end if;
  v_inicio := to_date(c.mes_actual || '-01', 'YYYY-MM-DD');

  -- ---------- Ranking del mes ----------
  -- La insignia se otorga siempre; el premio solo si los bonos están
  -- activos. Empate lo rompe quien llegó primero a esa cifra.
  for fila in
    select
      v.id, v.nombre, v.tickets_activos,
      (select max(n.fecha_activacion) from numeros n
       where n.vendedor_id = v.id and n.estado = 'activo') as ultimo
    from vendedores v
    where v.tickets_activos > 0
    order by v.tickets_activos desc, ultimo asc nulls last
    limit 3
  loop
    v_puesto := v_puesto + 1;

    if c.bonos_activos then
      v_premio := case v_puesto
        when 1 then c.premio_top_1
        when 2 then c.premio_top_2
        when 3 then c.premio_top_3
      end;

      insert into pagos_comisiones (vendedor_id, monto, tipo, detalle)
      values (fila.id, v_premio, 'logro',
              format('Top vendedor #%s del mes (%s tickets activos)', v_puesto, fila.tickets_activos));
      update vendedores set comision_pagada = comision_pagada + v_premio where id = fila.id;
    end if;

    insert into logros (vendedor_id, logro_id, mes, pagado)
    values (fila.id, 'top_mes_' || v_puesto, c.mes_actual, c.bonos_activos)
    on conflict do nothing;

    if v_puesto = 1 then
      v_top_vendedor := jsonb_build_object('nombre', fila.nombre, 'tickets_activos', fila.tickets_activos);
    end if;
  end loop;

  -- ---------- Snapshot para el historial ----------
  select count(*) into v_tickets_vendidos from numeros where estado = 'activo';
  v_ingresos := v_tickets_vendidos * c.precio_ticket;

  select coalesce(sum(monto), 0) into v_comisiones_pagadas
  from pagos_comisiones where fecha >= v_inicio;

  select coalesce(sum(monto), 0) * 2 into v_abonos_perdidos
  from pagos_comisiones where tipo = 'abonoPerdido' and fecha >= v_inicio;

  select count(*) into v_numeros_banca from numeros where estado <> 'activo';

  select count(*) into v_motos_banca
  from jsonb_array_elements(c.ganadores_registrados) g
  where (g ->> 'es_banca')::boolean;

  select count(*) into v_vendedores_activos from vendedores where estado = 'activo';

  insert into historico (
    mes, tickets_vendidos, ingresos, comisiones_pagadas, abonos_perdidos,
    numeros_banca, motos_ganadas_banca, ganadores, top_vendedor, vendedores_activos
  ) values (
    c.mes_actual, v_tickets_vendidos, v_ingresos, v_comisiones_pagadas, v_abonos_perdidos,
    v_numeros_banca, v_motos_banca, c.ganadores_registrados, v_top_vendedor, v_vendedores_activos
  );

  -- ---------- Reset del talonario y los contadores ----------
  update numeros set
    estado = 'libre', vendedor_id = null, cliente_nombre = null, cliente_whatsapp = null,
    monto_abonado = 0, fecha_apartado = null, fecha_ultimo_abono = null, fecha_activacion = null,
    fecha_cobro_pautada = null, apartado_extendido = false, pendiente_confirmacion = false,
    estado_previo = null, monto_previo = null, nota_rechazo = null
  where numero > 0;

  update vendedores set tickets_activos = 0, metas_cobradas = 0, comision_pagada = 0
  where cupo > 0;

  update config set
    ganadores_registrados = null,
    mes_actual = to_char(v_inicio + interval '1 month', 'YYYY-MM')
  where id = 1;

  return json_build_object(
    'mes_cerrado',         c.mes_actual,
    'tickets_vendidos',    v_tickets_vendidos,
    'ingresos',            v_ingresos,
    'comisiones_pagadas',  v_comisiones_pagadas,
    'abonos_perdidos',     v_abonos_perdidos,
    'numeros_banca',       v_numeros_banca,
    'motos_ganadas_banca', v_motos_banca,
    'top_vendedor',        v_top_vendedor
  );
end;
$$;

grant execute on function cierre_mes(uuid) to anon, authenticated;


-- ---------- Config del admin: expone el interruptor y si está bloqueado ----------
create or replace function admin_config(p_admin_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c config;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;
  select * into c from config where id = 1;
  return json_build_object(
    'mes_actual',              c.mes_actual,
    'precio_ticket',           c.precio_ticket,
    'comision_ticket',         c.comision_ticket,
    'meta_tickets',            c.meta_tickets,
    'pago_meta',               c.pago_meta,
    'abono_minimo',            c.abono_minimo,
    'dia_limite_abonos',       c.dia_limite_abonos,
    'dias_limite_apartado',    c.dias_limite_apartado,
    'premios',                 c.premios,
    'cupo_default',            c.cupo_default,
    'codigo_invitacion',       c.codigo_invitacion,
    'meta_colectiva',          c.meta_colectiva,
    'dias_vendedor_rapido',    c.dias_vendedor_rapido,
    'premio_vendedor_rapido',  c.premio_vendedor_rapido,
    'premio_cupo_completo',    c.premio_cupo_completo,
    'premio_racha',            c.premio_racha,
    'premio_top_1',            c.premio_top_1,
    'premio_top_2',            c.premio_top_2,
    'premio_top_3',            c.premio_top_3,
    'bonos_activos',           c.bonos_activos,
    -- Con el mes ya en marcha, el interruptor de bonos queda de solo lectura.
    'mes_iniciado',            _mes_iniciado()
  );
end;
$$;

grant execute on function admin_config(uuid) to anon, authenticated;


-- Firma nueva (agrega p_bonos_activos): se elimina la anterior para no
-- dejar dos versiones conviviendo.
drop function if exists admin_actualizar_config(
  uuid, numeric, numeric, int, numeric, numeric, int, int, int, text, jsonb,
  int, int, numeric, numeric, numeric, numeric, numeric, numeric
);

create or replace function admin_actualizar_config(
  p_admin_token             uuid,
  p_precio_ticket           numeric,
  p_comision_ticket         numeric,
  p_meta_tickets            int,
  p_pago_meta               numeric,
  p_abono_minimo            numeric,
  p_dia_limite_abonos       int,
  p_dias_limite_apartado    int,
  p_cupo_default            int,
  p_codigo_invitacion       text,
  p_premios                 jsonb,
  p_meta_colectiva          int,
  p_dias_vendedor_rapido    int,
  p_premio_vendedor_rapido  numeric,
  p_premio_cupo_completo    numeric,
  p_premio_racha            numeric,
  p_premio_top_1            numeric,
  p_premio_top_2            numeric,
  p_premio_top_3            numeric,
  p_bonos_activos           boolean
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c config;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  select * into c from config where id = 1;

  -- El interruptor de bonos es una regla de arranque: una vez que el mes
  -- se mueve, cambiarla dejaría a unos vendedores cobrando y a otros no
  -- por el mismo logro.
  if p_bonos_activos is distinct from c.bonos_activos and _mes_iniciado() then
    raise exception 'bonos_bloqueados';
  end if;

  if p_precio_ticket <= 0 or p_comision_ticket < 0 or p_pago_meta < 0
     or p_meta_tickets < 1 or p_abono_minimo < 0 or p_abono_minimo >= p_precio_ticket
     or p_dia_limite_abonos < 1 or p_dia_limite_abonos > 28
     or p_dias_limite_apartado < 1 or p_cupo_default < 1
     or p_meta_colectiva < 1 or p_dias_vendedor_rapido < 1 or p_dias_vendedor_rapido > 28
     or p_premio_vendedor_rapido < 0 or p_premio_cupo_completo < 0 or p_premio_racha < 0
     or p_premio_top_1 < 0 or p_premio_top_2 < 0 or p_premio_top_3 < 0
  then
    raise exception 'valor_invalido';
  end if;
  if coalesce(trim(p_codigo_invitacion), '') = '' then
    raise exception 'codigo_invalido';
  end if;
  if jsonb_typeof(p_premios) is distinct from 'array' or jsonb_array_length(p_premios) = 0 then
    raise exception 'premios_invalidos';
  end if;

  update config set
    precio_ticket           = p_precio_ticket,
    comision_ticket         = p_comision_ticket,
    meta_tickets            = p_meta_tickets,
    pago_meta               = p_pago_meta,
    abono_minimo            = p_abono_minimo,
    dia_limite_abonos       = p_dia_limite_abonos,
    dias_limite_apartado    = p_dias_limite_apartado,
    cupo_default            = p_cupo_default,
    codigo_invitacion       = trim(p_codigo_invitacion),
    premios                 = p_premios,
    meta_colectiva          = p_meta_colectiva,
    dias_vendedor_rapido    = p_dias_vendedor_rapido,
    premio_vendedor_rapido  = p_premio_vendedor_rapido,
    premio_cupo_completo    = p_premio_cupo_completo,
    premio_racha            = p_premio_racha,
    premio_top_1            = p_premio_top_1,
    premio_top_2            = p_premio_top_2,
    premio_top_3            = p_premio_top_3,
    bonos_activos           = p_bonos_activos
  where id = 1;

  return json_build_object('ok', true);
end;
$$;

grant execute on function admin_actualizar_config(
  uuid, numeric, numeric, int, numeric, numeric, int, int, int, text, jsonb,
  int, int, numeric, numeric, numeric, numeric, numeric, numeric, boolean
) to anon, authenticated;


-- ---------- Las pantallas del vendedor necesitan saber si hay bonos ----------
create or replace function vendedor_progreso_colectivo(p_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c       config;
  v_total int;
begin
  perform _vendedor_activo(p_token);
  select * into c from config where id = 1;
  select coalesce(sum(tickets_activos), 0) into v_total from vendedores;
  return json_build_object(
    'activos',       v_total,
    'meta',          c.meta_colectiva,
    'alcanzada',     v_total >= c.meta_colectiva,
    -- Con los bonos apagados la meta colectiva no significa nada: la app
    -- la esconde en vez de prometer un dinero que no va a llegar.
    'bonos_activos', c.bonos_activos
  );
end;
$$;

grant execute on function vendedor_progreso_colectivo(uuid) to anon, authenticated;


create or replace function admin_progreso_colectivo(p_admin_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c       config;
  v_total int;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;
  select * into c from config where id = 1;
  select coalesce(sum(tickets_activos), 0) into v_total from vendedores;
  return json_build_object(
    'activos',       v_total,
    'meta',          c.meta_colectiva,
    'alcanzada',     v_total >= c.meta_colectiva,
    'bonos_activos', c.bonos_activos
  );
end;
$$;

grant execute on function admin_progreso_colectivo(uuid) to anon, authenticated;


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

  select coalesce(sum(monto), 0) into v_historico
  from pagos_comisiones where vendedor_id = v.id;

  return json_build_object(
    'nombre',               v.nombre,
    'cupo',                 v.cupo,
    'tickets_activos',      v.tickets_activos,
    'apartados',            v_apartados,
    'abonados',             v_abonados,
    'pendientes',           v_pendientes,
    'meta_tickets',         v_meta,
    'pago_meta',            c.pago_meta,
    'en_meta',              v_en_meta,
    'faltan',               v_meta - v_en_meta,
    'metas_cobradas',       v.metas_cobradas,
    'metas_disponibles',    v_disponibles,
    'comision_pagada',      v.comision_pagada,
    'total_historico',      v_historico,
    'dias_vendedor_rapido', c.dias_vendedor_rapido,
    'bonos_activos',        c.bonos_activos
  );
end;
$$;

grant execute on function vendedor_resumen_comisiones(uuid) to anon, authenticated;
