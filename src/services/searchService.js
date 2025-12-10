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
 * Detecta contexto de rubros en paralelo con clasificación NÚCLEO vs PERIFERIA.
 * @param {string} term 
 * @returns {Promise<Array>} Array de objetos rubro {id, nombre, tipo: 'nucleo'|'periferia', score}
 */
export async function detectarContextoRubros(term) {
  const termClean = String(term || '').trim();
  if (!termClean) return [];

  // Normalización básica para plurales (ej: "Farmacias" -> "Farmacia")
  const termSingular = termClean.endsWith('s') ? termClean.slice(0, -1) : termClean;
  
  console.log(`🏷️ Detectando contexto para: "${termClean}" (Singular: "${termSingular}")`);
  const rubrosMap = new Map();

  try {
    // Ejecución Paralela de 3 Estrategias
    
    // 1. Match Exacto/Parcial en Rubros (NÚCLEO)
    // Buscamos tanto el término original como el singular
    const pExacto = supabase
      .from('rubros')
      .select('id, nombre')
      .or(`nombre.ilike.%${termClean}%,nombre.ilike.%${termSingular}%`)
      .limit(5)
      .then(({ data }) => ({ source: 'exact', data: data || [] }));

    // 2. Keywords (NÚCLEO)
    const pKeywords = supabase
      .from('palabras_clave')
      .select('rubro_id, keyword, rubros ( id, nombre )')
      .or(`keyword.ilike.%${termClean}%,keyword.ilike.%${termSingular}%`)
      .limit(5)
      .then(({ data }) => ({ source: 'keyword', data: data || [] }));

    // 3. Búsqueda Vectorial (PERIFERIA)
    const pVectorial = fetch(`/api/search-semantic?term=${encodeURIComponent(termClean)}`)
      .then(res => res.ok ? res.json() : { results: [] })
      .then(data => ({ source: 'vector', data: data.results || [] }))
      .catch(() => ({ source: 'vector', data: [] }));

    const [resExacto, resKeywords, resVectorial] = await Promise.all([pExacto, pKeywords, pVectorial]);

    // --- PROCESAMIENTO NÚCLEO (Alta Confianza) ---
    
    // Rubros por nombre
    resExacto.data.forEach(r => {
      rubrosMap.set(r.id, { ...r, tipo: 'nucleo', score: 100 });
    });

    // Rubros por keyword
    resKeywords.data.forEach(k => {
      if (k.rubros && !rubrosMap.has(k.rubros.id)) {
        rubrosMap.set(k.rubros.id, { ...k.rubros, tipo: 'nucleo', score: 90 });
      }
    });

    // --- PROCESAMIENTO PERIFERIA (Contexto Semántico) ---
    
    const semanticIds = resVectorial.data.filter(r => r.rubro_id).map(r => r.rubro_id);
    if (semanticIds.length > 0) {
      const { data: rubrosSem } = await supabase
        .from('rubros')
        .select('id, nombre')
        .in('id', semanticIds);
      
      if (rubrosSem) {
        rubrosSem.forEach(r => {
          // Solo agregamos si no existe ya como núcleo
          if (!rubrosMap.has(r.id)) {
            // Recuperar similarity del resultado vectorial
            const original = resVectorial.data.find(v => v.rubro_id === r.id);
            const similarity = original ? original.similarity : 0;
            
            // Si la similitud es MUY alta (>0.85), podría considerarse casi núcleo
            // Pero por seguridad lo dejamos como periferia fuerte
            rubrosMap.set(r.id, { 
              ...r, 
              tipo: 'periferia', 
              score: similarity * 100 // Escalar 0-1 a 0-100
            });
          }
        });
      }
    }

    return Array.from(rubrosMap.values()).sort((a, b) => b.score - a.score);
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
