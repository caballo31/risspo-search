import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Usar la URL y SERVICE ROLE key en el entorno de Vercel (no usar anon key)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const term = (req.query?.term) || (req.body && req.body.term) || '';
  if (!term) {
    res.status(400).json({ error: 'Missing term' });
    return;
  }

  try {
    // Vectorizar el término
    const embResp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: term
    });

    const vector = embResp.data?.[0]?.embedding;
    if (!vector) {
      res.status(500).json({ error: 'No embedding returned' });
      return;
    }

    // Llamar al RPC match_negocios en Supabase
    const { data, error } = await supabase.rpc('match_negocios', {
      query_embedding: vector,
      match_threshold: 0.5,
      match_count: 10
    });

    if (error) {
      console.error('RPC match_negocios error:', error);
      res.status(500).json({ error: error.message || error });
      return;
    }

    res.status(200).json({ results: data || [] });
  } catch (err) {
    console.error('search-semantic error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
