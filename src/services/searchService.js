import { supabase } from '../api/supabase.js';

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
// PASO 2: DETECCIÓN DE RUBRO (La Fuente de la Verdad)
// =====================================================================

/**
 * Detecta el rubro (categoría) del término con jerarquía estricta
 * PROHIBIDO: Inferir rubro desde productos
 * @param {string} term Término de búsqueda
 * @returns {Object|null} Objeto rubro con { nombre, id, metodo }
 */
export async function detectarRubroEstricto(term) {
  try {
    const termClean = String(term || '').trim().toLowerCase();
    
    console.log(`\n📋 PASO 2: Detectando Rubro para "${term}"...`);

    // MÉTODO A: Match exacto en tabla rubros (ilike)
    console.log('  → Método A: Match exacto en rubros...');
    const { data: rubrosExactos, error: errExacto } = await supabase
      .from('rubros')
      .select('*')
      .ilike('nombre', `%${termClean}%`)
      .limit(1);

    if (!errExacto && rubrosExactos && rubrosExactos.length > 0) {
      console.log(`✅ PASO 2 ÉXITO (Método A): Rubro encontrado: "${rubrosExactos[0].nombre}"`);
      return { ...rubrosExactos[0], metodo: 'exacto' };
    }

    // MÉTODO B: Inferencia desde palabras_clave
    console.log('  → Método B: Busca en palabras_clave...');
    const { data: keywordMatch, error: errKeyword } = await supabase
      .rpc('buscar_keywords', { busqueda: termClean });

    if (!errKeyword && keywordMatch && keywordMatch.length > 0) {
      const rubroInferido = keywordMatch[0].rubro_asociado;
      if (rubroInferido) {
        console.log(`✅ PASO 2 ÉXITO (Método B): Rubro inferido desde keywords: "${rubroInferido}"`);
        return { nombre: rubroInferido, id: null, metodo: 'keyword' };
      }
    }

    // MÉTODO C: Embedding de Rubro (match_rubros)
    console.log('  → Método C: Búsqueda vectorial de rubros...');
    try {
      const semanticResp = await fetch(`/api/search-semantic?term=${encodeURIComponent(term)}`);
      if (semanticResp.ok) {
        const semanticData = await semanticResp.json();
        // Extraer rubro de los negocios semánticos
        if (semanticData.results && semanticData.results.length > 0) {
          const primerNegocio = semanticData.results[0];
          if (primerNegocio.rubro && primerNegocio.similarity > 0.5) {
            console.log(`✅ PASO 2 ÉXITO (Método C): Rubro vectorial: "${primerNegocio.rubro}" (similitud: ${primerNegocio.similarity.toFixed(3)})`);
            return { nombre: primerNegocio.rubro, id: null, metodo: 'vectorial', similarity: primerNegocio.similarity };
          }
        }
      }
    } catch (semErr) {
      console.warn('  ⚠️ Método C falló:', semErr.message);
    }

    console.log(`❌ PASO 2 FALLIDO: No se detectó rubro por ningún método`);
    return null;
  } catch (error) {
    console.error('Error en detectarRubroEstricto:', error);
    return null;
  }
}

// =====================================================================
// PASO 3: RECUPERACIÓN DE CONTENIDO (Scopeado al Rubro)
// =====================================================================

/**
 * Obtiene negocios que pertenecen a un rubro específico
 * @param {string} rubro Nombre del rubro
 * @returns {Array} Array de negocios
 */
export async function obtenerNegociosPorRubro(rubro) {
  try {
    if (!rubro || typeof rubro !== 'string') {
      console.warn('❌ Rubro inválido para obtenerNegociosPorRubro');
      return [];
    }

    console.log(`\n🏪 Obteniendo negocios del rubro "${rubro}"...`);

    const { data, error } = await supabase
      .from('negocios')
      .select('*')
      .eq('rubro', rubro);

    if (error) throw error;

    const result = data || [];
    console.log(`  ✅ Negocios encontrados: ${result.length}`);
    return result;
  } catch (error) {
    console.error('Error en obtenerNegociosPorRubro:', error);
    return [];
  }
}

