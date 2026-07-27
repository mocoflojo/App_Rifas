-- Fase 11 — El sorteo deja de ser "el mes calendario".
--
-- Hasta aquí toda la app deducía las fechas por aritmética de calendario a
-- partir de `config.mes_actual` (un texto 'YYYY-MM'): arrancaba el día 1,
-- cerraba el último día del mes, el corte de abonos era el día 25 DEL MES en
-- curso y "vendedor rápido" miraba el día del mes. Eso hacía imposible un
-- sorteo de mes y medio, uno que empiece un 15, o dejar un hueco entre uno y
-- el siguiente.
--
-- Ahora las tres fechas se GUARDAN, no se deducen:
--     fecha_inicio         cuándo abre el talonario
--     fecha_limite_abonos  último día para apartar/abonar (era "día 25")
--     fecha_sorteo         cuándo se juega
--
-- Y aparece algo que antes no existía: el estado "no hay sorteo activo".
-- `cierre_sorteo` ya NO arranca el siguiente solo — deja la app en reposo y
-- el admin programa el próximo cuando quiera, con las fechas que quiera.
--
-- Sigue habiendo UN solo sorteo vendiendo a la vez sobre las mismas 1.000
-- filas de `numeros`. Programar el siguiente por adelantado sí entra aquí;
-- venderlos en paralelo no, eso exigiría re-llavear la tabla entera.


-- ---------- 1. Parámetros nuevos ----------
alter table config
  -- La llave real de cada sorteo. Reemplaza al texto 'YYYY-MM', que no puede
  -- distinguir dos sorteos dentro del mismo mes.
  add column if not exists numero_sorteo       int  not null default 1,
  -- Nombre para mostrar ("Agosto 2026", "Especial Navidad"). Es solo texto:
  -- ninguna regla depende de él.
  add column if not exists etiqueta            text not null default '',
  add column if not exists fecha_inicio        date,
  add column if not exists fecha_sorteo        date,
  add column if not exists fecha_limite_abonos date,
  -- 'activo'   = hay un sorteo con fechas puestas (aunque todavía no abra).
  -- 'borrador' = no hay ninguno; el talonario está cerrado a cal y canto.
  add column if not exists estado_sorteo       text not null default 'activo';

alter table config drop constraint if exists config_estado_sorteo_check;
alter table config
  add constraint config_estado_sorteo_check
  check (estado_sorteo in ('activo', 'borrador'));


-- ---------- 2. Migrar la instalación existente sin cambiarle el comportamiento ----------
-- Hay un sorteo corriendo con dinero adentro. Se le calculan las fechas que
-- HOY tiene implícitas, para que después de esta migración se comporte
-- exactamente igual que antes: arrancó el día 1, corta el día 25 y se juega
-- el último día del mes.
update config set
  etiqueta            = coalesce(nullif(etiqueta, ''), mes_actual),
  fecha_inicio        = coalesce(fecha_inicio, to_date(mes_actual || '-01', 'YYYY-MM-DD')),
  fecha_limite_abonos = coalesce(
                          fecha_limite_abonos,
                          to_date(mes_actual || '-01', 'YYYY-MM-DD') + (dia_limite_abonos - 1)),
  fecha_sorteo        = coalesce(
                          fecha_sorteo,
                          (to_date(mes_actual || '-01', 'YYYY-MM-DD')
                           + interval '1 month' - interval '1 day')::date)
where id = 1;


-- ---------- 3. Los logros se encadenan por número de sorteo, no por mes ----------
-- La racha comparaba 'YYYY-MM' menos uno y menos dos meses. Con períodos
-- irregulares eso se rompe: dos sorteos seguidos pueden caer en el mismo mes,
-- o saltarse uno. Encadenar por número de sorteo es lo que la racha siempre
-- quiso decir — tres sorteos seguidos, midan lo que midan.
alter table logros add column if not exists sorteo int;

-- Todo lo que existe pertenece al sorteo en curso: no hay ninguno cerrado
-- todavía (`historico` se numera aparte, más abajo).
update logros set sorteo = (select numero_sorteo from config where id = 1)
where sorteo is null;

alter table logros alter column sorteo set not null;

-- La llave vieja va primero: mientras `mes` forme parte de ella, Postgres no
-- deja quitarle el NOT NULL.
alter table logros drop constraint if exists logros_pkey;
alter table logros add primary key (vendedor_id, logro_id, sorteo);

-- `mes` queda como etiqueta histórica: ya no manda sobre ninguna regla.
alter table logros alter column mes drop not null;


