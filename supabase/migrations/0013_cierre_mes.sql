-- Fase 9 — Sorteo, cierre de mes, historial y el sistema de bonos con
-- meta colectiva acordado con el admin.
--
-- MODELO DE BONOS (reemplaza el catálogo simple de la Fase 8):
--   - "primera_meta" se elimina: no premia nada que no vaya a pasar solo,
--     ya que el vendedor persigue la comisión de $60/10 tickets de todos
--     modos. Las filas ya existentes en `logros` quedan como hecho
--     histórico, pero el motor deja de otorgar nuevas.
--   - vendedor_rapido, sesenta y racha_3 se siguen ganando en el momento
--     (Fase 8), pero el DINERO no se libera hasta que el talonario
--     completo llegue a `config.meta_colectiva` tickets activos. Si el
--     mes cierra sin alcanzar esa meta, lo ganado no se paga — es
--     deliberado: motiva a vender más, no solo a cada quien lo suyo.
--   - top_mes se parte en tres lugares (top_mes_1/2/3), resueltos al
--     cerrar el mes comparando a todos los vendedores. No dependen de la
--     meta colectiva: es una competencia aparte, siempre se paga a quien
--     quede en cada lugar (si existe ese lugar).
--
-- Todos los montos y la meta colectiva son editables por el admin desde
-- `config` — nunca quedan clavados en el código de esta migración salvo
-- los valores por defecto.


-- ---------- Parámetros nuevos ----------
alter table config
  add column if not exists meta_colectiva          int     not null default 700,
  add column if not exists dias_vendedor_rapido     int     not null default 8,
  add column if not exists premio_vendedor_rapido   numeric not null default 20,
  add column if not exists premio_cupo_completo     numeric not null default 40,
  add column if not exists premio_racha             numeric not null default 30,
  add column if not exists premio_top_1             numeric not null default 200,
  add column if not exists premio_top_2             numeric not null default 100,
  add column if not exists premio_top_3             numeric not null default 50,
  -- Se llena al registrar los números ganadores (Pantalla Sorteo) y se
  -- vacía al cerrar el mes; mientras esté vacía, cerrar el mes se niega.
  add column if not exists ganadores_registrados    jsonb;

alter table logros
  add column if not exists pagado boolean not null default false;

alter table pagos_comisiones
  drop constraint if exists pagos_comisiones_tipo_check;
alter table pagos_comisiones
  add constraint pagos_comisiones_tipo_check
  check (tipo in ('meta', 'liquidacion', 'abonoPerdido', 'logro'));


-- ---------- Motor de logros: ya sin primera_meta, día configurable ----------
create or replace function _verificar_logros(p_vendedor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v       vendedores;
  c       config;
  v_dia   int;
  v_mes_1 text;
  v_mes_2 text;
begin
  select * into v from vendedores where id = p_vendedor_id;
  select * into c from config where id = 1;
  v_dia := extract(day from (now() at time zone c.zona_horaria))::int;

  -- vendedor_rapido: 30 activos antes del día X (X editable, antes fijo en 8).
  if v.tickets_activos >= 30 and v_dia < c.dias_vendedor_rapido
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

  -- sesenta: cupo completo (el cupo es el de CADA vendedor).
  if v.tickets_activos >= v.cupo then
    insert into logros (vendedor_id, logro_id, mes)
    values (p_vendedor_id, 'sesenta', c.mes_actual)
    on conflict do nothing;

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


-- ---------- Libera el dinero de los bonos cuando se cruza la meta colectiva ----------
-- Se llama después de CADA confirmación. Es idempotente a propósito: paga
-- solo lo que siga marcado `pagado = false`, así que invocarla de más
-- nunca duplica un pago. Esto también resuelve el caso "alguien ganó el
-- bono antes de que el equipo llegara a la meta": se queda pendiente hasta
-- que esta función, en una confirmación posterior, note que ya se cruzó.
create or replace function _liberar_bonos_colectivos()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c       config;
  v_total int;
  fila    record;
  v_premio numeric;
  v_nombre text;
begin
  select * into c from config where id = 1;

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


-- ---------- Confirmar número: ahora también intenta liberar bonos ----------
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
    fecha_cobro_pautada    = null
  where numero = p_numero and pendiente_confirmacion
  returning * into n;

  if not found then
    raise exception 'estado_invalido';
  end if;

  update vendedores set tickets_activos = tickets_activos + 1
  where id = n.vendedor_id
  returning * into v;

  perform _verificar_logros(v.id);
  perform _liberar_bonos_colectivos();

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


-- El vendedor necesita el día de "vendedor rápido" para leer su propia
-- insignia (§11); config_publica no lo expone porque está pensada para el
-- comprador, así que se agrega aquí, al resumen que ya usa el vendedor.
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
    'dias_vendedor_rapido', c.dias_vendedor_rapido
  );