/**
 * Obtiene productos dentro de un rubro específico
 * ESTRATEGIA: Primero ilike, luego vectorial (filtrado estrictamente por rubro)
 * @param {string} term Término de búsqueda
 * @param {string} rubro Nombre del rubro
 * @returns {Array} Array de productos
 */
export async function obtenerProductosPorRubro(term, rubro) {
  try {
    const termClean = String(term || '').trim();
    
    if (!rubro || typeof rubro !== 'string') {
      console.warn('❌ Rubro inválido para obtenerProductosPorRubro');
      return [];
    }

    console.log(`\n📦 PASO 3: Buscando productos para "${term}" en rubro "${rubro}"...`);

    // SUB-PASO A: ilike por nombre dentro del rubro
    console.log('  → Sub-paso A: Búsqueda ilike en productos del rubro...');
    let filters = [`titulo.ilike.%${termClean}%`];

    // Soporte para plurales
    if (termClean.length > 3 && termClean.endsWith('s')) {
      const singular = termClean.slice(0, -1);
      filters.push(`titulo.ilike.%${singular}%`);
    }

    const { data: productosLiterales, error: errLiteral } = await supabase
      .from('productos')
      .select('*, negocios!inner(id, nombre, rubro, google_place_id)')
      .or(filters.join(','))
      .eq('negocios.rubro', rubro);

    if (errLiteral) throw errLiteral;

    const resultados = productosLiterales || [];
    console.log(`  ✅ Productos literales encontrados: ${resultados.length}`);

    // SUB-PASO B: Si hay pocos, complementar con búsqueda vectorial (filtrada estrictamente)
    if (resultados.length < 3) {
      console.log('  → Sub-paso B: Complementando con búsqueda vectorial...');
      try {
        const semanticResp = await fetch(`/api/search-semantic-products?term=${encodeURIComponent(term)}`);
        
        if (semanticResp.ok) {
          const semanticData = await semanticResp.json();
          const productosSemanticos = semanticData.results || [];
          
          console.log(`  ✨ Productos semánticos encontrados: ${productosSemanticos.length}`);
          
          // RESTRICCIÓN ESTRICTA: Filtrar SOLO productos del rubro detectado
          const seenIds = new Set(resultados.map(p => p.id));
          const semanticosFiltrados = productosSemanticos.filter(p => {
            const esDelRubro = p.negocios && p.negocios.rubro === rubro;
            const noEsDuplicado = !seenIds.has(p.id);
            
            if (!esDelRubro) {
              console.log(`    🚫 Descartado: "${p.titulo}" (rubro: ${p.negocios?.rubro}), esperado: "${rubro}"`);
            }
            
            return esDelRubro && noEsDuplicado;
          });
          
          resultados.push(...semanticosFiltrados);
          console.log(`  🔗 Después de fusión: ${resultados.length} productos totales`);
        }
      } catch (semErr) {
        console.warn('  ⚠️ Sub-paso B falló:', semErr.message);
      }
    }

    return resultados;
  } catch (error) {
    console.error('Error en obtenerProductosPorRubro:', error);
    return [];
  }
}

/**
 * Obtiene TODOS los productos de un rubro (para exploración)
 */
export async function obtenerTodosProductosDelRubro(rubro) {
  try {
    if (!rubro || typeof rubro !== 'string') return [];

    console.log(`📦 Obteniendo todos los productos del rubro "${rubro}"...`);

    const { data, error } = await supabase
      .from('productos')
      .select('*, negocios(id, nombre, rubro, google_place_id)')
      .eq('negocios.rubro', rubro)
      .limit(20);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error obteniendo productos del rubro:', error);
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