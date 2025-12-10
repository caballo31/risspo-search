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
// PASO 2: DETECCIÓN DE CONTEXTO DE RUBROS (Búsqueda Expandida)
// =====================================================================

/**
 * Detecta un CONTEXTO de rubros relacionados con el término
 * Devuelve un array de rubros ordenados por prioridad
 * 
 * Estrategia de 2 Círculos:
 * - NÚCLEO (Prioridad 1): Match exacto de rubro o keyword
 * - PERIFERIA (Prioridad 2): Rubros relacionados encontrados vía búsqueda semántica
 * 
 * @param {string} term Término de búsqueda
 * @returns {Array} Array de strings con rubros válidos, o null si no se detectan
 */
export async function detectarContextoDeRubros(term) {
  try {
    const termClean = String(term || '').trim().toLowerCase();
    
    console.log(`\n🔄 PASO 2: Detectando Contexto de Rubros para "${term}"...`);

    // Set para almacenar rubros únicos (evitar duplicados)
    const rubrosSet = new Set();
    
    // ========== NÚCLEO (Prioridad 1) ==========
    console.log('  ⭐ NÚCLEO (Prioridad 1):');
    
    // Método A: Match exacto en tabla rubros
    console.log('    → Método A: Match exacto en rubros...');
    const { data: rubrosExactos, error: errExacto } = await supabase
      .from('rubros')
      .select('*')
      .ilike('nombre', `%${termClean}%`)
      .limit(5);

    if (!errExacto && rubrosExactos && rubrosExactos.length > 0) {
      rubrosExactos.forEach(rubro => {
        rubrosSet.add(rubro.nombre);
        console.log(`      ✅ Rubro exacto: "${rubro.nombre}"`);
      });
    }

    // Método B: Palabras clave
    console.log('    → Método B: Búsqueda en palabras_clave...');
    const { data: keywordMatch, error: errKeyword } = await supabase
      .rpc('buscar_keywords', { busqueda: termClean });

    if (!errKeyword && keywordMatch && keywordMatch.length > 0) {
      keywordMatch.forEach(match => {
        if (match.rubro_asociado) {
          rubrosSet.add(match.rubro_asociado);
          console.log(`      ✅ Rubro de keyword: "${match.rubro_asociado}"`);
        }
      });
    }

    // ========== PERIFERIA (Prioridad 2) ==========
    // Siempre ejecutar búsqueda semántica como COMPLEMENTO, no como fallback
    console.log('  🌍 PERIFERIA (Prioridad 2):');
    console.log('    → Búsqueda semántica vectorial de negocios relacionados...');
    
    try {
      const semanticResp = await fetch(`/api/search-semantic?term=${encodeURIComponent(term)}`);
      if (semanticResp.ok) {
        const semanticData = await semanticResp.json();
        
        if (semanticData.results && semanticData.results.length > 0) {
          const rubrosEncontrados = [];
          
          semanticData.results.forEach(negocio => {
            if (negocio.rubro && negocio.similarity > 0.4) { // Umbral más bajo para periferia
              if (!rubrosSet.has(negocio.rubro)) {
                rubrosSet.add(negocio.rubro);
                rubrosEncontrados.push(negocio.rubro);
                console.log(`      ✅ Rubro relacionado: "${negocio.rubro}" (similitud: ${negocio.similarity.toFixed(3)})`);
              }
            }
          });

          if (rubrosEncontrados.length === 0) {
            console.log(`      ℹ️ No se encontraron rubros relacionados nuevos`);
          }
        }
      }
    } catch (semErr) {
      console.warn('    ⚠️ Búsqueda semántica falló:', semErr.message);
    }

    // Convertir Set a Array
    const contextoRubros = Array.from(rubrosSet);

    if (contextoRubros.length === 0) {
      console.log(`\n❌ PASO 2 FALLIDO: No se detectó contexto de rubros`);
      return null;
    }

    console.log(`\n✅ PASO 2 ÉXITO: Contexto de ${contextoRubros.length} rubro(s) detectado: [${contextoRubros.join(', ')}]`);
    return contextoRubros;

  } catch (error) {
    console.error('Error en detectarContextoDeRubros:', error);
    return null;
  }
}

// =====================================================================
// PASO 3: RECUPERACIÓN DE CONTENIDO (Scopeado al Rubro)
// =====================================================================

/**
 * Obtiene negocios que pertenecen a un contexto de rubros
 * @param {Array|string} rubros Array de nombres de rubros, o string único
 * @returns {Array} Array de negocios ordenados por rubro de entrada
 */
