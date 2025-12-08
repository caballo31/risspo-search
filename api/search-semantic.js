// ... imports ...

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const term = (req.query?.term) || (req.body && req.body.term) || '';
  
  // 1. LOG DE ENTRADA
  console.log(`🔍 [API] Iniciando búsqueda semántica para: "${term}"`);

  if (!term) {
    console.warn("⚠️ [API] Término vacío recibido");
    res.status(400).json({ error: 'Missing term' });
    return;
  }

  try {
    // 2. LOG ANTES DE OPENAI
    console.log("🤖 [API] Llamando a OpenAI...");
    
    const embResp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: term
    });

    const vector = embResp.data?.[0]?.embedding;
    
    // 3. LOG DESPUÉS DE OPENAI
    if (vector) {
      console.log(`✅ [API] Vector generado (longitud: ${vector.length})`);
    } else {
      console.error("❌ [API] OpenAI no devolvió vector");
    }

    // 4. LOG ANTES DE SUPABASE
    console.log("🗄️ [API] Consultando Supabase match_negocios...");

    const { data, error } = await supabase.rpc('match_negocios', {
      query_embedding: vector,
      match_threshold: 0.3, // Confirma que aquí dice 0.3
      match_count: 10
    });

    if (error) {
      console.error('❌ [API] Supabase Error:', error);
      res.status(500).json({ error: error.message || error });
      return;
    }

    // 5. LOG FINAL
    console.log(`🎉 [API] Supabase encontró ${data?.length || 0} resultados.`);
    
    res.status(200).json({ results: data || [] });

  } catch (err) {
    console.error('💥 [API] Error General:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
}