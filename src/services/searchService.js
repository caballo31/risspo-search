import { supabase } from '../api/supabase.js';

// =====================================================================
// MOTOR DE BÚSQUEDA FEDERADA CON SCORING
// =====================================================================

/**
 * Ejecuta la búsqueda federada en paralelo y calcula puntajes de relevancia.
 * @param {string} term Término de búsqueda
 * @returns {Promise<Object>} Objeto con resultados ordenados y metadatos
 */
export async function performFederatedSearch(term) {
  const termClean = String(term || '').trim();
  if (!termClean) return { winner: null, results: [] };

  console.log(`\n🚀 INICIANDO BÚSQUEDA FEDERADA PARA: "${termClean}"`);

  try {
    // 1. EJECUCIÓN PARALELA DE QUERIES (A, B, C)
    const [businesses, categories, products] = await Promise.all([
      searchBusinessesQuery(termClean),
      searchCategoriesQuery(termClean),
      searchProductsGlobalQuery(termClean)
    ]);

    console.log(`   📊 Raw Results -> Negocios: ${businesses.length}, Rubros: ${categories.length}, Productos: ${products.length}`);

    // 2. CÁLCULO DE SCORING Y RELEVANCIA
    const scoredResults = calculateRelevance(termClean, businesses, categories, products);

    return scoredResults;

  } catch (error) {
    console.error('❌ Error crítico en búsqueda federada:', error);
    return { winner: null, results: [], error };
  }
}

// =====================================================================
// QUERY A: NEGOCIOS (Búsqueda Directa)
// =====================================================================

async function searchBusinessesQuery(term) {
  try {
    // Estrategia: ilike (parcial) + FTS (typos)
    const { data, error } = await supabase
      .from('negocios')
      .select('*')
      .or(`nombre.ilike.%${term}%`)
      .limit(5);

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('Error buscando negocios:', e);
    return [];
  }
}

// =====================================================================
// QUERY B: RUBROS (Contexto)
// =====================================================================

async function searchCategoriesQuery(term) {
  try {
    const termNorm = term.toLowerCase();
    const rubrosMap = new Map();

    // 1. DB: Match Exacto/Parcial en Rubros
    const pRubrosDB = supabase
      .from('rubros')
      .select('id, nombre')
      .ilike('nombre', `%${term}%`)
      .limit(5)
      .then(({ data }) => data || []);

    // 2. DB: Keywords
    const pKeywords = supabase
      .from('palabras_clave')
      .select('rubro_id, keyword, rubros ( id, nombre )')
      .ilike('keyword', `%${term}%`)
      .limit(5)
      .then(({ data }) => data || []);

    // 3. API: Semántica (Vectorial)
    const pSemantico = fetch(`/api/search-semantic?term=${encodeURIComponent(term)}`)
      .then(res => res.ok ? res.json() : { results: [] })
      .then(data => data.results || [])
      .catch(() => []);

    const [dbRubros, dbKeywords, apiSemantic] = await Promise.all([pRubrosDB, pKeywords, pSemantico]);

    // Procesar DB Rubros
    dbRubros.forEach(r => rubrosMap.set(r.id, { ...r, source: 'exact', score: 80 }));

    // Procesar Keywords
    dbKeywords.forEach(k => {
      if (k.rubros && !rubrosMap.has(k.rubros.id)) {
        rubrosMap.set(k.rubros.id, { ...k.rubros, source: 'keyword', score: 75 });
      }
    });

    // Procesar Semántico
    // Necesitamos hidratar los IDs con nombres si vienen de la API
    const semanticIds = apiSemantic.filter(r => r.rubro_id).map(r => r.rubro_id);
    if (semanticIds.length > 0) {
      const { data: rubrosSem } = await supabase.from('rubros').select('id, nombre').in('id', semanticIds);
      if (rubrosSem) {
        rubrosSem.forEach(r => {
          if (!rubrosMap.has(r.id)) {
            rubrosMap.set(r.id, { ...r, source: 'semantic', score: 60 });
          }
        });
      }
    }

    return Array.from(rubrosMap.values());
  } catch (e) {
    console.warn('Error buscando rubros:', e);
    return [];
  }
}

// =====================================================================
// QUERY C: PRODUCTOS GLOBAL (Sin filtros previos)
// =====================================================================

