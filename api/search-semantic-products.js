import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Inicializamos clientes fuera del handler para reutilizar conexión
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // --- CORS Headers ---
  const setCors = (response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  setCors(res);

  // Manejo de Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- Validación de término ---
  const term = (req.query?.term) || (req.body && req.body.term) || '';
  
  console.log(`🔍 [API] Búsqueda semántica de productos: "${term}"`);

  if (!term) {
    return res.status(400).json({ error: 'Falta el término de búsqueda (term)' });
  }

  try {
    // A. Generar Vector con OpenAI
    console.log("🤖 [API] Generando vector para producto...");
    const embResp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: term
    });

    const vector = embResp.data?.[0]?.embedding;
    
    if (!vector) {
      throw new Error("OpenAI no devolvió ningún vector.");
    }

    // B. Buscar en Supabase usando match_productos RPC
    console.log("🗄️ [API] Consultando Supabase match_productos...");
    
    const { data, error } = await supabase.rpc('match_productos', {
      query_embedding: vector,
      match_threshold: 0.3, // Umbral bajo para capturar candidatos amplios, filtrado en frontend
      match_count: 10
    });

    if (error) {
      console.error('❌ [API] Error Supabase:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`🎉 [API] Encontrados: ${data?.length || 0} productos semánticos.`);
    
    return res.status(200).json({ results: data || [] });

  } catch (err) {
    console.error('💥 [API] Error General:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
