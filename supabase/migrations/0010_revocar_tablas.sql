-- Endurecimiento: quitar de las tablas todo permiso directo para anon.
--
-- El proyecto en la nube se creó cuando Supabase todavía otorgaba por
-- defecto permisos completos sobre las tablas nuevas del esquema public a
-- los roles anon y authenticated. Las migraciones anteriores revocaron ese
-- acceso en config, vendedores y numeros, pero pagos_comisiones, logros e
-- historico quedaron con el permiso puesto: hoy no filtran nada porque
-- tienen RLS activo y ninguna política, pero eso deja la seguridad
-- colgando de una sola pieza. Se comprobó con curl contra producción:
-- GET /rest/v1/pagos_comisiones devolvía 200 con [] en vez de 401.
--
-- Toda la escritura de la app pasa por funciones SECURITY DEFINER, así que
-- ningún rol público necesita permisos de tabla. Se revoca todo salvo la
-- lectura por columnas del talonario (migración 0004), que sí se usa desde
-- el navegador y para los eventos de Realtime.

revoke all on pagos_comisiones from anon, authenticated;
revoke all on logros           from anon, authenticated;
revoke all on historico        from anon, authenticated;
revoke all on historial_numeros from anon, authenticated;
revoke all on config           from anon, authenticated;
revoke all on vendedores       from anon, authenticated;

-- numeros: se revoca la escritura pero se conserva la lectura de las
-- columnas públicas que definió la 0004 (sin datos del cliente).
revoke insert, update, delete, truncate on numeros from anon, authenticated;
grant select (numero, estado, vendedor_id, pendiente_confirmacion)
  on numeros to anon, authenticated;