async function searchProductsGlobalQuery(term) {
  try {
    // 1. Búsqueda de Texto (ilike) en TODOS los productos
    // IMPORTANTE: Traemos datos del negocio para el Boost de Coherencia
    const { data, error } = await supabase
      .from('productos')
      .select('*, negocios (id, nombre, rubro_id)')
      .or(`titulo.ilike.%${term}%,descripcion.ilike.%${term}%`)
      .limit(20);

    if (error) throw error;
    
    let products = data || [];

    // 2. Fallback Vectorial si hay pocos resultados
    if (products.length < 3) {
      try {
        const semResp = await fetch(`/api/search-semantic-products?term=${encodeURIComponent(term)}`);
        if (semResp.ok) {
          const semData = await semResp.json();
          if (semData.results) {
            // Hidratar con datos de negocio porque el vector search a veces no trae todo
            const productIds = semData.results.map(p => p.id);
            const { data: semProducts } = await supabase
              .from('productos')
              .select('*, negocios (id, nombre, rubro_id)')
              .in('id', productIds);
            
            if (semProducts) {
              // Merge evitando duplicados
              const existingIds = new Set(products.map(p => p.id));
              semProducts.forEach(p => {
                if (!existingIds.has(p.id)) products.push(p);
              });
            }
          }
        }
      } catch (err) { console.warn('Vector products failed', err); }
    }

    return products;
  } catch (e) {
    console.warn('Error buscando productos globales:', e);
    return [];
  }
}

// =====================================================================
// SISTEMA DE SCORING (Lógica de Negocio)
// =====================================================================

function calculateRelevance(term, businesses, categories, products) {
  const termLower = term.toLowerCase();
  
  // 1. Normalizar Entidades para el Ranking Unificado
  let rankedItems = [];

  // --- SCORING NEGOCIOS ---
  businesses.forEach(b => {
    let score = 0;
    if (b.nombre.toLowerCase() === termLower) score = 100; // Exacto
    else if (b.nombre.toLowerCase().startsWith(termLower)) score = 90; // Prefijo
    else score = 70; // Parcial

    rankedItems.push({
      type: 'business',
      data: b,
      score: score,
      id: `biz-${b.id}`
    });
  });

  // --- SCORING RUBROS ---
  const detectedRubroIds = new Set(); // Para el Boost de productos
  categories.forEach(c => {
    detectedRubroIds.add(c.id);
    let score = c.score || 60; // Base score from query
    
    // Boost si es match exacto de nombre
    if (c.nombre.toLowerCase() === termLower) score = 85;

    rankedItems.push({
      type: 'category',
      data: c,
      score: score,
      id: `cat-${c.id}`
    });
  });

  // --- SCORING PRODUCTOS (Con Boost de Coherencia) ---
  products.forEach(p => {
    let score = 50; // Base score producto

    // Match exacto en título
    if (p.titulo.toLowerCase() === termLower) score += 10;

    // BOOST DE COHERENCIA: +30 pts
    // Si el producto pertenece a un rubro que TAMBIÉN fue detectado en la Query B
    if (p.negocios && detectedRubroIds.has(p.negocios.rubro_id)) {
      score += 30;
      p.hasContextBoost = true; // Flag para UI si se quiere destacar
    }

    rankedItems.push({
      type: 'product',
      data: p,
      score: score,
      id: `prod-${p.id}`
    });
  });

  // 2. Ordenar por Score Descendente
  rankedItems.sort((a, b) => b.score - a.score);

  // 3. Determinar Ganador y Estructura de Respuesta
  const winner = rankedItems.length > 0 ? rankedItems[0] : null;
  
  // Agrupar para facilitar el renderizado
  const topBusinesses = rankedItems.filter(i => i.type === 'business').map(i => i.data);
  const topCategories = rankedItems.filter(i => i.type === 'category').map(i => i.data);
  const topProducts = rankedItems.filter(i => i.type === 'product').map(i => i.data);

  return {
    winner,
    stats: {
      totalBusinesses: topBusinesses.length,
      totalCategories: topCategories.length,
      totalProducts: topProducts.length
    },
    data: {
      businesses: topBusinesses,
      categories: topCategories,
      products: topProducts
    }
  };
}

// =====================================================================
// EXPORTS & ALIASES (Compatibilidad)
// =====================================================================

// Funciones auxiliares que podrían ser usadas por componentes legacy
export async function obtenerNegociosPorRubro(rubros) {
  if (!rubros.length) return [];
  const ids = rubros.map(r => r.id);
  const { data } = await supabase.from('negocios').select('*').in('rubro_id', ids);
  return data || [];
}

// Stubs para mantener compatibilidad si algo más importa esto
export const buscarNegociosCandidatos = async () => [];
export const detectarContextoDeRubros = async () => [];
export const obtenerProductosDeNegocios = async () => [];
