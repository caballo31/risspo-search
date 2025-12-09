import { supabase } from '../api/supabase.js';

/**
 * Busca productos por título (híbrida: texto + semántica si es necesario)
 */
export async function searchProductos(term) {
  try {
    // Sanitizar: eliminar puntos que teclados móviles insertan automáticamente
    const original = String(term || '').trim().replace(/[.]/g, '');

    // PASO 1: Búsqueda por texto (ilike + plurales)
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

    // PASO 2: Evaluar si necesitamos búsqueda semántica
    let allResults = textResults || [];
    
    if (!allResults || allResults.length < 3) {
      try {
        console.log(`📊 Resultados de texto: ${allResults.length} (< 3), activando búsqueda semántica...`);
        const semanticResp = await fetch(`/api/search-semantic-products?term=${encodeURIComponent(original)}`);
        
        if (semanticResp.ok) {
          const semanticData = await semanticResp.json();
          const semanticResults = semanticData.results || [];
          
          console.log(`✨ Resultados semánticos: ${semanticResults.length}`);
          
          // PASO 3: Fusión con deduplicación por ID
          if (semanticResults.length > 0) {
            const seenIds = new Set(allResults.map(p => p.id));
            
            semanticResults.forEach(semProduct => {
              if (!seenIds.has(semProduct.id)) {
                seenIds.add(semProduct.id);
                allResults.push(semProduct);
              }
            });
            
            console.log(`🔗 Fusión completa: ${allResults.length} productos totales`);
          }
        }
      } catch (semanticErr) {
        console.warn('⚠️ Error en búsqueda semántica de productos:', semanticErr);
        // Continuar con resultados de texto si la semántica falla
      }
    }

    return allResults;
  } catch (error) {
    console.error('Error buscando productos:', error);
    return null;
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

