-- Habilita RLS y otorga acceso mínimo de lectura para el rol anon.
-- Las políticas definitivas por rol (admin/vendedor) se implementan en la Fase 2
-- (sección 7.3 del discovery: control de acceso y roles).

grant usage on schema public to anon, authenticated;

alter table config enable row level security;
alter table vendedores enable row level security;
alter table numeros enable row level security;
alter table pagos_comisiones enable row level security;
alter table logros enable row level security;
alter table historico enable row level security;

-- Placeholder temporal: lectura pública solo para verificar la conexión (Fase 0).
-- Se reemplaza por políticas reales de vendedor/admin en la Fase 2.
grant select on numeros, config to anon, authenticated;

create policy "fase0_lectura_temporal_numeros" on numeros
  for select using (true);

create policy "fase0_lectura_temporal_config" on config
  for select using (true);