-- ---------- 4. El histórico se llavea por sorteo ----------
-- Con la llave vieja (el mes), dos sorteos dentro de julio se pisaban.
alter table historico
  add column if not exists sorteo       int,
  add column if not exists etiqueta     text,
  add column if not exists fecha_inicio date,
  add column if not exists fecha_sorteo date;

with orden as (
  select h.mes, row_number() over (order by h.mes) as n from historico h
)
update historico h set
  sorteo   = orden.n,
  etiqueta = coalesce(h.etiqueta, h.mes)
from orden
where h.mes = orden.mes and h.sorteo is null;

alter table historico drop constraint if exists historico_pkey;
alter table historico alter column sorteo set not null;
alter table historico add primary key (sorteo);

-- El sorteo en curso tiene que quedar después de todo lo archivado, o el
-- próximo cierre chocaría contra una llave ya usada.
update config set numero_sorteo = greatest(
  numero_sorteo,
  coalesce((select max(sorteo) from historico), 0) + 1
) where id = 1;


-- ---------- 5. Cada pago sabe a qué sorteo pertenece ----------
-- Hasta ahora "los pagos de este ciclo" se resolvía por fecha: todo lo que
-- fuera posterior al día 1 del mes. Con el calendario mandando eso alcanzaba,
-- porque el mes siempre avanzaba hacia adelante.
--
-- Con fechas libres se rompe: si el admin programa un sorteo que arrancó el
-- lunes pasado (algo perfectamente normal — lo registra después de haber
-- empezado a vender), ese sorteo se traga los pagos del anterior, que son más
-- recientes que su propia fecha de inicio. La liquidación creería que ya se
-- pagó, y cancelar se negaría por ventas que no son suyas.
--
-- La solución es la misma que en los logros: la llave real es el número de
-- sorteo, no la fecha.
alter table pagos_comisiones add column if not exists sorteo int;

create or replace function _sellar_sorteo_en_pago()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.sorteo is null then
    select numero_sorteo into new.sorteo from config where id = 1;
  end if;
  return new;
end;
$$;

-- Va por trigger y no en cada INSERT a propósito: hay seis lugares distintos
-- que insertan pagos, y olvidarse en uno solo dejaría un pago huérfano que
-- ninguna liquidación volvería a ver.
drop trigger if exists sellar_sorteo_en_pago on pagos_comisiones;
create trigger sellar_sorteo_en_pago
  before insert on pagos_comisiones
  for each row execute function _sellar_sorteo_en_pago();

revoke execute on function _sellar_sorteo_en_pago() from public, anon, authenticated;

update pagos_comisiones set sorteo = (select numero_sorteo from config where id = 1)
where sorteo is null;


-- ---------- 6. En qué momento del sorteo estamos ----------
-- Una sola fuente de verdad para las cinco fases. Todo lo que antes
-- preguntaba "¿qué día del mes es?" ahora pregunta esto.
--
--   sin_sorteo  no hay ninguno programado; nadie puede tomar números
--   programado  hay fechas, pero todavía no abre
--   venta       operación normal: apartar, abonar y pagar
--   solo_pago   pasó el límite de abonos; hasta el sorteo solo se paga completo
--   cerrando    ya se jugó; no se toman más números, falta cerrar
create or replace function _fase_sorteo()
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c     config;
  v_hoy date;
begin
  select * into c from config where config.id = 1;

  if c.estado_sorteo <> 'activo'
     or c.fecha_inicio is null
     or c.fecha_sorteo is null
     or c.fecha_limite_abonos is null
  then
    return 'sin_sorteo';
  end if;

  v_hoy := (now() at time zone c.zona_horaria)::date;

  if v_hoy <  c.fecha_inicio        then return 'programado'; end if;
  if v_hoy <= c.fecha_limite_abonos then return 'venta';      end if;
  if v_hoy <= c.fecha_sorteo        then return 'solo_pago';  end if;
  return 'cerrando';
end;
$$;

revoke execute on function _fase_sorteo() from public, anon, authenticated;


-- ---------- 6. El talonario público ----------
create or replace function config_publica()
returns json
language sql
stable
security definer
set search_path = public, extensions
as $$
  select json_build_object(
    'etiqueta',            etiqueta,
    'numero_sorteo',       numero_sorteo,
    'fecha_inicio',        fecha_inicio,
    'fecha_sorteo',        fecha_sorteo,
    'fecha_limite_abonos', fecha_limite_abonos,
    'fase',                _fase_sorteo(),
    'precio_ticket',       precio_ticket,
    'abono_minimo',        abono_minimo,
    'dias_limite_apartado', dias_limite_apartado,
    'premios',             premios
  )
  from config where id = 1;
