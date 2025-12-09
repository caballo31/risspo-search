// scripts/generar-vectores-productos.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Usamos tus mismas variables de entorno
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
  console.log("🚀 Iniciando vectorización de PRODUCTOS (sin tocar Negocios)...");

  // 1. Buscamos productos que NO tengan vector todavía
  // Hacemos JOIN con negocios para tener el contexto completo
  const { data: productos, error } = await supabase
    .from('productos')
    .select(`
      id, 
      titulo, 
      descripcion, 
      precio,
      negocio_id,
      negocios (id, nombre, rubro, direccion)
    `)
    .is('embedding', null)
    .limit(500); // Lotes seguros

  if (error) return console.error("❌ Error consultando productos:", error.message);
  if (!productos || productos.length === 0) return console.log("✅ No hay productos pendientes de vectorizar.");

  console.log(`📦 Encontrados ${productos.length} productos sin vector.`);
  let procesados = 0;

  for (const prod of productos) {
    try {
      // Manejo de seguridad por si el producto quedó huérfano de negocio
      const negocio = prod.negocios || { nombre: '', rubro: '', direccion: '' };
      
      // 2. CREACIÓN DEL TEXTO RICO (Contexto Producto + Negocio)
      // Esto permite buscar "ferretería martillo" y encontrar el producto aunque no diga ferretería
      const textoParaIA = `
        Producto: ${prod.titulo}
        Descripción: ${prod.descripcion || ''}
        Precio: ${prod.precio ? '$'+prod.precio : 'Consultar'}
        
        Vendido en: ${negocio.nombre}
        Rubro del Local: ${negocio.rubro}
        Ubicación: ${negocio.direccion}
      `.replace(/\s+/g, ' ').trim();

      // 3. Generar Vector con OpenAI
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textoParaIA,
      });
      const vector = response.data[0].embedding;

      // 4. Guardar SOLO en la tabla productos
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

  console.log(`\n🎉 ¡Listo! ${procesados} productos vectorizados.`);
}

generarEmbeddingsProductos();