import { supabase } from '../api/supabase.js';

/**
 * NIVEL 1: Detecta el rubro (categoría) del término de búsqueda
 * Estrategia en cascada:
 * 1. Match exacto contra tabla rubros (ilike)
 * 2. Inferencia desde palabras_clave
 * 3. Búsqueda semántica contra rubros (última opción)
 */
export async function detectarRubro(term) {
  try {
    const termClean = String(term || '').trim().toLowerCase();
    
    console.log(`🔍 Nivel 1: Detectando rubro para "${term}"`);

    // 1.A: Búsqueda exacta en tabla rubros
    console.log('  → Intentando match exacto en rubros...');
    const { data: rubrosExactos, error: errExacto } = await supabase
      .from('rubros')
      .select('*')
      .ilike('nombre', `%${termClean}%`)
      .limit(1);

    if (!errExacto && rubrosExactos && rubrosExactos.length > 0) {
      console.log(`  ✅ Rubro encontrado (exacto): "${rubrosExactos[0].nombre}"`);
      return rubrosExactos[0];
    }

    // 1.B: Inferencia desde palabras_clave
    console.log('  → Intentando inferencia desde palabras_clave...');
    const { data: keywordMatch, error: errKeyword } = await supabase
      .rpc('buscar_keywords', { busqueda: termClean });

    if (!errKeyword && keywordMatch && keywordMatch.length > 0) {
      const rubroInferido = keywordMatch[0].rubro_asociado;
      if (rubroInferido) {
        console.log(`  ✅ Rubro inferido (keyword): "${rubroInferido}"`);
        return { nombre: rubroInferido, id: null };
      }
    }

    // 1.C: Búsqueda semántica contra rubros (última opción)
    console.log('  → Intentando búsqueda semántica de rubros...');
    try {
      const semanticResp = await fetch(`/api/search-semantic?term=${encodeURIComponent(term)}`);
      if (semanticResp.ok) {
        const semanticData = await semanticResp.json();
        // Intentar extraer rubro de los negocios semánticos
        if (semanticData.results && semanticData.results.length > 0) {
          const primerNegocio = semanticData.results[0];
          if (primerNegocio.rubro) {
            console.log(`  ✅ Rubro inferido (semántica): "${primerNegocio.rubro}"`);
            return { nombre: primerNegocio.rubro, id: null, similarity: primerNegocio.similarity };
          }
        }
      }
    } catch (semErr) {
      console.warn('  ⚠️ Error en búsqueda semántica de rubros:', semErr);
    }

    console.log('  ❌ No se detectó rubro');
    return null;
  } catch (error) {
    console.error('Error detectando rubro:', error);
    return null;
  }
}

/**
 * NIVEL 2: Busca productos dentro de un rubro específico
 * Estrategia:
 * 1. Búsqueda por texto (ilike) en títulos dentro del rubro
 * 2. Si hay pocos resultados, complementa con búsqueda semántica (filtrada por rubro)
 */
export async function buscarProductosPorRubro(term, rubro) {
  try {
    const termClean = String(term || '').trim();
    
    if (!rubro || !rubro.nombre) {
      console.warn('❌ Rubro inválido para buscar productos');
      return [];
    }

    console.log(`🔍 Nivel 2: Buscando productos para "${term}" en rubro "${rubro.nombre}"`);

    // 2.A: Búsqueda por texto (ilike) en negocios de este rubro
    console.log('  → Búsqueda literal (ilike) en productos del rubro...');
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
      .eq('negocios.rubro', rubro.nombre);

    if (errLiteral) throw errLiteral;

    const resultados = productosLiterales || [];
    console.log(`  ✅ Productos literales encontrados: ${resultados.length}`);

    // 2.B: Si hay pocos resultados (< 3), complementar con búsqueda semántica
    if (resultados.length < 3) {
      console.log('  → Complementando con búsqueda semántica de productos...');
      try {
        const semanticResp = await fetch(`/api/search-semantic-products?term=${encodeURIComponent(term)}`);
        
        if (semanticResp.ok) {
          const semanticData = await semanticResp.json();
          const productosSematicos = semanticData.results || [];
          
          console.log(`  ✨ Productos semánticos encontrados: ${productosSematicos.length}`);
          
          // Filtrar semánticos por rubro y deduplicar
          const seenIds = new Set(resultados.map(p => p.id));
          const semanticosFiltrados = productosSematicos.filter(p => {
            const esDelRubro = p.negocios && p.negocios.rubro === rubro.nombre;
            const noEsDuplicado = !seenIds.has(p.id);
            return esDelRubro && noEsDuplicado;
          });
          
          resultados.push(...semanticosFiltrados);
          console.log(`  🔗 Después de fusión: ${resultados.length} productos totales`);
        }
      } catch (semErr) {
        console.warn('  ⚠️ Error en búsqueda semántica de productos:', semErr);
      }
    }

    return resultados;
  } catch (error) {
    console.error('Error buscando productos por rubro:', error);
    return [];
  }
}

/**
 * NIVEL 2 (Alternativo): Obtén TODOS los productos de un rubro para la sección "Exploración"
 */
export async function obtenerTodosProductosDelRubro(rubro) {
  try {
    if (!rubro || !rubro.nombre) return [];

    console.log(`📦 Obteniend todos los productos del rubro "${rubro.nombre}"...`);

    const { data, error } = await supabase
      .from('productos')
      .select('*, negocios(id, nombre, rubro, google_place_id)')
      .eq('negocios.rubro', rubro.nombre)
      .limit(20);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error obteniendo productos del rubro:', error);
    return [];
  }
}

/**
 * Busca productos por título (búsqueda de texto pura y rápida)
 * NOTA: Esta función SOLO hace búsqueda literal. No usa IA.
 */
export async function searchProductos(term) {
  try {
    // Sanitizar: eliminar puntos que teclados móviles insertan automáticamente
    const original = String(term || '').trim().replace(/[.]/g, '');

    // Búsqueda por texto (ilike + plurales)
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
 * NOTA: Esta función SOLO se llama cuando la búsqueda literal falla
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

    // Extraer todos los rubros asociados desde el RPC (si los devuelve)
    let rubros = [];
    if (data && data.length > 0) {
      rubros = data
        .map(r => r.rubro_asociado)
        .filter(Boolean)
        .map(r => String(r).trim());
    }

    // Fallback adicional: buscar en productos que contengan el término y extraer los rubros de los negocios asociados.
    // Esto ayuda en casos como "papas" donde varios rubros pueden vender el mismo producto.
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

    // Normalizar y devolver lista única de rubros
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
    // Acepta un string (búsqueda fuzzy) o un array de rubros (match exacto usando IN)
    let query = supabase.from('negocios').select('*');

    if (Array.isArray(rubro) && rubro.length > 0) {
      // Usar IN para múltiples rubros (coincidencia exacta por string)
      query = query.in('rubro', rubro);
    } else if (typeof rubro === 'string' && rubro.trim() !== '') {
      // Búsqueda fuzzy para coincidencia parcial
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