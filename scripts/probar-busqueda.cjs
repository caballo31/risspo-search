// scripts/probar-busqueda.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function probar(termino) {
  console.log(`\n🔍 Probando búsqueda para: "${termino}"`);
  
  // 1. Generar Vector
  console.log("🤖 Generando vector...");
  const emb = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: termino
  });
  const vector = emb.data[0].embedding;

  // 2. Consultar Supabase
  console.log("🗄️ Consultando base de datos...");
  const { data, error } = await supabase.rpc('match_negocios', {
    query_embedding: vector,
    match_threshold: 0.2, // Probamos con 0.2
    match_count: 5
  });

  if (error) {
    console.error("❌ Error RPC:", error.message);
    return;
  }

  // 3. Mostrar Resultados
  console.log(`🎉 Encontrados: ${data.length}\n`);
  data.forEach(n => {
    console.log(`- ${n.nombre} (${n.rubro})`);
    console.log(`  Similitud: ${ (n.similarity * 100).toFixed(1) }%`); // Si tu RPC devuelve similarity
  });
}

// Cambia esto para probar otras frases
const frase = process.argv[2] || "cena con amigos"; 
probar(frase);