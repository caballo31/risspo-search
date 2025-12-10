import { supabase } from '../api/supabase.js';

// =====================================================================
// PASO 1: BÚSQUEDA DE NEGOCIOS CANDIDATOS (Paralelizable)
// =====================================================================

/**
 * Busca negocios por nombre (ilike exacto y FTS)
 * Retorna una lista de candidatos, NO se detiene en el primero.
 * @param {string} term Término de búsqueda
 * @returns {Array} Array de objetos negocio
 */
export async function buscarNegociosCandidatos(term) {
  try {
    const termClean = String(term || '').trim();
    console.log(`\n📍 PASO 1: Buscando candidatos de negocio para "${term}"...`);

    // Ejecutar ilike y FTS en paralelo si es posible, o secuencial rápido
    // Aquí usaremos una estrategia combinada
    
    // 1. Búsqueda parcial (ilike)
    const queryIlike = supabase
      .from('negocios')
      .select('*')
      .ilike('nombre', `%${termClean}%`)
      .limit(5);

    // 2. Búsqueda difusa (FTS)
    const queryFts = supabase
      .from('negocios')
      .select('*')
      .textSearch('nombre', termClean, { type: 'websearch', config: 'spanish' })
      .limit(5);

    const [resIlike, resFts] = await Promise.all([queryIlike, queryFts]);

    const candidatos = new Map();

    if (resIlike.data) {
      resIlike.data.forEach(n => candidatos.set(n.id, n));
    }
    
    if (resFts.data) {
      resFts.data.forEach(n => {
        if (!candidatos.has(n.id)) candidatos.set(n.id, n);
      });
    }

    const resultados = Array.from(candidatos.values());
    console.log(`   ✅ Candidatos encontrados: ${resultados.length}`);
    return resultados;

  } catch (error) {
    console.error('Error en buscarNegociosCandidatos:', error);
    return [];
  }
}

// =====================================================================
// PASO 2: DETECCIÓN DE CONTEXTO DE RUBROS (Paralela)
// =====================================================================

/**
 * Detecta el contexto de rubros ejecutando 3 estrategias en PARALELO.
 * Retorna un array de objetos rubro únicos.
 */
export async function detectarContextoDeRubros(termino) {
  const terminoNorm = termino.toLowerCase().trim();
  const resultadosMap = new Map(); // Map<id, {id, nombre, score, tipo}>

  console.log(`🔍 Detectando contexto (PARALELO) para: "${termino}"`);

  try {
    // Definir las 3 promesas de búsqueda
    
    // 1. DB: Match Exacto/Parcial en Rubros
    const pRubrosDB = supabase
      .from('rubros')
      .select('id, nombre')
      .or(`nombre.ilike.%${terminoNorm}%`) // ilike con wildcards
      .limit(5)
      .then(({ data }) => ({ type: 'db_rubro', data }));

    // 1.5 DB: FTS en Rubros (para typos)
    const pRubrosFTS = supabase
      .from('rubros')
      .select('id, nombre')
      .textSearch('nombre', terminoNorm, { type: 'websearch', config: 'spanish' })
      .limit(5)
      .then(({ data }) => ({ type: 'db_fts', data }));

    // 2. DB: Keywords
    const pKeywords = supabase
      .from('palabras_clave')
      .select('rubro_id, keyword, rubros ( id, nombre )')
      .ilike('keyword', `%${terminoNorm}%`)
      .limit(5)
      .then(({ data }) => ({ type: 'db_keyword', data }));

    // 3. API: Semántica
    const pSemantico = fetch(`/api/search-semantic?term=${encodeURIComponent(termino)}`)
      .then(res => res.ok ? res.json() : { results: [] })
      .then(data => ({ type: 'api_semantic', data: data.results }))
      .catch(err => {
        console.warn('⚠️ Fallo API Semántica:', err);
        return { type: 'api_semantic', data: [] };
      });

    // EJECUCIÓN PARALELA
    const results = await Promise.all([pRubrosDB, pRubrosFTS, pKeywords, pSemantico]);

    // PROCESAMIENTO DE RESULTADOS
    
    // Procesar DB Rubros (Exacto/Parcial)
    if (results[0].data) {
      results[0].data.forEach(r => {
        resultadosMap.set(r.id, { ...r, score: 100, tipo: 'exacto' });
      });
    }

    // Procesar DB FTS (Typos)
    if (results[1].data) {
      results[1].data.forEach(r => {
        if (!resultadosMap.has(r.id)) {
          resultadosMap.set(r.id, { ...r, score: 95, tipo: 'fuzzy' });
        }
      });
    }

    // Procesar Keywords
    if (results[2].data) {
      results[2].data.forEach(k => {
        if (k.rubros && !resultadosMap.has(k.rubros.id)) {
          resultadosMap.set(k.rubros.id, { 
            id: k.rubros.id, 
            nombre: k.rubros.nombre, 
            score: 85, 
            tipo: 'keyword' 
          });
        }
      });
    }

    // Procesar Semántico
    const semanticData = results[3].data;
    if (semanticData && semanticData.length > 0) {
      const rubroIds = semanticData.filter(r => r.rubro_id).map(r => r.rubro_id);
      
      if (rubroIds.length > 0) {
        // Necesitamos los nombres de estos rubros si no vinieron en la API
        // Hacemos un fetch rápido a DB para completar info
        const { data: rubrosSem } = await supabase
          .from('rubros')
          .select('id, nombre')
          .in('id', rubroIds);

        if (rubrosSem) {
          rubrosSem.forEach(r => {
            if (!resultadosMap.has(r.id)) {
              const originalResult = semanticData.find(res => res.rubro_id === r.id);
              const similarity = originalResult ? originalResult.similarity : 0.7;
              resultadosMap.set(r.id, {
                id: r.id,
                nombre: r.nombre,
                score: similarity * 100, 
                tipo: 'semantico'
              });
            }
          });
        }
      }
    }

  } catch (err) {
    console.error('Error en detección de contexto:', err);
  }

  return Array.from(resultadosMap.values()).sort((a, b) => b.score - a.score);
}

