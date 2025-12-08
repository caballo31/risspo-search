// scripts/generar-vectores.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// --- CONFIGURACIÓN ---
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Usa la Service Role
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error("❌ Faltan variables de entorno en .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// --- DICCIONARIO DE CONCEPTOS (EL CEREBRO) ---
// Esto le enseña a la IA qué significa cada rubro en tu contexto local
const conceptos = {
  // 🍔 COMIDA PREPARADA (Salidas, Delivery, Hambre)
  'pizzeria': 'comida preparada, cena, almuerzo, restaurante, hambre, delivery, pizza, empanadas, comida rapida. NO HERRAMIENTAS.',
  'hamburgueseria': 'comida rapida, cena, almuerzo, restaurante, hambre, burger, papas fritas, panchos, comida al paso.',
  'rotiseria': 'comida para llevar, cena, almuerzo, hambre, viandas, comida casera, milanesas con papas, delivery.',
  'restaurante': 'salir a comer, cena, almuerzo, platos elaborados, gastronomia, reunion amigos, familia, servicio de mesa.',
  'parrilla': 'asado, carne a la parrilla, cena, almuerzo, restaurante, choripan, vacio, costilla. NO VENTA DE PARRILLAS DE HIERRO.',
  'cerveceria': 'bebidas, alcohol, cerveza artesanal, bar, picadas, salida nocturna, amigos, tragos.',
  'cafeteria': 'desayuno, merienda, cafe, medialunas, tostados, reunion, trabajo.',
  'panaderia': 'pan, facturas, desayuno, merienda, tortas, masas, comida al paso.',

  // 🍎 ALIMENTOS Y BEBIDAS (Insumos, Supermercado)
  'supermercado': 'comida, bebida, mercaderia, compras hogar, despensa, fideos, arroz, yerba, limpieza.',
  'almacen': 'kiosco, despensa, comida, bebida, compras diarias, cigarrillos, golosinas, rapido.',
  'verduleria': 'frutas, verduras, papas, cebollas, tomates, ensalada, comida saludable, cocina.',
  'carniceria': 'carne cruda, asado, milanesas, pollo, cerdo, embutidos, cocina.',

  // 🛠️ HOGAR Y CONSTRUCCIÓN (Reparaciones, Obra)
  'ferreteria': 'herramientas, arreglos, reparaciones, tornillos, hogar, construccion, pegamento, clavos, martillos. NO COMIDA.',
  'corralon': 'materiales construccion, obra, cemento, ladrillos, arena, chapas, hierro, albañileria.',
  'pintureria': 'pintura, remodelacion, hogar, pinceles, rodillos, impermeabilizante.',
  'maderera': 'madera, machimbre, tirantes, techos, muebles, carpinteria.',
  'electricidad': 'cables, focos, iluminacion, enchufes, instalaciones electricas, reparaciones.',
  'gasista': 'gas, garrafas, estufas, calefones, reparacion gas, plomeria.',
  'vidrieria': 'vidrios, espejos, ventanas, reparacion vidrios.',
  'muebleria': 'muebles, hogar, camas, mesas, sillas, decoracion.',

  // 🚗 AUTOMOTOR (Mecánica, Repuestos)
  'gomeria': 'reparacion neumaticos, pinchadura, auxilio, ruedas, aire, parches, auto, moto, vehiculo. NO COMIDA.',
  'taller_mecanico': 'reparacion auto, mecanica, servicio tecnico, arreglo motor, frenos, vehiculo.',
  'lubricentro': 'cambio aceite, filtros, servicio auto, mantenimiento vehiculo, motor.',
  'repuestos_autos': 'autopartes, repuestos, accesorios auto, bateria, luces coche.',
  'repuestos_motos': 'repuestos moto, accesorios moto, casco, cadena, aceite moto.',

  // 💊 SALUD Y VARIOS
  'farmacia': 'medicamentos, remedios, salud, farmacia de turno, dolor, pastillas, primeros auxilios, perfumeria.',
  'libreria': 'utiles escolares, fotocopias, libros, papel, oficina, regalos.',
  'indumentaria': 'ropa, moda, vestimenta, tienda de ropa, regalos.'
};

async function generarEmbeddings() {
  console.log("🚀 Iniciando proceso de vectorización INTELIGENTE...");

  // Procesamos de a 500 negocios que NO tengan vector (o que hayas puesto en NULL)
  const { data: negocios, error } = await supabase
    .from('negocios')
    .select('id, nombre, rubro, direccion, horarios')
    .is('embedding', null) 
    .limit(1000); // Subimos el límite para agarrar todos

  if (error) return console.error("❌ Error Supabase:", error.message);
  if (!negocios || negocios.length === 0) return console.log("✅ No hay negocios pendientes.");

  console.log(`📦 Procesando ${negocios.length} negocios...`);

  let procesados = 0;

  for (const negocio of negocios) {
    try {
      // 1. Detección Inteligente de Contexto
      let rubroNormalizado = negocio.rubro ? negocio.rubro.toLowerCase().trim() : '';
      let palabrasExtra = conceptos[rubroNormalizado];

      // Si el rubro es "varios" o no existe, intentamos adivinar por el nombre
      if (!palabrasExtra || rubroNormalizado === 'varios') {
        const nombre = negocio.nombre.toLowerCase();
        
        if (nombre.includes('gomeria')) palabrasExtra = conceptos['gomeria'];
        else if (nombre.includes('kiosco') || nombre.includes('drugstore') || nombre.includes('maxi')) palabrasExtra = conceptos['almacen'];
        else if (nombre.includes('taller')) palabrasExtra = conceptos['taller_mecanico'];
        else if (nombre.includes('parrilla')) palabrasExtra = conceptos['parrilla']; 
        else if (nombre.includes('farmacia')) palabrasExtra = conceptos['farmacia'];
        else palabrasExtra = 'comercio local tienda servicios varios';
      }

      // 2. Crear el Texto Rico para la IA
      const textoParaIA = `
        Negocio: ${negocio.nombre}
        Rubro: ${negocio.rubro}
        Categoría y Servicios: ${palabrasExtra}
        Dirección: ${negocio.direccion || ''}
        Horarios: ${JSON.stringify(negocio.horarios) || 'No especificado'}
        Contexto: Local en Chajarí. ${palabrasExtra}.
      `.replace(/\s+/g, ' ').trim();

      // 3. Generar Vector
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textoParaIA,
      });
      const vector = response.data[0].embedding;

      // 4. Guardar
      await supabase
        .from('negocios')
        .update({ embedding: vector })
        .eq('id', negocio.id);

      procesados++;
      if (procesados % 10 === 0) process.stdout.write(`.`); 

    } catch (err) {
      console.error(`\n⚠️ Error ID ${negocio.id}:`, err.message);
    }
  }

  console.log(`\n🎉 Finalizado. ${procesados} vectores generados.`);
}

generarEmbeddings();