$$;

grant execute on function config_publica() to anon, authenticated;


-- ---------- 7. Tomar un número: el permiso lo da la fase, no el día del mes ----------
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
  v_fase      text;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;

  if p_accion not in ('apartar', 'abonar', 'pagado') then
    raise exception 'accion_invalida';
  end if;
  if coalesce(trim(p_cliente_nombre), '') = '' then
    raise exception 'cliente_requerido';
  end if;

  v_fase := _fase_sorteo();
  if v_fase = 'sin_sorteo' then raise exception 'sin_sorteo_activo'; end if;
  if v_fase = 'programado' then raise exception 'sorteo_no_empezado'; end if;
  -- Pasada la fecha del sorteo ya no se vende: el número no puede participar
  -- en algo que ya se jugó.
  if v_fase = 'cerrando'   then raise exception 'sorteo_terminado'; end if;
  if v_fase = 'solo_pago' and p_accion <> 'pagado' then
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

grant execute on function vendedor_tomar_numero(uuid, int, text, text, text, numeric)
  to anon, authenticated;


-- Abonar sobre un número ya tomado. Hasta ahora esta función no miraba la
-- fecha en absoluto: se podía dejar un abono a medias el día 26, y el barrido
-- lo liberaba ese mismo día quitándole al cliente la mitad del dinero. Con la
-- fecha explícita eso queda tapado — pasado el límite, o se completa el pago
-- o no se toca.
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
  v_fase      text;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;

  if p_monto is null or p_monto <= 0 then raise exception 'monto_invalido'; end if;

  v_fase := _fase_sorteo();
  if v_fase in ('sin_sorteo', 'programado') then raise exception 'sin_sorteo_activo'; end if;
  if v_fase = 'cerrando' then raise exception 'sorteo_terminado'; end if;

  select * into n from numeros where numero = p_numero;
  if n.vendedor_id is distinct from v.id then raise exception 'no_es_tuyo'; end if;
  if n.pendiente_confirmacion then raise exception 'ya_enviado'; end if;
  if n.estado not in ('apartado', 'abonado') then raise exception 'estado_invalido'; end if;

  v_total := n.monto_abonado + p_monto;
  if v_total > c.precio_ticket then raise exception 'monto_excede'; end if;
  if v_total < c.abono_minimo then raise exception 'abono_insuficiente'; end if;

  if v_fase = 'solo_pago' and v_total < c.precio_ticket then
    raise exception 'solo_pago_completo';
  end if;

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

grant execute on function vendedor_abonar(uuid, int, numeric) to anon, authenticated;


-- ---------- 8. Barrido de vencimientos ----------
create or replace function aplicar_vencimientos()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c              config;
  v_hoy          date;
  v_apartados    int := 0;
  v_abonos       int := 0;
  v_repartido    numeric := 0;
  n              record;
  v_mitad        numeric;
begin
  if not pg_try_advisory_xact_lock(778811) then
    return json_build_object('omitido', true);
  end if;

  select * into c from config where id = 1;

  -- Sin sorteo activo el talonario está vacío o congelado: no hay plazos que
  -- correr, y dejar el barrido suelto liberaría números de un sorteo que
  -- todavía no abrió.
  if _fase_sorteo() in ('sin_sorteo', 'programado') then
    return json_build_object('omitido', true);
  end if;

  v_hoy := (now() at time zone c.zona_horaria)::date;

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

  -- 2. Abonos incompletos pasada la fecha límite. Antes de ese día el cliente
  --    todavía está en plazo.
  if v_hoy > c.fecha_limite_abonos then
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

grant execute on function aplicar_vencimientos() to anon, authenticated;


-- ---------- 9. Listados con plazos: el corte es una fecha guardada ----------
drop function if exists admin_vencimientos(uuid);
create function admin_vencimientos(p_admin_token uuid)
returns table (
  tipo              text,
  numero            int,
  cliente_nombre    text,
  cliente_whatsapp  text,
  monto_abonado     numeric,
  falta             numeric,
  dias_transcurridos int,
  dias_restantes    int,
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
  v_hoy   := (now() at time zone c.zona_horaria)::date;
  v_corte := coalesce(c.fecha_limite_abonos, v_hoy);

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
  order by n.apartado_extendido, 8, n.numero;
end;
$$;

grant execute on function admin_vencimientos(uuid) to anon, authenticated;


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
  v_corte := coalesce(c.fecha_limite_abonos, v_hoy);

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


-- ---------- 10. Alertas ----------
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
  v_corte := coalesce(c.fecha_limite_abonos, v_hoy);

  select
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
    'fase',                _fase_sorteo(),
    'etiqueta',            c.etiqueta,
    'fecha_inicio',        c.fecha_inicio,
    'fecha_limite_abonos', c.fecha_limite_abonos,
    'fecha_sorteo',        c.fecha_sorteo,
    'dias_para_corte',     v_corte - v_hoy,
    'abono_minimo',        c.abono_minimo,
    'precio_ticket',       c.precio_ticket
  );
