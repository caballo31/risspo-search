require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Configuración de clientes
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error("❌ Error: Faltan variables en el archivo .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

async function generarEmbeddingsProductos() {
  console.log("🚀 Iniciando vectorización de PRODUCTOS...");

  // 1. Buscamos productos sin vector
  // MODIFICACIÓN CLAVE: Hacemos un JOIN profundo para traer el nombre del rubro oficial
  // productos -> negocios -> rubros (nombre)
  const { data: productos, error } = await supabase
    .from('productos')
    .select(`
      id, 
      titulo, 
      descripcion, 
      precio,
      negocio_id,
      negocios (
        id, 
        nombre, 
        direccion,
        rubros ( nombre )
      )
    `)
    .is('embedding', null)
    .limit(500); // Procesamos de a 500 para seguridad

  if (error) {
    console.error("❌ Error consultando productos:", error.message);
    return;
  }

  if (!productos || productos.length === 0) {
    console.log("✅ No hay productos pendientes de vectorizar.");
    return;
  }

  console.log(`📦 Encontrados ${productos.length} productos sin vector.`);
  let procesados = 0;

  for (const prod of productos) {
    try {
      const negocio = prod.negocios || { nombre: '', direccion: '' };
      
      // Obtener el nombre del rubro desde la relación (si existe) o usar fallback
      // Esto arregla el problema de "texto sucio"
      const nombreRubro = negocio.rubros?.nombre || 'Comercio Local';

      // 2. CREACIÓN DEL CONTEXTO
      // Este texto es lo que la IA "lee" para entender qué es el producto
      const textoParaIA = `
        Producto: ${prod.titulo}
        Descripción: ${prod.descripcion || ''}
        Precio: ${prod.precio ? '$'+prod.precio : 'Consultar'}
        
        Vendido en: ${negocio.nombre}
        Rubro del Local: ${nombreRubro}
        Ubicación: ${negocio.direccion || 'Chajarí'}
      `.replace(/\s+/g, ' ').trim();

      // 3. Generar Vector con OpenAI
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textoParaIA,
      });
      
      const vector = response.data[0].embedding;

      // 4. Guardar vector en Supabase
      const { error: updateError } = await supabase
        .from('productos')
        .update({ embedding: vector })
        .eq('id', prod.id);

      if (updateError) throw updateError;

      procesados++;
      process.stdout.write(`.`); // Feedback visual

    } catch (err) {
      console.error(`\n⚠️ Falló producto ID ${prod.id}:`, err.message);
    }
  }

  console.log(`\n🎉 ¡Listo! ${procesados} productos vectorizados con la nueva estructura.`);
}

generarEmbeddingsProductos();