export async function obtenerNegociosPorRubro(rubros) {
  try {
    // Normalizar entrada: aceptar string o array
    const rubrosArray = Array.isArray(rubros) 
      ? rubros 
      : (rubros && typeof rubros === 'string' ? [rubros] : []);

    if (rubrosArray.length === 0) {
      console.warn('❌ Rubros inválidos para obtenerNegociosPorRubro');
      return [];
    }

    console.log(`\n🏪 Obteniendo negocios de contexto [${rubrosArray.join(', ')}]...`);

    // Usar IN para múltiples rubros
    const { data, error } = await supabase
      .from('negocios')
      .select('*')
      .in('rubro', rubrosArray);

    if (error) throw error;

    const result = data || [];
    
    // Ordenar por prioridad de rubro (primero los de Prioridad 1)
    const prioridadMap = {};
    rubrosArray.forEach((r, idx) => {
      prioridadMap[r] = idx;
    });

    result.sort((a, b) => (prioridadMap[a.rubro] ?? 999) - (prioridadMap[b.rubro] ?? 999));

    console.log(`  ✅ Negocios encontrados: ${result.length}`);
    return result;
  } catch (error) {
    console.error('Error en obtenerNegociosPorRubro:', error);
    return [];
  }
}

/**
 * Obtiene productos dentro de un contexto de rubros (Multi-rubro)
 * Estrategia: Primero ilike, luego vectorial (filtrado por contexto de rubros)
 * 
 * Ordenamiento:
 * - Productos de rubros de mayor prioridad (Núcleo) aparecen primero
 * - Luego productos de rubros de menor prioridad (Periferia)
 * 
 * @param {string} term Término de búsqueda
 * @param {Array|string} rubros Array de nombres de rubros, o string único
 * @returns {Array} Array de productos ordenados por relevancia de rubro
 */
export async function obtenerProductosPorRubro(term, rubros) {
  try {
    const termClean = String(term || '').trim();
    
    // Normalizar entrada: aceptar string o array
    const rubrosArray = Array.isArray(rubros) 
      ? rubros 
      : (rubros && typeof rubros === 'string' ? [rubros] : []);

    if (rubrosArray.length === 0) {
      console.warn('❌ Rubros inválidos para obtenerProductosPorRubro');
      return [];
    }

    console.log(`\n📦 PASO 3: Buscando productos para "${term}" en contexto [${rubrosArray.join(', ')}]...`);

    // Crear mapa de prioridades para ordenamiento
    const prioridadMap = {};
    rubrosArray.forEach((r, idx) => {
      prioridadMap[r] = idx;
    });

    // ========== SUB-PASO A: Búsqueda ilike ==========
    console.log('  → Sub-paso A: Búsqueda ilike en productos del contexto...');
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
      .in('negocios.rubro', rubrosArray);

    if (errLiteral) throw errLiteral;

    const resultados = productosLiterales || [];
    console.log(`  ✅ Productos literales encontrados: ${resultados.length}`);

    // ========== SUB-PASO B: Búsqueda Vectorial (Complemento) ==========
    if (resultados.length < 3) {
      console.log('  → Sub-paso B: Complementando con búsqueda vectorial...');
      try {
        const semanticResp = await fetch(`/api/search-semantic-products?term=${encodeURIComponent(term)}`);
        
        if (semanticResp.ok) {
          const semanticData = await semanticResp.json();
          const productosSemanticos = semanticData.results || [];
          
          console.log(`  ✨ Productos semánticos encontrados: ${productosSemanticos.length}`);
          
          // FILTRADO POR CONTEXTO: Solo productos cuyos negocios estén en el contexto
          const seenIds = new Set(resultados.map(p => p.id));
          const semanticosFiltrados = productosSemanticos.filter(p => {
            const esDelContexto = p.negocios && rubrosArray.includes(p.negocios.rubro);
            const noEsDuplicado = !seenIds.has(p.id);
            
            if (!esDelContexto && p.negocios) {
              console.log(`    🚫 Descartado: "${p.titulo}" (rubro: ${p.negocios.rubro}), fuera del contexto [${rubrosArray.join(', ')}]`);
            }
            
            return esDelContexto && noEsDuplicado;
          });
          
          resultados.push(...semanticosFiltrados);
          console.log(`  🔗 Después de fusión: ${resultados.length} productos totales`);
        }
      } catch (semErr) {
        console.warn('  ⚠️ Sub-paso B falló:', semErr.message);
      }
    }

    // ========== ORDENAMIENTO POR PRIORIDAD DE RUBRO ==========
    resultados.sort((a, b) => {
      const prioA = prioridadMap[a.negocios?.rubro] ?? 999;
      const prioB = prioridadMap[b.negocios?.rubro] ?? 999;
      return prioA - prioB;
    });

    console.log(`  🎯 Productos ordenados por prioridad de rubro`);

    return resultados;
  } catch (error) {
    console.error('Error en obtenerProductosPorRubro:', error);
    return [];
  }
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