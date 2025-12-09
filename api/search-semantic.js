import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Inicializamos clientes fuera del handler para reutilizar conexión (Mejor rendimiento)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // --- 1. Definición de CORS (Adentro para evitar ReferenceError) ---
  const setCors = (response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  // --- 2. Aplicar CORS ---
  setCors(res);

  // Manejo de Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- 3. Lógica de Búsqueda ---
  const term = (req.query?.term) || (req.body && req.body.term) || '';
  
  // Log para depuración en Vercel
  console.log(`🔍 [API] Buscando término: "${term}"`);

  if (!term) {
    return res.status(400).json({ error: 'Falta el término de búsqueda (term)' });
  }

  try {
    // A. Generar Vector con OpenAI
    console.log("🤖 [API] Generando vector...");
    const embResp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: term
    });

    const vector = embResp.data?.[0]?.embedding;
    
    if (!vector) {
      throw new Error("OpenAI no devolvió ningún vector.");
    }

    // B. Buscar en Supabase
    console.log("🗄️ [API] Consultando Supabase match_negocios...");
    
    const { data, error } = await supabase.rpc('match_negocios', {
      query_embedding: vector,
      match_threshold: 0.3, // Umbral bajo para capturar candidatos amplios, filtrado en frontend
      match_count: 10
    });

    if (error) {
      console.error('❌ [API] Error Supabase:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`🎉 [API] Encontrados: ${data?.length || 0} resultados.`);
    
    return res.status(200).json({ results: data || [] });

  } catch (err) {
    console.error('💥 [API] Error General:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}