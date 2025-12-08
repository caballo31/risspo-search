// scripts/generar-vectores.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// --- CONFIGURACIÓN ---
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error("❌ Faltan variables de entorno en .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// --- CEREBRO DINÁMICO ---
async function obtenerKeywordsPorRubro() {
  console.log("📥 Descargando tu diccionario de palabras clave...");
  
  // Traemos todas las keywords de tu base de datos
  const { data: keywords, error } = await supabase
    .from('palabras_clave')
    .select('keyword, rubro_asociado');

  if (error) {
    console.error("⚠️ Error leyendo palabras clave:", error.message);
    return {};
  }

  // Las agrupamos por rubro: { 'ferreteria': 'martillo, clavo...', 'pizzeria': 'pizza, muzzarella...' }
  const mapa = {};
  keywords.forEach(k => {
    const rubro = k.rubro_asociado.toLowerCase().trim();
    if (!mapa[rubro]) mapa[rubro] = [];
    mapa[rubro].push(k.keyword);
  });

  // Convertimos los arrays a strings separados por coma
  Object.keys(mapa).forEach(r => {
    mapa[r] = mapa[r].join(', ');
  });

  console.log(`✅ Diccionario cargado con ${keywords.length} palabras para ${Object.keys(mapa).length} rubros.`);
  return mapa;
}

async function generarEmbeddings() {
  // 1. Preparamos el cerebro con tus datos reales
  const keywordsMap = await obtenerKeywordsPorRubro();

  console.log("🚀 Iniciando vectorización enriquecida...");

  const { data: negocios, error } = await supabase
    .from('negocios')
    .select('id, nombre, rubro, direccion, horarios')
    .is('embedding', null) 
    .limit(1000);

  if (error) return console.error("❌ Error Supabase:", error.message);
  if (!negocios || negocios.length === 0) return console.log("✅ Todo al día.");

  console.log(`📦 Procesando ${negocios.length} negocios...`);

  let procesados = 0;

  for (const negocio of negocios) {
    try {
      const rubro = negocio.rubro ? negocio.rubro.toLowerCase().trim() : 'varios';
      
      // 2. Buscamos las keywords específicas para este negocio
      let contextoKeywords = keywordsMap[rubro] || '';

      // Si no tiene keywords específicas, usamos un fallback genérico o intentamos por nombre
      if (!contextoKeywords && rubro === 'varios') {
         // Lógica de rescate simple para "varios"
         if (negocio.nombre.toLowerCase().includes('kiosco')) contextoKeywords = 'golosinas, bebidas, cigarrillos';
         if (negocio.nombre.toLowerCase().includes('taller')) contextoKeywords = 'mecanica, reparacion, auto';
      }

      // 3. Crear el Texto Rico (EL SECRETO)
      // Le decimos a la IA: "Este negocio es X y se relaciona con estas palabras clave: [TUS KEYWORDS]"
      const textoParaIA = `
        Negocio: ${negocio.nombre}
        Rubro: ${negocio.rubro}
        Dirección: ${negocio.direccion || ''}
        
        CONTEXTO Y PALABRAS CLAVE:
        ${contextoKeywords}
        
        DEFINICIÓN NEGATIVA (Anti-Alucinación):
        ${rubro === 'ferreteria' ? 'NO VENDEN ROPA. NO VENDEN COMIDA.' : ''}
        ${rubro === 'indumentaria' ? 'NO ES FERRETERIA. NO VENDEN HERRAMIENTAS.' : ''}
      `.replace(/\s+/g, ' ').trim();

      // 4. Generar Vector
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textoParaIA,
      });
      const vector = response.data[0].embedding;

      // 5. Guardar
      await supabase
        .from('negocios')
        .update({ embedding: vector })
        .eq('id', negocio.id);

      procesados++;
      if (procesados % 10 === 0) process.stdout.write(`.`); 

    } catch (err) {
      console.error(`\n⚠️ Error ID ${negocio.id}:`, err.message);
    }
  }

  console.log(`\n🎉 Finalizado. ${procesados} negocios enriquecidos con tus keywords.`);
}

generarEmbeddings();