import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// 1. Definimos la función CORS (¡Esto es lo que faltaba!)
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 2. Configuración de clientes
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Usar Service Role para permisos de lectura/escritura si fuera necesario, o Anon para lectura pública
// En backend es seguro usar Service Role.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 3. El Handler Principal
export default async function handler(req, res) {
  // Aplicamos CORS al principio de todo
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const term = (req.query?.term) || (req.body && req.body.term) || '';
  
  console.log(`🔍 [API] Buscando: "${term}"`);

  if (!term) {
    return res.status(400).json({ error: 'Missing term' });
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
      throw new Error("OpenAI no devolvió vector");
    }

    // B. Buscar en Supabase
    console.log("🗄️ [API] Consultando DB...");
    const { data, error } = await supabase.rpc('match_negocios', {
      query_embedding: vector,
      match_threshold: 0.2, // Umbral bajo para que entren resultados abstractos
      match_count: 10
    });

    if (error) {
      console.error('❌ [API] Error Supabase:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`🎉 [API] Encontrados: ${data?.length || 0}`);
    
    return res.status(200).json({ results: data || [] });

  } catch (err) {
    console.error('💥 [API] Error General:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}