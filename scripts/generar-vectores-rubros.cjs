require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generarEmbeddingsRubros() {
  console.log("🚀 Iniciando vectorización de RUBROS...");

  // 1. Traer rubros sin vector
  const { data: rubros, error } = await supabase
    .from('rubros')
    .select('*')
    .is('embedding', null);

  if (error) return console.error("Error DB:", error);
  if (!rubros.length) return console.log("✅ Todos los rubros ya tienen vector.");

  // 2. Traer keywords para contexto
  const { data: keywords } = await supabase.from('palabras_clave').select('*');
  
  for (const r of rubros) {
    try {
      // Unimos el rubro con sus keywords para darle contexto al vector
      // Ej: Rubro "Ferretería" + Keywords "martillo clavo herramientas"
      const associatedKeywords = keywords
        .filter(k => k.rubro_asociado.toLowerCase() === r.nombre.toLowerCase())
        .map(k => k.keyword)
        .join(' ');

      const textoParaIA = `Rubro Comercial: ${r.nombre}. Conceptos relacionados: ${associatedKeywords}`;
      console.log(`✨ Procesando: ${r.nombre}`);

      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textoParaIA,
      });

      await supabase
        .from('rubros')
        .update({ embedding: response.data[0].embedding })
        .eq('id', r.id);

    } catch (err) {
      console.error(`❌ Falló ${r.nombre}:`, err.message);
    }
  }
  console.log("🎉 Rubros vectorizados.");
}

generarEmbeddingsRubros();