end;
$$;

grant execute on function vendedor_alertas(uuid) to anon, authenticated;


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
  v_corte := coalesce(c.fecha_limite_abonos, v_hoy);
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
    'solicitudes',     v_solicit,
    'fase',            _fase_sorteo()
  );
end;
$$;

grant execute on function admin_alertas(uuid) to anon, authenticated;


-- ---------- 11. Motor de logros ----------
-- "Vendedor rápido" medía el día del mes: en un sorteo que arranca un 15 eso
-- no significaba nada. Ahora mide días desde el arranque real, que es lo que
-- la insignia siempre quiso premiar.
create or replace function _verificar_logros(p_vendedor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v      vendedores;
  c      config;
  v_dias int;
begin
  select * into v from vendedores where id = p_vendedor_id;
  select * into c from config where id = 1;

  if c.fecha_inicio is null then return; end if;

  -- Día 0 = el de arranque, así que "< 8" son los primeros 8 días completos.
  v_dias := (now() at time zone c.zona_horaria)::date - c.fecha_inicio;

  if v.tickets_activos >= 30 and v_dias < c.dias_vendedor_rapido
     and not exists (
       select 1 from logros
       where vendedor_id = p_vendedor_id and logro_id = 'vendedor_rapido'
         and sorteo = c.numero_sorteo
     )
  then
    insert into logros (vendedor_id, logro_id, sorteo, mes)
    values (p_vendedor_id, 'vendedor_rapido', c.numero_sorteo, c.etiqueta)
    on conflict do nothing;
  end if;

  -- sesenta: cupo completo (el cupo es el de CADA vendedor).
  if v.tickets_activos >= v.cupo then
    insert into logros (vendedor_id, logro_id, sorteo, mes)
    values (p_vendedor_id, 'sesenta', c.numero_sorteo, c.etiqueta)
    on conflict do nothing;

    -- Tres sorteos consecutivos, midan lo que midan.
    if exists (select 1 from logros
               where vendedor_id = p_vendedor_id and logro_id = 'sesenta'
                 and sorteo = c.numero_sorteo - 1)
       and exists (select 1 from logros
                   where vendedor_id = p_vendedor_id and logro_id = 'sesenta'
                     and sorteo = c.numero_sorteo - 2)
    then
      insert into logros (vendedor_id, logro_id, sorteo, mes)
      values (p_vendedor_id, 'racha_3', c.numero_sorteo, c.etiqueta)
      on conflict do nothing;
    end if;
  end if;
end;
$$;

revoke execute on function _verificar_logros(uuid) from public, anon, authenticated;


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

  if not c.bonos_activos then
    return;
  end if;

  select coalesce(sum(tickets_activos), 0) into v_total from vendedores;
  if v_total < c.meta_colectiva then
    return;
  end if;

  for fila in
    select l.vendedor_id, l.logro_id, l.sorteo
    from logros l
    where l.sorteo = c.numero_sorteo
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
    where vendedor_id = fila.vendedor_id and logro_id = fila.logro_id and sorteo = fila.sorteo;
  end loop;
end;
$$;

revoke execute on function _liberar_bonos_colectivos() from public, anon, authenticated;


-- Sorteos consecutivos con cupo completo, contando hacia atrás desde el
-- actual. Reemplaza el paseo por meses del calendario.
create or replace function vendedor_racha_actual(p_token uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v        vendedores;
  c        config;
  v_sorteo int;
  v_racha  int := 0;
begin
  v := _vendedor_activo(p_token);
  select * into c from config where id = 1;
  v_sorteo := c.numero_sorteo;

  loop
    exit when v_sorteo < 1;
    exit when not exists (
      select 1 from logros
      where vendedor_id = v.id and logro_id = 'sesenta' and sorteo = v_sorteo
    );
    v_racha  := v_racha + 1;
    v_sorteo := v_sorteo - 1;
  end loop;

  return v_racha;
end;
$$;

grant execute on function vendedor_racha_actual(uuid) to anon, authenticated;


drop function if exists vendedor_mis_logros(uuid);
create function vendedor_mis_logros(p_token uuid)
returns table (
  logro_id text,
  fecha    timestamptz,
  mes      text,
  sorteo   int,
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
  select l.logro_id, l.fecha, l.mes, l.sorteo, l.visto, l.pagado
  from logros l
  where l.vendedor_id = v.id
  order by l.fecha;
end;
$$;

grant execute on function vendedor_mis_logros(uuid) to anon, authenticated;


-- ---------- 12. Liquidación: el ciclo empieza en fecha_inicio ----------
drop function if exists admin_liquidacion_pendiente(uuid);
create function admin_liquidacion_pendiente(p_admin_token uuid)
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
  c      config;
  v_meta int;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;
  select * into c from config where config.id = 1;
  v_meta := greatest(coalesce(c.meta_tickets, 10), 1);

  return query
  select
    v.id, v.nombre, v.whatsapp,
    (v.tickets_activos - v.metas_cobradas * v_meta),
    (v.tickets_activos - v.metas_cobradas * v_meta) * c.comision_ticket
  from vendedores v
  where (v.tickets_activos - v.metas_cobradas * v_meta) > 0
    -- Si ya se le liquidó en ESTE sorteo no debe seguir apareciendo como
    -- pendiente: admin_liquidar_comisiones ya se niega a pagarlo dos veces,
    -- pero esta vista previa tiene que reflejar lo mismo o el admin cree que
    -- el botón no funcionó.
    and not exists (
      select 1 from pagos_comisiones p
      where p.vendedor_id = v.id and p.tipo = 'liquidacion'
        and p.sorteo = c.numero_sorteo
    );
end;
$$;

grant execute on function admin_liquidacion_pendiente(uuid) to anon, authenticated;


create or replace function admin_liquidar_comisiones(p_admin_token uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c          config;
  v_meta     int;
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
  v_meta := greatest(coalesce(c.meta_tickets, 10), 1);

  for fila in select * from vendedores loop
    v_pend := fila.tickets_activos - fila.metas_cobradas * v_meta;
    if v_pend <= 0 then continue; end if;

    if exists (
      select 1 from pagos_comisiones
      where vendedor_id = fila.id and tipo = 'liquidacion'
        and sorteo = c.numero_sorteo
    ) then
      continue;  -- ya liquidado en este sorteo
    end if;

    v_monto := v_pend * c.comision_ticket;
    insert into pagos_comisiones (vendedor_id, monto, tipo, detalle)
    values (fila.id, v_monto, 'liquidacion',
            format('Liquidación del sorteo: %s tickets', v_pend));
    update vendedores set comision_pagada = comision_pagada + v_monto where id = fila.id;

    v_pagados := v_pagados + 1;
    v_total   := v_total + v_monto;
  end loop;

  return json_build_object('vendedores', v_pagados, 'total', v_total);
end;
$$;

grant execute on function admin_liquidar_comisiones(uuid) to anon, authenticated;


-- ---------- 13. Cierre del sorteo ----------
-- Cambia de nombre (era cierre_mes) porque ya no cierra un mes, y cambia de
-- comportamiento en un punto clave: NO arranca el siguiente. Deja la app en
-- reposo — talonario cerrado, contadores en cero — y es el admin quien
-- programa el próximo con las fechas que quiera.
drop function if exists cierre_mes(uuid);

create or replace function cierre_sorteo(p_admin_token uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c                    config;
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
  if c.estado_sorteo <> 'activo' then
    raise exception 'sin_sorteo_activo';
  end if;
  if c.ganadores_registrados is null then
    raise exception 'sorteo_no_registrado';
  end if;

  -- ---------- Ranking: paga 1º/2º/3º, empate lo rompe quien llegó primero ----------
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
              format('Top vendedor #%s del sorteo (%s tickets activos)', v_puesto, fila.tickets_activos));
      update vendedores set comision_pagada = comision_pagada + v_premio where id = fila.id;
    end if;

    insert into logros (vendedor_id, logro_id, sorteo, mes, pagado)
    values (fila.id, 'top_mes_' || v_puesto, c.numero_sorteo, c.etiqueta, c.bonos_activos)
    on conflict do nothing;

    if v_puesto = 1 then
      v_top_vendedor := jsonb_build_object('nombre', fila.nombre, 'tickets_activos', fila.tickets_activos);
    end if;
  end loop;

  -- ---------- Snapshot para el historial ----------
  select count(*) into v_tickets_vendidos from numeros where estado = 'activo';
  v_ingresos := v_tickets_vendidos * c.precio_ticket;

  select coalesce(sum(monto), 0) into v_comisiones_pagadas
  from pagos_comisiones where sorteo = c.numero_sorteo;

  -- El vendedor solo recibe la mitad del abono perdido; el total que "entró"
  -- a este concepto es el doble de esa mitad.
  select coalesce(sum(monto), 0) * 2 into v_abonos_perdidos
  from pagos_comisiones where tipo = 'abonoPerdido' and sorteo = c.numero_sorteo;

  select count(*) into v_numeros_banca from numeros where estado <> 'activo';

  select count(*) into v_motos_banca
  from jsonb_array_elements(c.ganadores_registrados) g
  where (g ->> 'es_banca')::boolean;

  select count(*) into v_vendedores_activos from vendedores where estado = 'activo';

  insert into historico (
    sorteo, mes, etiqueta, fecha_inicio, fecha_sorteo,
    tickets_vendidos, ingresos, comisiones_pagadas, abonos_perdidos,
    numeros_banca, motos_ganadas_banca, ganadores, top_vendedor, vendedores_activos
  ) values (
    c.numero_sorteo, c.etiqueta, c.etiqueta, c.fecha_inicio, c.fecha_sorteo,
    v_tickets_vendidos, v_ingresos, v_comisiones_pagadas, v_abonos_perdidos,
    v_numeros_banca, v_motos_banca, c.ganadores_registrados, v_top_vendedor, v_vendedores_activos
  );

  -- ---------- Reset del talonario y los contadores ----------
  -- Supabase exige WHERE en todo UPDATE/DELETE para el rol anon; "numero > 0"
  -- y "cupo > 0" son siempre verdaderos, así que el reset sigue siendo total
  -- pero satisface la regla. Un arnés de pruebas que corra como superusuario
  -- NO detecta esto: allí la restricción no aplica.
  update numeros set
    estado = 'libre', vendedor_id = null, cliente_nombre = null, cliente_whatsapp = null,
    monto_abonado = 0, fecha_apartado = null, fecha_ultimo_abono = null, fecha_activacion = null,
    fecha_cobro_pautada = null, apartado_extendido = false, pendiente_confirmacion = false,
    estado_previo = null, monto_previo = null, nota_rechazo = null
  where numero > 0;

  update vendedores set tickets_activos = 0, metas_cobradas = 0, comision_pagada = 0
  where cupo > 0;

  -- Reposo: sin fechas y sin sorteo. El próximo lo programa el admin.
  update config set
    ganadores_registrados = null,
    estado_sorteo         = 'borrador',
    numero_sorteo         = c.numero_sorteo + 1,
    etiqueta              = '',
    fecha_inicio          = null,
    fecha_sorteo          = null,
    fecha_limite_abonos   = null
  where id = 1;

  return json_build_object(
    'sorteo_cerrado',      c.numero_sorteo,
    'etiqueta',            c.etiqueta,
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

grant execute on function cierre_sorteo(uuid) to anon, authenticated;


-- ---------- 14. Programar el próximo sorteo ----------
-- Sirve para crear uno nuevo (estando en reposo) y para corregir las fechas
-- de uno en marcha. Las reglas de qué se puede tocar dependen de si ya se
-- vendió algo:
--
--   Sin ventas   todo editable, incluida la fecha de arranque.
--   Con ventas   el arranque queda congelado (moverlo reescribiría quién ganó
--                "vendedor rápido") y las otras dos solo pueden ir hacia
--                ADELANTE: atrasarlas vencería abonos que hoy están en plazo.
create or replace function admin_programar_sorteo(
  p_admin_token         uuid,
  p_etiqueta            text,
  p_fecha_inicio        date,
  p_fecha_limite_abonos date,
  p_fecha_sorteo        date
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c        config;
  v_activo boolean;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  select * into c from config where id = 1;

  if p_fecha_inicio is null or p_fecha_limite_abonos is null or p_fecha_sorteo is null then
    raise exception 'fechas_incompletas';
  end if;
  if coalesce(trim(p_etiqueta), '') = '' then
    raise exception 'etiqueta_requerida';
  end if;
  -- El límite de abonos puede caer el mismo día del sorteo, pero nunca después.
  if p_fecha_limite_abonos < p_fecha_inicio then
    raise exception 'limite_antes_del_inicio';
  end if;
  if p_fecha_sorteo < p_fecha_limite_abonos then
    raise exception 'sorteo_antes_del_limite';
  end if;

  v_activo := (c.estado_sorteo = 'activo');

  if v_activo and _mes_iniciado() then
    if p_fecha_inicio is distinct from c.fecha_inicio then
      raise exception 'inicio_bloqueado';
    end if;
    if p_fecha_limite_abonos < c.fecha_limite_abonos then
      raise exception 'limite_no_puede_retroceder';
    end if;
    if p_fecha_sorteo < c.fecha_sorteo then
      raise exception 'sorteo_no_puede_retroceder';
    end if;
  end if;

  update config set
    etiqueta            = trim(p_etiqueta),
    fecha_inicio        = p_fecha_inicio,
    fecha_limite_abonos = p_fecha_limite_abonos,
    fecha_sorteo        = p_fecha_sorteo,
    estado_sorteo       = 'activo'
  where id = 1;

  return json_build_object(
    'numero_sorteo',       c.numero_sorteo,
    'etiqueta',            trim(p_etiqueta),
    'fecha_inicio',        p_fecha_inicio,
    'fecha_limite_abonos', p_fecha_limite_abonos,
    'fecha_sorteo',        p_fecha_sorteo,
    'fase',                _fase_sorteo()
  );
end;
$$;

grant execute on function admin_programar_sorteo(uuid, text, date, date, date)
  to anon, authenticated;


-- ---------- 15. Cancelar un sorteo ----------
-- Solo mientras no haya nada en juego. Cancelar con dinero adentro no es un
-- botón: obliga a decidir si se devuelven los abonos completos, si se
-- descuentan las comisiones ya pagadas y a generar la lista de a quién
-- devolverle cuánto. Esa política todavía no está definida, y hacerlo a
-- medias sería peor que no tenerlo: la app se niega y explica por qué.
create or replace function admin_cancelar_sorteo(p_admin_token uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c        config;
  v_pagos  int;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  select * into c from config where id = 1;
  if c.estado_sorteo <> 'activo' then
    raise exception 'sin_sorteo_activo';
  end if;

  if _mes_iniciado() then
    raise exception 'sorteo_con_ventas';
  end if;

  -- Un número pudo tomarse y liberarse después, dejando _mes_iniciado() en
  -- falso pero con dinero ya movido. La segunda comprobación cierra ese hueco.
  -- Se acota por número de sorteo, no por fecha: un sorteo con arranque
  -- retroactivo tiene fecha_inicio anterior al cierre del anterior, y por
  -- fecha se estaría contando plata ajena.
  select count(*) into v_pagos from pagos_comisiones
  where sorteo = c.numero_sorteo;
  if v_pagos > 0 then
    raise exception 'sorteo_con_ventas';
  end if;

  update config set
    estado_sorteo         = 'borrador',
    etiqueta              = '',
    fecha_inicio          = null,
    fecha_sorteo          = null,
    fecha_limite_abonos   = null,
    ganadores_registrados = null
  where id = 1;

  return json_build_object('cancelado', c.numero_sorteo, 'etiqueta', c.etiqueta);
end;
$$;

grant execute on function admin_cancelar_sorteo(uuid) to anon, authenticated;


-- ---------- 16. Estado del sorteo para las pantallas ----------
create or replace function admin_estado_sorteo(p_admin_token uuid)
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
    'numero_sorteo',       c.numero_sorteo,
    'etiqueta',            c.etiqueta,
    'estado',              c.estado_sorteo,
    'fase',                _fase_sorteo(),
    'fecha_inicio',        c.fecha_inicio,
    'fecha_limite_abonos', c.fecha_limite_abonos,
    'fecha_sorteo',        c.fecha_sorteo,
    -- Con ventas hechas, el arranque se congela y las otras fechas solo
    -- pueden estirarse. La pantalla necesita saberlo para bloquear campos.
    'con_ventas',          _mes_iniciado(),
    'ganadores_registrados', c.ganadores_registrados is not null
  );
end;
$$;

grant execute on function admin_estado_sorteo(uuid) to anon, authenticated;


-- ---------- 17. Resumen del admin ----------
create or replace function admin_resumen_mes(p_admin_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c            config;
  v_hoy        date;
  v_activos    int;
  v_vendedores int;
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  select * into c from config where id = 1;
  v_hoy := (now() at time zone c.zona_horaria)::date;

  select count(*) into v_activos from numeros where estado = 'activo';
  select count(*) into v_vendedores from vendedores where estado = 'activo';

  return json_build_object(
    'numero_sorteo',       c.numero_sorteo,
    'etiqueta',            c.etiqueta,
    'fase',                _fase_sorteo(),
    'fecha_inicio',        c.fecha_inicio,
    'fecha_limite_abonos', c.fecha_limite_abonos,
    'fecha_sorteo',        c.fecha_sorteo,
    'tickets_activos',     v_activos,
    'total_vendido',       v_activos * c.precio_ticket,
    'numeros_banca',       1000 - v_activos,
    'dias_para_sorteo',    case when c.fecha_sorteo is null then null
                                else greatest(c.fecha_sorteo - v_hoy, 0) end,
    'dias_para_corte',     case when c.fecha_limite_abonos is null then null
                                else c.fecha_limite_abonos - v_hoy end,
    'vendedores_activos',  v_vendedores,
    'comisiones_pagadas',  (
      select coalesce(sum(monto), 0) from pagos_comisiones
      where sorteo = c.numero_sorteo
    )
  );
end;
$$;

grant execute on function admin_resumen_mes(uuid) to anon, authenticated;


-- ---------- 18. Historial ----------
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
  return query select * from historico order by sorteo desc;
end;
$$;

grant execute on function admin_historico(uuid) to anon, authenticated;


-- ---------- 19. Configuración: el día 25 sale de aquí ----------
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
    'numero_sorteo',           c.numero_sorteo,
    'etiqueta',                c.etiqueta,
    'estado_sorteo',           c.estado_sorteo,
    'fase',                    _fase_sorteo(),
    'fecha_inicio',            c.fecha_inicio,
    'fecha_limite_abonos',     c.fecha_limite_abonos,
    'fecha_sorteo',            c.fecha_sorteo,
    'precio_ticket',           c.precio_ticket,
    'comision_ticket',         c.comision_ticket,
    'meta_tickets',            c.meta_tickets,
    'pago_meta',               c.pago_meta,
    'abono_minimo',            c.abono_minimo,
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
    'mes_iniciado',            _mes_iniciado()
  );
end;
$$;

grant execute on function admin_config(uuid) to anon, authenticated;


-- Firma nueva: se va p_dia_limite_abonos (ahora es una fecha, y se edita
-- desde admin_programar_sorteo junto a las otras dos).
drop function if exists admin_actualizar_config(
  uuid, numeric, numeric, int, numeric, numeric, int, int, int, text, jsonb,
  int, int, numeric, numeric, numeric, numeric, numeric, numeric, boolean
);

create or replace function admin_actualizar_config(
  p_admin_token             uuid,
  p_precio_ticket           numeric,
  p_comision_ticket         numeric,
  p_meta_tickets            int,
  p_pago_meta               numeric,
  p_abono_minimo            numeric,
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

  if p_bonos_activos is distinct from c.bonos_activos and _mes_iniciado() then
    raise exception 'bonos_bloqueados';
  end if;

  -- El tope de "vendedor rápido" sube de 28 a 90: ya no es un día del mes,
  -- son días desde el arranque, y un sorteo puede durar más de un mes.
  if p_precio_ticket <= 0 or p_comision_ticket < 0 or p_pago_meta < 0
     or p_meta_tickets < 1 or p_abono_minimo < 0 or p_abono_minimo >= p_precio_ticket
     or p_dias_limite_apartado < 1 or p_cupo_default < 1
     or p_meta_colectiva < 1 or p_dias_vendedor_rapido < 1 or p_dias_vendedor_rapido > 90
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
  uuid, numeric, numeric, int, numeric, numeric, int, int, text, jsonb,
  int, int, numeric, numeric, numeric, numeric, numeric, numeric, boolean
) to anon, authenticated;


-- ---------- 20. Resumen del vendedor: necesita saber en qué fase está ----------
create or replace function vendedor_resumen_comisiones(p_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c             config;
  v             vendedores;
  v_meta        int;
  v_en_meta     int;
  v_disponibles int;
  v_apartados   int;
  v_abonados    int;
  v_pendientes  int;
  v_historico   numeric;
  v_hoy         date;
begin
  v := _vendedor_activo(p_token);

  select * into c from config where id = 1;
  v_meta := greatest(coalesce(c.meta_tickets, 10), 1);
  v_hoy  := (now() at time zone c.zona_horaria)::date;

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
    'bonos_activos',        c.bonos_activos,
    'fase',                 _fase_sorteo(),
    'etiqueta',             c.etiqueta,
    'fecha_inicio',         c.fecha_inicio,
    'fecha_limite_abonos',  c.fecha_limite_abonos,
    'fecha_sorteo',         c.fecha_sorteo,
    'dias_para_sorteo',     case when c.fecha_sorteo is null then null
                                 else greatest(c.fecha_sorteo - v_hoy, 0) end
  );
end;
$$;

grant execute on function vendedor_resumen_comisiones(uuid) to anon, authenticated;


-- ---------- 21. Se van las columnas que deducían fechas ----------
-- Ya no queda ninguna función leyéndolas. Dejarlas sería peor que borrarlas:
-- la próxima persona que toque esto no sabría cuál de las dos manda.
alter table config drop column if exists mes_actual;
alter table config drop column if exists dia_limite_abonos;
