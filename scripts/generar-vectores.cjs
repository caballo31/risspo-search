// scripts/generar-vectores.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// --- CONFIGURACIÓN ---
// Asegúrate de tener estas variables en tu archivo .env
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
// ¡IMPORTANTE! Usa la SERVICE_ROLE_KEY para poder escribir en la DB sin restricciones de RLS
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error("❌ Faltan variables de entorno (.env). Revisa VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y OPENAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

async function generarEmbeddings() {
  console.log("🚀 Iniciando proceso de vectorización...");

  // 1. Buscamos negocios que NO tengan vector todavía (para no gastar plata de más)
  // Asumimos que la columna se llama 'embedding'
  const { data: negocios, error } = await supabase
    .from('negocios')
    .select('id, nombre, rubro, direccion, horarios, google_url')
    .is('embedding', null)
    .limit(500); // Procesamos de a 500 para no saturar

  if (error) {
    console.error("❌ Error leyendo Supabase:", error.message);
    return;
  }

  if (!negocios || negocios.length === 0) {
    console.log("✅ No hay negocios pendientes de procesar.");
    return;
  }

  console.log(`📦 Encontrados ${negocios.length} negocios sin vector.`);

  // 2. Procesamos cada negocio
  let procesados = 0;
  let errores = 0;

  for (const negocio of negocios) {
    try {
      // A. Crear el "Texto Rico" para el contexto semántico
      // Incluimos palabras clave implícitas como "tienda", "local", "comprar"
      const textoParaIA = `
        Negocio: ${negocio.nombre}
        Rubro: ${negocio.rubro}
        Dirección: ${negocio.direccion || ''}
        Horarios: ${JSON.stringify(negocio.horarios) || 'No especificado'}
        Contexto: Local comercial en Chajarí, Entre Ríos. Tienda de ${negocio.rubro}.
      `.replace(/\s+/g, ' ').trim();

      // B. Generar el Vector con OpenAI
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small", // Este modelo es barato y potente
        input: textoParaIA,
      });

      const vector = response.data[0].embedding;

      // C. Guardar en Supabase
      const { error: updateError } = await supabase
        .from('negocios')
        .update({ embedding: vector })
        .eq('id', negocio.id);

      if (updateError) throw updateError;

      procesados++;
      // Log de progreso cada 10 items
      if (procesados % 10 === 0) process.stdout.write(`.`); 

    } catch (err) {
      console.error(`\n⚠️ Error con negocio ID ${negocio.id} (${negocio.nombre}):`, err.message);
      errores++;
    }
  }

  console.log(`\n\n🎉 Proceso finalizado.`);
  console.log(`✅ Procesados correctamente: ${procesados}`);
  console.log(`❌ Errores: ${errores}`);
}

generarEmbeddings();