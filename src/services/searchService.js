import { supabase } from '../api/supabase.js';
import { pipeline } from '@xenova/transformers';

// Singleton para el modelo de embeddings
let embeddingPipeline = null;

async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embeddingPipeline;
}

async function generateEmbedding(text) {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// =====================================================================
// PASO 1: BÚSQUEDA DE NEGOCIO (Prioridad Máxima)
// =====================================================================

/**
 * Busca un negocio por nombre (ilike exacto)
 * Si encuentra coincidencia alta, retorna el negocio para mostrar su perfil
 * @param {string} term Término de búsqueda
 * @returns {Object|null} Objeto negocio si se encuentra, null en caso contrario
 */
export async function buscarNegocioDirecto(term) {
  try {
    const termClean = String(term || '').trim();
    
    console.log(`\n📍 PASO 1: Buscando negocio directo para "${term}"...`);

    const { data, error } = await supabase
      .from('negocios')
      .select('*')
      .ilike('nombre', `%${termClean}%`)
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`✅ PASO 1 ÉXITO: Negocio encontrado: "${data[0].nombre}"`);
      return data[0];
    }

    console.log(`❌ PASO 1 FALLIDO: No se encontró negocio directo`);
    return null;
  } catch (error) {
    console.error('Error en buscarNegocioDirecto:', error);
    return null;
  }
}

// =====================================================================
// PASO 2: DETECCIÓN DE CONTEXTO DE RUBROS (Búsqueda Expandida)
// =====================================================================

/**
 * Detecta el contexto de rubros basado en el término de búsqueda.
 * Retorna un array de objetos rubro: [{ id, nombre, score, tipo }]
 * Prioridad:
 * 1. Match Exacto (Nombre de Rubro)
 * 2. Match Keyword (Palabra Clave -> Rubro)
 * 3. Match Semántico (Embedding -> Rubro)
 */
export async function detectarContextoDeRubros(termino) {
  const terminoNorm = termino.toLowerCase().trim();
  const resultadosMap = new Map(); // Map<id, {id, nombre, score, tipo}>

  console.log(`🔍 Detectando contexto para: "${termino}"`);

  try {
    // 1. Búsqueda Exacta en Rubros (Nombre)
    const { data: rubrosExactos } = await supabase
      .from('rubros')
      .select('id, nombre')
      .ilike('nombre', terminoNorm);

    if (rubrosExactos?.length) {
      rubrosExactos.forEach(r => {
        resultadosMap.set(r.id, { ...r, score: 1.0, tipo: 'exacto' });
      });
    }

    // 2. Búsqueda por Palabras Clave (Relación FK)
    // Buscamos en palabras_clave y obtenemos el rubro asociado
    const { data: keywords } = await supabase
      .from('palabras_clave')
      .select('rubro_id, keyword, rubros ( id, nombre )')
      .ilike('keyword', terminoNorm);

    if (keywords?.length) {
      keywords.forEach(k => {
        if (k.rubros && !resultadosMap.has(k.rubros.id)) {
          resultadosMap.set(k.rubros.id, { 
            id: k.rubros.id, 
            nombre: k.rubros.nombre, 
            score: 0.95, 
            tipo: 'keyword' 
          });
        }
      });
    }

    // 3. Búsqueda Semántica en Rubros (Embedding)
    try {
      const embedding = await generateEmbedding(termino);
      // Asumimos que existe una función RPC 'match_rubros' para buscar en la tabla rubros
      const { data: rubrosSemanticos, error } = await supabase.rpc('match_rubros', {
        query_embedding: embedding,
        match_threshold: 0.6,
        match_count: 5
      });

      if (!error && rubrosSemanticos?.length) {
        rubrosSemanticos.forEach(r => {
          if (!resultadosMap.has(r.id)) {
            resultadosMap.set(r.id, { 
              id: r.id, 
              nombre: r.nombre, 
              score: r.similarity, 
              tipo: 'semantico' 
            });
          }
        });
      }
    } catch (semError) {
      console.warn('⚠️ Búsqueda semántica no disponible o falló:', semError);
    }

  } catch (err) {
    console.error('Error en detección de contexto:', err);
  }

  // Convertir a array y ordenar
  return Array.from(resultadosMap.values()).sort((a, b) => {
    const scoreA = getScore(a);
    const scoreB = getScore(b);
    return scoreB - scoreA;
  });
}

function getScore(item) {
  if (item.tipo === 'exacto') return 100;
  if (item.tipo === 'keyword') return 90;
  return (item.score || 0) * 10; 
}

// ==========================================
// 2. RECUPERACIÓN DE NEGOCIOS (POR ID)
// ==========================================

export async function obtenerNegociosPorRubro(contextoRubros) {
  if (!contextoRubros?.length) return [];

  const ids = contextoRubros.map(r => r.id);
  
  // Filtrar negocios usando la FK rubro_id
  const { data, error } = await supabase
    .from('negocios')
    .select('*')
    .in('rubro_id', ids);

  if (error) {
    console.error('Error obteniendo negocios:', error);
    return [];
  }

  // Ordenar negocios según la prioridad del rubro
  const ordenRubros = new Map(ids.map((id, i) => [id, i]));
  return data.sort((a, b) => {
    return (ordenRubros.get(a.rubro_id) || 999) - (ordenRubros.get(b.rubro_id) || 999);
  });
}

// ==========================================
// 3. RECUPERACIÓN DE PRODUCTOS (POR ID DE NEGOCIO)
// ==========================================

