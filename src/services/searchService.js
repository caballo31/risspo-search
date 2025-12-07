import { supabase } from '../api/supabase.js';

/**
 * Busca productos por título
 */
export async function searchProductos(term) {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select(`
        *,
        negocios (
          id,
          nombre,
          direccion,
          telefono,
          whatsapp,
          estado,
          logo_url
        )
      `)
      .ilike('titulo', `%${term}%`)
      .eq('disponible', true);
    
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
      .from('palabras_clave')
      .select('rubro_asociado')
      .ilike('keyword', `%${term}%`)
      .limit(1);
    
    if (error) throw error;
    return data && data.length > 0 ? data[0].rubro_asociado : null;
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
    const { data, error } = await supabase
      .from('negocios')
      .select('*')
      .ilike('rubro', `%${rubro}%`);
    
    if (error) throw error;
    return data;
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