// ==========================================
// 3. RECUPERACIÓN DE NEGOCIOS (POR ID)
// ==========================================

export async function obtenerNegociosPorRubro(contextoRubros) {
  if (!contextoRubros?.length) return [];

  const ids = contextoRubros.map(r => r.id);
  
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
// 4. RECUPERACIÓN DE PRODUCTOS (HÍBRIDA)
// ==========================================

/**
 * Obtiene productos de una lista de negocios.
 * @param {string} termino Término de búsqueda
 * @param {Array} negocios Array de objetos negocio
 * @param {boolean} esBusquedaCategoria Si es true, trae productos destacados sin filtrar por nombre
 */
export async function obtenerProductosDeNegocios(termino, negocios, esBusquedaCategoria = false) {
  if (!negocios?.length) return [];

  const negocioIds = negocios.map(n => n.id);
  if (negocioIds.length === 0) return [];

  console.log(`📦 Buscando productos en ${negocios.length} negocios. Modo Categoría: ${esBusquedaCategoria}`);

  try {
    let data = [];
    let error = null;

    if (esBusquedaCategoria) {
      // ESTRATEGIA A: Modo Categoría (ej: "Farmacia")
      // Traer productos destacados o genéricos de esos negocios
      // No filtramos por título porque el usuario busca el rubro, no un producto llamado "Farmacia"
      const result = await supabase
        .from('productos')
        .select('*, negocios (nombre, rubro_id)') 
        .in('negocio_id', negocioIds)
        .limit(50); // Traer un mix de productos
      
      data = result.data;
      error = result.error;

    } else {
      // ESTRATEGIA B: Modo Producto (ej: "Ibuprofeno")
      // Filtrar por título/descripción
      
      // 1. ilike
      let result = await supabase
        .from('productos')
        .select('*, negocios (nombre, rubro_id)') 
        .in('negocio_id', negocioIds)
        .or(`titulo.ilike.%${termino}%,descripcion.ilike.%${termino}%`)
        .limit(50);
      
      data = result.data;
      error = result.error;

      // 2. Fallback FTS si pocos resultados
      if (!error && (!data || data.length < 3)) {
        console.log('   ...Pocos resultados ilike, intentando FTS en productos');
        const ftsResult = await supabase
          .from('productos')
          .select('*, negocios (nombre, rubro_id)')
          .in('negocio_id', negocioIds)
          .textSearch('titulo', termino, { type: 'websearch', config: 'spanish' })
          .limit(50);
          
        if (!ftsResult.error && ftsResult.data && ftsResult.data.length > 0) {
          // Combinar resultados evitando duplicados
          const existingIds = new Set(data.map(p => p.id));
          ftsResult.data.forEach(p => {
            if (!existingIds.has(p.id)) data.push(p);
          });
        }
      }
      
      // 3. Fallback Vectorial de Productos (Si sigue habiendo pocos)
      if (!error && (!data || data.length < 2)) {
         console.log('   ...Muy pocos resultados, intentando búsqueda vectorial de productos');
         try {
            const semanticProdResp = await fetch(`/api/search-semantic-products?term=${encodeURIComponent(termino)}`);
            if (semanticProdResp.ok) {
                const semData = await semanticProdResp.json();
                if (semData.results) {
                    // Filtrar solo los que pertenecen a los negocios identificados
                    const semFiltered = semData.results.filter(p => negocioIds.includes(p.negocio_id));
                    const existingIds = new Set(data.map(p => p.id));
                    semFiltered.forEach(p => {
                        if (!existingIds.has(p.id)) data.push(p);
                    });
                }
            }
         } catch (e) { console.warn('Fallo vector productos', e); }
      }
    }

    if (error) {
      console.error('Error obteniendo productos:', error);
      return [];
    }

    return data || [];

  } catch (err) {
    console.error('Excepción en obtenerProductosDeNegocios:', err);
    return [];
  }
}

// Alias para compatibilidad
export const buscarNegocioDirecto = async (t) => (await buscarNegociosCandidatos(t))[0] || null;
export const obtenerProductosPorRubro = (t, r) => obtenerProductosDeNegocios(t, [], false); // Stub
export const obtenerTodosProductosDelRubro = async () => []; // Stub

// Stubs legacy
export async function searchProductos(query) { return []; }
export async function searchProductosSemantic(query) { return []; }
export async function searchPalabrasClave(query) { return []; }
export async function searchNegociosByRubro(rubro) { return []; }
export async function searchNegociosByNombre(nombre) { return []; }
export async function searchSemantic(query) { return []; }