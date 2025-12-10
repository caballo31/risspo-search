require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generarEmbeddingsRubros() {
  console.log("🚀 Iniciando vectorización MEJORADA de RUBROS...");

  // 1. Traer rubros que necesitan vector (o todos si acabas de limpiar)
  const { data: rubros, error: errRubros } = await supabase
    .from('rubros')
    .select('id, nombre')
    .is('embedding', null);

  if (errRubros) return console.error("❌ Error DB Rubros:", errRubros.message);
  if (!rubros || rubros.length === 0) return console.log("✅ Todos los rubros ya tienen vector.");

  console.log(`📦 Procesando ${rubros.length} rubros...`);

  // 2. Traer TODAS las keywords con su relación por ID
  // Ahora usamos 'rubro_id' que es mucho más seguro que el texto
  const { data: keywords, error: errKeys } = await supabase
    .from('palabras_clave')
    .select('keyword, rubro_id');

  if (errKeys) return console.error("❌ Error DB Keywords:", errKeys.message);

  // Crear un mapa para acceso rápido: rubro_id -> [keyword1, keyword2...]
  const keywordsMap = {};
  keywords.forEach(k => {
    if (k.rubro_id) {
      if (!keywordsMap[k.rubro_id]) keywordsMap[k.rubro_id] = [];
      keywordsMap[k.rubro_id].push(k.keyword);
    }
  });

  let procesados = 0;

  for (const r of rubros) {
    try {
      // 3. Construir el contexto enriquecido
      // Buscamos las keywords usando el ID exacto del rubro
      const misKeywords = keywordsMap[r.id] || [];
      const keywordsString = misKeywords.join(', ');

      // Prompt enriquecido para la IA: Define qué es el rubro y qué abarca
      const textoParaIA = `
        Rubro Comercial: ${r.nombre}
        Definición: Establecimiento dedicado a la venta de productos o servicios de la categoría ${r.nombre}.
        Palabras clave y sinónimos asociados: ${keywordsString}
      `.replace(/\s+/g, ' ').trim();

      console.log(`✨ [${r.id}] ${r.nombre} -> ${misKeywords.length} keywords`);

      // 4. Generar Vector
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textoParaIA,
      });

      // 5. Guardar
      const { error: updateError } = await supabase
        .from('rubros')
        .update({ embedding: response.data[0].embedding })
        .eq('id', r.id);

      if (updateError) throw updateError;
      
      procesados++;

    } catch (err) {
      console.error(`❌ Falló ${r.nombre}:`, err.message);
    }
  }
  console.log(`🎉 Finalizado. ${procesados} rubros vectorizados con contexto mejorado.`);
}

generarEmbeddingsRubros();