export async function obtenerProductosPorRubro(termino, contextoRubros) {
  if (!contextoRubros?.length) return [];

  // Paso intermedio: Obtener IDs de negocios relevantes
  const negocios = await obtenerNegociosPorRubro(contextoRubros);
  const negocioIds = negocios.map(n => n.id);

  if (negocioIds.length === 0) return [];

  // Buscar productos en esos negocios que coincidan con el término
  // Usamos búsqueda de texto simple sobre el subset de negocios
  const { data, error } = await supabase
    .from('productos')
    .select('*, negocios (nombre, rubro_id)') 
    .in('negocio_id', negocioIds)
    .or(`titulo.ilike.%${termino}%,descripcion.ilike.%${termino}%`)
    .limit(50);

  if (error) {
    console.error('Error obteniendo productos:', error);
    return [];
  }

  return data || [];
}

/**
 * Obtiene TODOS los productos de un contexto de rubros (para exploración)
 * @param {Array|string} rubros Array de rubros o string único
 * @returns {Array} Array de productos
 */
export async function obtenerTodosProductosDelRubro(rubros) {
  try {
    const rubrosArray = Array.isArray(rubros) 
      ? rubros 
      : (rubros && typeof rubros === 'string' ? [rubros] : []);

    if (rubrosArray.length === 0) return [];

    console.log(`📦 Obteniendo todos los productos del contexto [${rubrosArray.join(', ')}]...`);

    const { data, error } = await supabase
      .from('productos')
      .select('*, negocios(id, nombre, rubro, google_place_id)')
      .in('negocios.rubro', rubrosArray)
      .limit(50);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error obteniendo productos del contexto:', error);
    return [];
  }
}

// =====================================================================
// FUNCIONES LEGADAS (Compatibilidad)
// =====================================================================

/**
 * Busca productos por título (búsqueda de texto pura y rápida)
 * NOTA: Esta función SOLO hace búsqueda literal. No usa IA.
 */
export async function searchProductos(term) {
  try {
    const original = String(term || '').trim().replace(/[.]/g, '');
    let query = supabase
      .from('productos')
      .select('*, negocios(id, rubro, nombre, google_place_id)');

    const termClean = original;
    let filters = [`titulo.ilike.%${termClean}%`];

    if (termClean.length > 3 && termClean.endsWith('s')) {
      const singular = termClean.slice(0, -1);
      filters.push(`titulo.ilike.%${singular}%`);
    }

    query = query.or(filters.join(','));

    const { data: textResults, error } = await query;
    
    if (error) throw error;
    return textResults || [];
  } catch (error) {
    console.error('Error buscando productos:', error);
    return [];
  }
}

/**
 * Busca productos usando semántica (IA con embeddings)
 */
export async function searchProductosSemantic(term) {
  try {
    const semanticResp = await fetch(`/api/search-semantic-products?term=${encodeURIComponent(term)}`);
    
    if (!semanticResp.ok) {
      console.warn('searchProductosSemantic fetch failed');
      return [];
    }

    const semanticData = await semanticResp.json();
    return semanticData.results || [];
  } catch (error) {
    console.error('Error en searchProductosSemantic:', error);
    return [];
  }
}

/**
 * Busca palabras clave y retorna el rubro asociado
 */
export async function searchPalabrasClave(term) {
  try {
    const { data, error } = await supabase.rpc('buscar_keywords', { busqueda: term });

    if (error) throw error;

    let rubros = [];
    if (data && data.length > 0) {
      rubros = data
        .map(r => r.rubro_asociado)
        .filter(Boolean)
        .map(r => String(r).trim());
    }

    try {
      const { data: prodData, error: prodErr } = await supabase
        .from('productos')
        .select('negocios(rubro)')
        .ilike('titulo', `%${term}%`)
        .limit(50);

      if (!prodErr && prodData && prodData.length > 0) {
        const rubrosFromProducts = prodData
          .map(p => p.negocios && p.negocios.rubro)
          .filter(Boolean)
          .map(r => String(r).trim());

        rubros = rubros.concat(rubrosFromProducts);
      }
    } catch (innerErr) {
      console.warn('Fallback productos -> rubros falló:', innerErr);
    }

    const uniqueRubros = Array.from(new Set(rubros.map(r => r.toLowerCase()))).map(r => r);
    return uniqueRubros;
  } catch (error) {
    console.error('Error buscando palabras clave:', error);
    return [];
  }
}

/**
 * Busca negocios por rubro
 */
export async function searchNegociosByRubro(rubro) {
  try {
    let query = supabase.from('negocios').select('*');

    if (Array.isArray(rubro) && rubro.length > 0) {
      query = query.in('rubro', rubro);
    } else if (typeof rubro === 'string' && rubro.trim() !== '') {
      query = query.ilike('rubro', `%${rubro}%`);
    } else {
      return [];
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error buscando negocios por rubro:', error);
    return null;
  }
}

/**
 * Busca negocios por nombre
 */
export async function searchNegociosByNombre(term) {
  try {
    const { data, error } = await supabase
      .from('negocios')
      .select('*')
      .ilike('nombre', `%${term}%`);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error buscando negocios por nombre:', error);
    return null;
  }
}

/**
 * Busca semánticamente mediante el endpoint seguro que crea embeddings
 */
export async function searchSemantic(term) {
  try {
    const resp = await fetch(`/api/search-semantic?term=${encodeURIComponent(term)}`);
    if (!resp.ok) {
      console.error('searchSemantic fetch failed', await resp.text());
      return [];
    }
    const json = await resp.json();
    return json.results || [];
  } catch (error) {
    console.error('Error en searchSemantic:', error);
    return [];
  }
}