import { supabase } from "@/lib/supabase";

export default async function Diagnostico() {
  const { count: totalNumeros, error: errNumeros } = await supabase
    .from("numeros")
    .select("*", { count: "exact", head: true });

  const { data: config, error: errConfig } = await supabase
    .from("config")
    .select("mes_actual, codigo_invitacion")
    .single();

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Diagnóstico de conexión a Supabase</h1>
      {errNumeros || errConfig ? (
        <p style={{ color: "red" }}>
          Error conectando: {errNumeros?.message ?? errConfig?.message}
        </p>
      ) : (
        <ul>
          <li>Números en talonario: {totalNumeros}</li>
          <li>Mes actual (config): {config?.mes_actual}</li>
          <li>Código de invitación: {config?.codigo_invitacion}</li>
        </ul>
      )}
    </main>
  );
}
