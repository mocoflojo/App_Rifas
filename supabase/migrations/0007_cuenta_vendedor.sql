-- El vendedor puede cambiar su propia clave, y el admin puede borrar un
-- vendedor sin actividad (limpieza de duplicados o pruebas, sección 7).

create or replace function vendedor_cambiar_clave(
  p_token       uuid,
  p_clave_actual text,
  p_clave_nueva  text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v vendedores;
begin
  v := _vendedor_activo(p_token);

  if v.clave_hash <> crypt(p_clave_actual, v.clave_hash) then
    raise exception 'clave_actual_incorrecta';
  end if;
  if length(coalesce(p_clave_nueva, '')) < 6 then
    raise exception 'clave_corta';
  end if;

  update vendedores set clave_hash = crypt(p_clave_nueva, gen_salt('bf'))
  where id = v.id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function vendedor_cambiar_clave(uuid, text, text) to anon, authenticated;


-- Borra un vendedor sin dejar huérfanos: se niega si tiene números o pagos
-- registrados, para no perder historial por accidente.
create or replace function admin_eliminar_vendedor(
  p_admin_token uuid,
  p_vendedor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not admin_token_valido(p_admin_token) then
    raise exception 'no_autorizado';
  end if;

  if exists (select 1 from numeros where vendedor_id = p_vendedor_id) then
    raise exception 'vendedor_con_numeros';
  end if;
  if exists (select 1 from pagos_comisiones where vendedor_id = p_vendedor_id) then
    raise exception 'vendedor_con_historial';
  end if;

  delete from vendedores where id = p_vendedor_id;
end;
$$;

grant execute on function admin_eliminar_vendedor(uuid, uuid) to anon, authenticated;