end;
$$;

grant execute on function vendedor_resumen_comisiones(uuid) to anon, authenticated;


-- ---------- Progreso de la meta colectiva ----------
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
  perform _vendedor_activo(p_token);  -- solo valida la sesión
  select * into c from config where id = 1;
  select coalesce(sum(tickets_activos), 0) into v_total from vendedores;
  return json_build_object(
    'activos', v_total, 'meta', c.meta_colectiva, 'alcanzada', v_total >= c.meta_colectiva
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
    'activos', v_total, 'meta', c.meta_colectiva, 'alcanzada', v_total >= c.meta_colectiva
  );
end;
$$;

grant execute on function admin_progreso_colectivo(uuid) to anon, authenticated;


-- ---------- Mis logros: ahora también informa si el bono ya se pagó ----------
-- Cambia la forma de la tabla devuelta (se agrega "pagado"): Postgres no
-- permite eso con CREATE OR REPLACE, hay que borrar primero.
drop function if exists vendedor_mis_logros(uuid);
create function vendedor_mis_logros(p_token uuid)
returns table (
  logro_id text,
  fecha    timestamptz,
  mes      text,
  visto    boolean,
  pagado   boolean
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
  select l.logro_id, l.fecha, l.mes, l.visto, l.pagado
  from logros l
  where l.vendedor_id = v.id
  order by l.fecha;
end;
$$;

grant execute on function vendedor_mis_logros(uuid) to anon, authenticated;


-- ---------- Ranking en vivo (vista previa antes de cerrar) ----------
create or replace function admin_ranking_vendedores(p_admin_token uuid)
returns table (
  vendedor_id     uuid,
  nombre          text,
  tickets_activos int,
  ultimo_activado timestamptz
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
    v.id, v.nombre, v.tickets_activos,
    (select max(n.fecha_activacion) from numeros n
     where n.vendedor_id = v.id and n.estado = 'activo')
  from vendedores v
  where v.tickets_activos > 0
  -- Empate lo rompe quien llegó primero a esa cifra.
  order by v.tickets_activos desc, 4 asc nulls last;
end;
$$;

grant execute on function admin_ranking_vendedores(uuid) to anon, authenticated;


-- ---------- Liquidación de comisiones pendientes (día del sorteo, §4.2) ----------
create or replace function admin_liquidacion_pendiente(p_admin_token uuid)
returns table (
  vendedor_id        uuid,
  nombre             text,
  whatsapp           text,
  tickets_pendientes int,
  monto              numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c        config;
  v_meta   int;
  v_inicio timestamptz;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;
  select * into c from config where id = 1;
  v_meta   := greatest(coalesce(c.meta_tickets, 10), 1);
  v_inicio := to_date(c.mes_actual || '-01', 'YYYY-MM-DD');

  return query
  select
    v.id, v.nombre, v.whatsapp,
    (v.tickets_activos - v.metas_cobradas * v_meta),
    (v.tickets_activos - v.metas_cobradas * v_meta) * c.comision_ticket
  from vendedores v
  where (v.tickets_activos - v.metas_cobradas * v_meta) > 0
    -- Si ya se le liquidó este ciclo, no debe seguir apareciendo como
    -- pendiente: admin_liquidar_comisiones ya se niega a pagarlo dos
    -- veces, pero esta vista previa tiene que reflejar lo mismo o el
    -- admin cree que el botón no funcionó.
    and not exists (
      select 1 from pagos_comisiones p
      where p.vendedor_id = v.id and p.tipo = 'liquidacion' and p.fecha >= v_inicio
    );
end;
$$;

grant execute on function admin_liquidacion_pendiente(uuid) to anon, authenticated;


-- Paga la liquidación de todos de una vez. Idempotente por mes: si ya se
-- liquidó a un vendedor este ciclo, no se le vuelve a pagar aunque se
-- toque el botón otra vez.
create or replace function admin_liquidar_comisiones(p_admin_token uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c          config;
  v_meta     int;
  v_inicio   timestamptz;
  fila       record;
  v_pagados  int := 0;
  v_total    numeric := 0;
  v_pend     int;
  v_monto    numeric;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;
  select * into c from config where id = 1;
  v_meta   := greatest(coalesce(c.meta_tickets, 10), 1);
  v_inicio := to_date(c.mes_actual || '-01', 'YYYY-MM-DD');

  for fila in select * from vendedores loop
    v_pend := fila.tickets_activos - fila.metas_cobradas * v_meta;
    if v_pend <= 0 then continue; end if;

    if exists (
      select 1 from pagos_comisiones
      where vendedor_id = fila.id and tipo = 'liquidacion' and fecha >= v_inicio
    ) then
      continue;  -- ya liquidado este ciclo
    end if;

    v_monto := v_pend * c.comision_ticket;
    insert into pagos_comisiones (vendedor_id, monto, tipo, detalle)
    values (fila.id, v_monto, 'liquidacion',
            format('Liquidación día del sorteo: %s tickets', v_pend));
    update vendedores set comision_pagada = comision_pagada + v_monto where id = fila.id;

    v_pagados := v_pagados + 1;
    v_total   := v_total + v_monto;
  end loop;

  return json_build_object('vendedores', v_pagados, 'total', v_total);
end;
$$;

grant execute on function admin_liquidar_comisiones(uuid) to anon, authenticated;


-- ---------- Pantalla Sorteo: registrar los 3 números ganadores ----------
-- Se puede volver a llamar para corregir un error de dedo antes de cerrar
-- el mes: cada llamada reemplaza el registro anterior.
create or replace function admin_registrar_ganadores(
  p_admin_token uuid,
  p_numeros     int[]
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c         config;
  v_numero  int;
  v_i       int := 0;
  v_fila    numeros;
  v_premio  jsonb;
  v_lista   jsonb := '[]'::jsonb;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  if array_length(p_numeros, 1) is distinct from 3 then
    raise exception 'numeros_invalidos';
  end if;
  if p_numeros[1] = p_numeros[2] or p_numeros[1] = p_numeros[3] or p_numeros[2] = p_numeros[3] then
    raise exception 'numeros_repetidos';
  end if;

  select * into c from config where id = 1;

  foreach v_numero in array p_numeros loop
    if v_numero < 1 or v_numero > 1000 then
      raise exception 'numero_invalido';
    end if;

    select * into v_fila from numeros where numero = v_numero;
    v_premio := coalesce(c.premios -> v_i, '{}'::jsonb);

    v_lista := v_lista || jsonb_build_object(
      'numero',           v_fila.numero,
      'es_banca',         v_fila.estado is distinct from 'activo',
      'cliente_nombre',   case when v_fila.estado = 'activo' then v_fila.cliente_nombre end,
      'cliente_whatsapp', case when v_fila.estado = 'activo' then v_fila.cliente_whatsapp end,
      'premio_nombre',    v_premio -> 'nombre',
      'premio_valor',     v_premio -> 'valor'
    );
    v_i := v_i + 1;
  end loop;

  update config set ganadores_registrados = v_lista where id = 1;

  return jsonb_build_object('ganadores', v_lista);
end;
$$;

grant execute on function admin_registrar_ganadores(uuid, int[]) to anon, authenticated;


-- Para que la pantalla pueda recargar sin perder lo ya registrado.
create or replace function admin_ganadores_registrados(p_admin_token uuid)
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
  return c.ganadores_registrados;
end;
$$;

grant execute on function admin_ganadores_registrados(uuid) to anon, authenticated;


-- ---------- Historial de meses cerrados ----------
create or replace function admin_historico(p_admin_token uuid)
returns setof historico
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;
  return query select * from historico order by mes desc;
end;
$$;

grant execute on function admin_historico(uuid) to anon, authenticated;


-- ---------- Cierre de mes (transacción crítica, §12.4) ----------
-- Requiere que ya se hayan registrado los ganadores del sorteo. Paga el
-- ranking del mes (top 3, sin depender de la meta colectiva — es una
-- competencia aparte), guarda el snapshot en `historico`, resetea los
-- 1,000 números y los contadores de todos los vendedores, y avanza
-- `mes_actual`. La doble confirmación vive en la pantalla, no aquí: esta
-- función ejecuta en cuanto se le llama.
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

  -- ---------- Ranking del mes: paga 1º/2º/3º, empate rompe quien llegó primero ----------
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
    v_premio := case v_puesto
      when 1 then c.premio_top_1
      when 2 then c.premio_top_2
      when 3 then c.premio_top_3
    end;

    insert into pagos_comisiones (vendedor_id, monto, tipo, detalle)
    values (fila.id, v_premio, 'logro',
            format('Top vendedor #%s del mes (%s tickets activos)', v_puesto, fila.tickets_activos));
    update vendedores set comision_pagada = comision_pagada + v_premio where id = fila.id;
    insert into logros (vendedor_id, logro_id, mes, pagado)
    values (fila.id, 'top_mes_' || v_puesto, c.mes_actual, true)
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

  -- El vendedor solo recibe la mitad del abono perdido; el total que
  -- "entró" a este concepto es el doble de esa mitad.
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
  -- Supabase exige WHERE en todo UPDATE/DELETE por seguridad (para evitar
  -- barridos accidentales sin filtro); "numero > 0" y "cupo > 0" son
  -- siempre verdaderos para toda la tabla, así que el reset sigue siendo
  -- total pero satisface la regla.
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


-- ---------- Resumen del mes (pantalla principal del admin, §8.1) ----------
create or replace function admin_resumen_mes(p_admin_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c              config;
  v_hoy          date;
  v_fin_mes      date;
  v_activos      int;
  v_vendedores   int;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  select * into c from config where id = 1;
  v_hoy     := (now() at time zone c.zona_horaria)::date;
  v_fin_mes := (date_trunc('month', v_hoy) + interval '1 month' - interval '1 day')::date;

  select count(*) into v_activos from numeros where estado = 'activo';
  select count(*) into v_vendedores from vendedores where estado = 'activo';

  return json_build_object(
    'mes_actual',          c.mes_actual,
    'tickets_activos',     v_activos,
    'total_vendido',       v_activos * c.precio_ticket,
    'numeros_banca',       1000 - v_activos,
    'dias_para_sorteo',    greatest(v_fin_mes - v_hoy, 0),
    'vendedores_activos',  v_vendedores,
    'comisiones_pagadas',  (
      select coalesce(sum(monto), 0) from pagos_comisiones
      where fecha >= to_date(c.mes_actual || '-01', 'YYYY-MM-DD')
    )
  );
end;
$$;

grant execute on function admin_resumen_mes(uuid) to anon, authenticated;


-- ---------- Configuración del admin ----------
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
    'premio_top_3',            c.premio_top_3
  );
end;
$$;

grant execute on function admin_config(uuid) to anon, authenticated;


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
  p_premio_top_3            numeric
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
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
    precio_ticket          = p_precio_ticket,
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
    premio_top_3            = p_premio_top_3
  where id = 1;

  return json_build_object('ok', true);
end;
$$;

grant execute on function admin_actualizar_config(
  uuid, numeric, numeric, int, numeric, numeric, int, int, int, text, jsonb,
  int, int, numeric, numeric, numeric, numeric, numeric, numeric
) to anon, authenticated;


create or replace function admin_cambiar_clave(
  p_admin_token  uuid,
  p_clave_actual text,
  p_clave_nueva  text
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

  if c.clave_admin_hash <> crypt(p_clave_actual, c.clave_admin_hash) then
    raise exception 'clave_actual_incorrecta';
  end if;
  if length(coalesce(p_clave_nueva, '')) < 6 then
    raise exception 'clave_corta';
  end if;

  update config set clave_admin_hash = crypt(p_clave_nueva, gen_salt('bf')) where id = 1;
  return json_build_object('ok', true);
end;
$$;

grant execute on function admin_cambiar_clave(uuid, text, text) to anon, authenticated;
