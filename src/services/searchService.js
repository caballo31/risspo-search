import { supabase } from '../api/supabase.js';

// =====================================================================
// SERVICIO DE BÚSQUEDA FEDERADA (Tolerante a Fallos)
// =====================================================================

/**
 * Busca negocios con estrategia de degradación (Exacto -> Fuzzy).
 * @param {string} term 
 * @returns {Promise<Array>} Array de negocios
 */
export async function buscarNegociosCandidatos(term) {
  const termClean = String(term || '').trim();
  if (!termClean) return [];

  console.log(`🏢 Buscando negocios para: "${termClean}"`);
  let candidatos = [];
  const ids = new Set();

  try {
    // INTENTO A: Coincidencia Exacta/Parcial (ilike)
    const { data: exactos } = await supabase
      .from('negocios')
      .select('*')
      .ilike('nombre', `%${termClean}%`)
      .limit(5);

    if (exactos) {
      exactos.forEach(n => {
        if (!ids.has(n.id)) {
          candidatos.push(n);
          ids.add(n.id);
        }
      });
    }

    // INTENTO B: Si hay pocos resultados, usar Full Text Search (Typos)
    if (candidatos.length < 3) {
      console.log('   ...Pocos resultados exactos, activando FTS (Typos)');
      const { data: fuzzy } = await supabase
        .from('negocios')
        .select('*')
        .textSearch('nombre', termClean, { type: 'websearch', config: 'spanish' })
        .limit(5);

      if (fuzzy) {
        fuzzy.forEach(n => {
          if (!ids.has(n.id)) {
            candidatos.push(n);
            ids.add(n.id);
          }
        });
      }
    }

    return candidatos;
  } catch (e) {
    console.error('Error en buscarNegociosCandidatos:', e);
    return [];
  }
}

/**
 * Detecta contexto de rubros en paralelo.
 * @param {string} term 
 * @returns {Promise<Array>} Array de objetos rubro {id, nombre, source}
 */
export async function detectarContextoRubros(term) {
  const termClean = String(term || '').trim();
  if (!termClean) return [];

  console.log(`🏷️ Detectando contexto para: "${termClean}"`);
  const rubrosMap = new Map();

  try {
    // Ejecución Paralela de 3 Estrategias
    const pExacto = supabase
      .from('rubros')
      .select('id, nombre')
      .ilike('nombre', `%${termClean}%`)
      .limit(5)
      .then(({ data }) => ({ source: 'exact', data: data || [] }));

    const pKeywords = supabase
      .from('palabras_clave')
      .select('rubro_id, keyword, rubros ( id, nombre )')
      .ilike('keyword', `%${termClean}%`)
      .limit(5)
      .then(({ data }) => ({ source: 'keyword', data: data || [] }));

    const pVectorial = fetch(`/api/search-semantic?term=${encodeURIComponent(termClean)}`)
      .then(res => res.ok ? res.json() : { results: [] })
      .then(data => ({ source: 'vector', data: data.results || [] }))
      .catch(() => ({ source: 'vector', data: [] }));

    const [resExacto, resKeywords, resVectorial] = await Promise.all([pExacto, pKeywords, pVectorial]);

    // 1. Procesar Exactos
    resExacto.data.forEach(r => rubrosMap.set(r.id, { ...r, source: 'exact' }));

    // 2. Procesar Keywords
    resKeywords.data.forEach(k => {
      if (k.rubros && !rubrosMap.has(k.rubros.id)) {
        rubrosMap.set(k.rubros.id, { ...k.rubros, source: 'keyword' });
      }
    });

    // 3. Procesar Vectorial (Solo si no tenemos suficientes exactos/keywords)
    if (rubrosMap.size < 2) {
      const semanticIds = resVectorial.data.filter(r => r.rubro_id).map(r => r.rubro_id);
      if (semanticIds.length > 0) {
        const { data: rubrosSem } = await supabase
          .from('rubros')
          .select('id, nombre')
          .in('id', semanticIds);
        
        if (rubrosSem) {
          rubrosSem.forEach(r => {
            if (!rubrosMap.has(r.id)) {
              rubrosMap.set(r.id, { ...r, source: 'vector' });
            }
          });
        }
      }
    }

    return Array.from(rubrosMap.values());
  } catch (e) {
    console.error('Error en detectarContextoRubros:', e);
    return [];
  }
}

/**
 * Busca productos globalmente con estrategia de degradación (A -> B -> C).
 * @param {string} term 
 * @returns {Promise<Array>} Array de productos con datos de negocio
 */
export async function buscarProductosGlobalmente(term) {
  const termClean = String(term || '').trim();
  if (!termClean) return [];

  console.log(`📦 Buscando productos globalmente para: "${termClean}"`);
  let productos = [];
  const ids = new Set();

  try {
    // INTENTO A: Búsqueda Exacta/Parcial (ilike)
    const { data: exactos } = await supabase
      .from('productos')
      .select('*, negocios (id, nombre, rubro_id)')
      .or(`titulo.ilike.%${termClean}%,descripcion.ilike.%${termClean}%`)
      .limit(20);

    if (exactos) {
      exactos.forEach(p => {
        if (!ids.has(p.id)) {
          productos.push(p);
          ids.add(p.id);
        }
      });
    }

    // INTENTO B: Si < 3 resultados, usar FTS (Typos leves)
    if (productos.length < 3) {
      console.log('   ...Pocos productos exactos, activando FTS');
      const { data: fuzzy } = await supabase
        .from('productos')
        .select('*, negocios (id, nombre, rubro_id)')
        .textSearch('titulo', termClean, { type: 'websearch', config: 'spanish' })
        .limit(20);

      if (fuzzy) {
        fuzzy.forEach(p => {
          if (!ids.has(p.id)) {
            productos.push(p);
            ids.add(p.id);
          }
        });
      }
    }

    // INTENTO C: Si < 3 resultados, usar Vectorial (Intención/Typos graves)
    if (productos.length < 3) {
      console.log('   ...Aún pocos productos, activando Búsqueda Vectorial');
      try {
        const semResp = await fetch(`/api/search-semantic-products?term=${encodeURIComponent(termClean)}`);
        if (semResp.ok) {
          const semData = await semResp.json();
          if (semData.results && semData.results.length > 0) {
            // Hidratar datos de negocio
            const productIds = semData.results.map(p => p.id);
            const { data: semProducts } = await supabase
              .from('productos')
              .select('*, negocios (id, nombre, rubro_id)')
              .in('id', productIds);

            if (semProducts) {
              semProducts.forEach(p => {
                if (!ids.has(p.id)) {
                  productos.push(p);
                  ids.add(p.id);
                }
              });
            }
          }
        }
      } catch (err) {
        console.warn('Fallo búsqueda vectorial de productos:', err);
      }
    }

    return productos;
  } catch (e) {
    console.error('Error en buscarProductosGlobalmente:', e);
    return [];
  }
}

// Helper para obtener negocios por lista de rubros (usado en fallback)
export async function obtenerNegociosPorRubro(rubros) {
  if (!rubros || rubros.length === 0) return [];
  const ids = rubros.map(r => r.id);
  const { data } = await supabase
    .from('negocios')
    .select('*')
    .in('rubro_id', ids)
    .limit(20);
  return data || [];
}

// Alias para compatibilidad (si es necesario)
export const buscarNegocioDirecto = async () => null;
export const obtenerProductosDeNegocios = async () => [];
