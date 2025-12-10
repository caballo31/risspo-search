// scripts/test-suite.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// --- CONFIGURACIÓN ---
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- UTILIDADES ---
async function getVector(term) {
  const resp = await openai.embeddings.create({ model: 'text-embedding-3-small', input: term });
  return resp.data[0].embedding;
}

// --- SIMULACIÓN DE SERVICIOS (Lógica Federada) ---

// 1. Negocios (Texto)
async function buscarNegocios(term) {
  const { data } = await supabase.from('negocios').select('id, nombre, rubro_id').ilike('nombre', `%${term}%`).limit(5);
  return data || [];
}

// 2. Contexto (Texto + Vector)
async function buscarContexto(term, vector) {
  const rubrosMap = new Map();
  
  // A. Exacto
  const { data: exactos } = await supabase.from('rubros').select('id, nombre').ilike('nombre', `%${term}%`).limit(5);
  if (exactos) exactos.forEach(r => rubrosMap.set(r.id, r.nombre));

  // B. Vectorial (Simulando /api/search-semantic)
  const { data: vectoriales } = await supabase.rpc('match_negocios', { 
    query_embedding: vector, match_threshold: 0.38, match_count: 5 
  });
  if (vectoriales) {
    vectoriales.forEach(n => {
      if (n.rubro_id) rubrosMap.set(n.rubro_id, n.rubro || `Rubro ${n.rubro_id}`);
    });
  }

  return Array.from(rubrosMap.entries()).map(([id, nombre]) => ({ id, nombre }));
}

// 3. Productos (Global + Vector)
async function buscarProductos(term, vector) {
  let productos = [];
  
  // A. Texto
  const { data: texto } = await supabase
    .from('productos')
    .select('id, titulo, negocio_id, negocios(id, nombre, rubro_id)')
    .ilike('titulo', `%${term}%`)
    .limit(10);
  if (texto) productos = [...texto];

  // B. Vectorial (Si hay pocos)
  if (productos.length < 5) {
    const { data: vectoriales } = await supabase.rpc('match_productos', {
      query_embedding: vector, match_threshold: 0.35, match_count: 10
    });
    
    if (vectoriales) {
      const ids = new Set(productos.map(p => p.id));
      // Mapeamos para que tenga la misma estructura
      for (const v of vectoriales) {
        if (!ids.has(v.id)) {
          // Fetch manual del negocio para el producto vectorial (simulación)
          const { data: neg } = await supabase.from('negocios').select('id, nombre, rubro_id').eq('id', v.negocio_id).single();
          productos.push({
            id: v.id,
            titulo: v.titulo,
            negocio_id: v.negocio_id,
            negocios: neg,
            _esVectorial: true
          });
        }
      }
    }
  }
  return productos;
}

// --- SCORING ENGINE (El Árbitro) ---
function calcularResultados(term, negocios, contexto, productos) {
  const rubroIds = new Set(contexto.map(c => c.id));
  let log = [];

  // 1. Ganador Negocio Exacto
  const exacto = negocios.find(n => n.nombre.toLowerCase().trim() === term.toLowerCase().trim());
  if (exacto) return { ganador: 'NEGOCIO_EXACTO', detalle: exacto.nombre };

  // 2. Scoring Productos
  const productosPuntuados = productos.map(p => {
    let score = 50; // Base
    let boost = "";
    
    // Boost por Coherencia de Rubro
    if (p.negocios && rubroIds.has(p.negocios.rubro_id)) {
      score += 40;
      boost = "(BOOST RUBRO)";
    }
    // Penalización si es vectorial puro (confianza media)
    if (p._esVectorial) score -= 5;

    return { ...p, score, boost };
  });

  productosPuntuados.sort((a, b) => b.score - a.score);

  // 3. Decisión Final
  if (productosPuntuados.length > 0) {
    const top = productosPuntuados.slice(0, 3).map(p => `${p.titulo} [${p.score}pts ${p.boost}] - ${p.negocios?.nombre}`);
    return { ganador: 'PRODUCTOS', detalle: top, total: productosPuntuados.length };
  } else if (contexto.length > 0) {
    return { ganador: 'RUBROS', detalle: contexto.map(c => c.nombre).join(', ') };
  } else {
    return { ganador: 'SIN_RESULTADOS', detalle: 'Nada relevante encontrado' };
  }
}

// --- EJECUTOR ---
async function correrTest(caso, term) {
  console.log(`\n🧪 CASO ${caso}: "${term}"`);
  console.time('Tiempo');
  
  try {
    // 1. Generar vector (simula lo que hace la API)
    const vector = await getVector(term);

    // 2. Ejecutar paralelo
    const [negocios, contexto, productos] = await Promise.all([
      buscarNegocios(term),
      buscarContexto(term, vector),
      buscarProductos(term, vector)
    ]);

    // 3. Evaluar
    const resultado = calcularResultados(term, negocios, contexto, productos);

    console.timeEnd('Tiempo');
    console.log(`   📂 Contexto Rubros: [${contexto.map(c => c.nombre).join(', ')}]`);
    console.log(`   🏆 Ganador: ${resultado.ganador}`);
    if (Array.isArray(resultado.detalle)) {
      resultado.detalle.forEach(d => console.log(`      -> ${d}`));
    } else {
      console.log(`      -> ${resultado.detalle}`);
    }

  } catch (e) {
    console.error("   ❌ ERROR:", e.message);
  }
}

// --- MAIN ---
async function main() {
  console.log("========================================");
  console.log("      SUITE DE TEST AUTOMATIZADO        ");
  console.log("========================================");

  await correrTest(1, "hamburgesa");       // Typo
  await correrTest(2, "Farmacia");         // Categoría
  await correrTest(3, "Taladro");          // Producto técnico
  await correrTest(4, "Tengo hambre");     // Semántico puro
  await correrTest(5, "Pikaburguers");     // Negocio exacto
  
  console.log("\n✅ Test finalizado.");
}

main();