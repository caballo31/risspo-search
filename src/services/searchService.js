import { supabase } from '../api/supabase.js';

/**
 * Busca productos por título
 */
export async function searchProductos(term) {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*, negocios(*)')
      .ilike('titulo', `%${term}%`);
    
    if (error) throw error;
    return data;
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
    const { data, error } = await supabase
      .rpc('buscar_keywords', { busqueda: term });

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Extraer todos los rubros asociados y devolver una lista única
    const rubros = data
      .map(r => r.rubro_asociado)
      .filter(Boolean)
      .map(r => String(r).trim())
      .filter((v, i, a) => a.indexOf(v) === i);

    return rubros;
  } catch (error) {
    console.error('Error buscando palabras clave:', error);
    return null;
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

