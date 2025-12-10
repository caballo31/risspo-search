import './style.css';
import { navigateTo, goBack } from './utils/navigation.js';
import { getSearchTerm, updateSearchInputs, clearResults, showLoadingState, showNoResults, renderSkeletonLoader } from './utils/dom.js';
import { 
  buscarNegociosCandidatos, 
  detectarContextoRubros, 
  buscarProductosGlobalmente,
  obtenerNegociosPorRubro
} from './services/searchService.js';
import { renderProductos, renderNegocios, createBusinessCard } from './components/renderer.js';

// Exponer funciones globalmente
window.navigateTo = navigateTo;
window.goBack = goBack;
window.performSearch = performSearch;
window.searchByCategory = searchByCategory;
window.handleSearchKeyUp = handleSearchKeyUp;

/**
 * ORQUESTADOR DE BÚSQUEDA FEDERADA CON SCORING
 */
async function performSearch() {
  const searchTerm = getSearchTerm();
  
  if (!searchTerm) {
    alert('Por favor, ingresa un término de búsqueda');
    return;
  }

  updateSearchInputs(searchTerm);
  clearResults();
  showLoadingState();
  navigateTo('view-results-product');
  renderSkeletonLoader();

  try {
    console.log(`\n🏁 ORQUESTADOR: Iniciando búsqueda para "${searchTerm}"`);

    // 1. EJECUCIÓN PARALELA
    const [negocios, rubros, productos] = await Promise.all([
      buscarNegociosCandidatos(searchTerm),
      detectarContextoRubros(searchTerm),
      buscarProductosGlobalmente(searchTerm)
    ]);

    console.log(`   📊 Resultados Raw: ${negocios.length} Negocios, ${rubros.length} Rubros, ${productos.length} Productos`);

    // 2. SCORING Y RANKING
    const { winner, rankedProducts, rankedBusinesses } = calculateScoring(searchTerm, negocios, rubros, productos);

    console.log(`   🏆 Ganador: ${winner.type} (Score: ${winner.score})`);

    // 3. DECISIÓN DE RENDERIZADO

    // CASO A: NEGOCIO ÚNICO Y FUERTE (>90 pts)
    if (winner.type === 'business' && winner.score > 90) {
      console.log('👉 Acción: Mostrar Perfil de Negocio');
      // Filtrar productos de este negocio específico
      const businessProducts = productos.filter(p => p.negocio_id === winner.data.id);
      renderBusinessProfileView(winner.data, businessProducts);
      return;
    }

    // CASO B: PRODUCTOS GANADORES (o Default)
    if (rankedProducts.length > 0) {
      console.log('👉 Acción: Mostrar Lista de Productos + Fallback Negocios');
      
      // FALLBACK DE SEGURIDAD: Siempre mostrar negocios recomendados abajo
      let negociosRecomendados = [...rankedBusinesses];
      
      // Si tenemos rubros detectados pero pocos negocios directos, traemos más negocios de esos rubros
      if (negociosRecomendados.length < 3 && rubros.length > 0) {
        const extraNegocios = await obtenerNegociosPorRubro(rubros);
        // Merge evitando duplicados
        const ids = new Set(negociosRecomendados.map(n => n.id));
        extraNegocios.forEach(n => {
          if (!ids.has(n.id)) {
            negociosRecomendados.push(n);
            ids.add(n.id);
          }
        });
      }

      renderProductListView(rankedProducts, negociosRecomendados, searchTerm);
      return;
    }

    // CASO C: SOLO RUBROS/NEGOCIOS (Sin productos)
    // Si no hay productos pero sí detectamos intención de rubro o negocios parciales
    const allBusinesses = [...rankedBusinesses];
    if (allBusinesses.length === 0 && rubros.length > 0) {
       // Si solo tenemos rubros, buscar sus negocios
       const extra = await obtenerNegociosPorRubro(rubros);
       allBusinesses.push(...extra);
    }

    if (allBusinesses.length > 0) {
      console.log('👉 Acción: Mostrar Lista de Negocios (Fallback)');
      renderCategoryView(rubros[0] || { nombre: searchTerm }, allBusinesses);
      return;
    }

    // CASO D: SIN RESULTADOS
    console.log('❌ Sin resultados relevantes.');
    showNoResults(searchTerm);

  } catch (error) {
    console.error('❌ Error en orquestador:', error);
    alert('Ocurrió un error al realizar la búsqueda.');
  }
}

/**
 * Calcula puntajes de relevancia con lógica avanzada de Núcleo/Periferia
 */
function calculateScoring(term, businesses, categories, products) {
  const termLower = term.toLowerCase();
  const termSingular = termLower.endsWith('s') ? termLower.slice(0, -1) : termLower;

  // Mapas de contexto para Boost
  const nucleoRubroIds = new Set(categories.filter(c => c.tipo === 'nucleo').map(c => c.id));
  const periferiaRubroIds = new Set(categories.filter(c => c.tipo === 'periferia').map(c => c.id));
  
  let candidates = [];

  // --- 1. SCORING NEGOCIOS ---
  businesses.forEach(b => {
    let score = 50; // Base
    const nombreLower = b.nombre.toLowerCase();

    // Match Nombre
    if (nombreLower === termLower) score += 50; // Exacto (100)
    else if (nombreLower.startsWith(termLower)) score += 40; // Prefijo (90)
    else if (nombreLower.includes(termLower)) score += 20; // Parcial (70)

    // Boost por Rubro Relacionado (Si el negocio pertenece a un rubro núcleo)
    if (nucleoRubroIds.has(b.rubro_id)) score += 15;

    candidates.push({ type: 'business', data: b, score });
  });

  // --- 2. SCORING RUBROS ---
  categories.forEach(c => {
    // El score ya viene calculado desde el servicio (100 nucleo, <90 periferia)
    // Lo usamos directamente para competir por el "Winner"
    candidates.push({ type: 'category', data: c, score: c.score });
  });

  // --- 3. SCORING PRODUCTOS ---
  products.forEach(p => {
    let score = 50; // Base
    const tituloLower = p.titulo.toLowerCase();

    // A. Match Texto Título
    if (tituloLower.includes(termLower) || tituloLower.includes(termSingular)) {
      score += 40; // Match fuerte de texto
    }

    // B. Match Vectorial (Si existe similarity en el objeto producto)
    // Asumimos que si vino por vector search, tiene propiedad 'similarity'
    if (p.similarity) {
      score += (p.similarity * 30); 
    }

    // C. BOOST RUBRO (La Clave)
    if (p.negocios) {
      if (nucleoRubroIds.has(p.negocios.rubro_id)) {
        score += 50; // BOOST NÚCLEO: Coherencia total (Hamburguesa en Hamburguesería)
        p.boostType = 'nucleo';
      } else if (periferiaRubroIds.has(p.negocios.rubro_id)) {
        score += 10; // BOOST PERIFERIA: Contexto semántico débil
        p.boostType = 'periferia';
      }
    }

    candidates.push({ type: 'product', data: p, score });
  });

  // --- 4. ORDENAMIENTO Y LIMPIEZA ---
  
  // Filtrar ruido (score < 40)
  candidates = candidates.filter(c => c.score >= 40);

  // Ordenar globalmente
  candidates.sort((a, b) => b.score - a.score);
  
  // Separar listas para renderizado
  const rankedProducts = candidates
    .filter(c => c.type === 'product')
    .map(c => c.data);
  
  // Ordenar Negocios: Priorizar los que son del Rubro Núcleo
  const rankedBusinesses = candidates
    .filter(c => c.type === 'business')
    .map(c => c.data)
    .sort((a, b) => {
      const isNucleoA = nucleoRubroIds.has(a.rubro_id) ? 1 : 0;
      const isNucleoB = nucleoRubroIds.has(b.rubro_id) ? 1 : 0;
      // Si uno es núcleo y el otro no, gana el núcleo
      if (isNucleoA !== isNucleoB) return isNucleoB - isNucleoA;
      // Si no, por score normal
      return b.score - a.score; // Nota: b.score no existe en 'data', hay que usar el map original o inyectar score en data.
      // Corrección: El sort anterior ya ordenó por score, aquí solo refinamos por rubro.
      // Pero como map(c => c.data) pierde el score wrapper, el sort aquí no tiene acceso al score calculado arriba.
      // Mejor estrategia: Inyectar score en data temporalmente o confiar en el sort global.
      // Confiaremos en el sort global pero aplicaremos un re-sort ligero por rubro.
    });

  // DETECCIÓN DE CATEGORÍA ESTRICTA
  // Si el ganador es una Categoría NÚCLEO (Score 100) y gana por mucho a los productos
  const winner = candidates.length > 0 ? candidates[0] : { type: 'none', score: 0 };
  
  // Si el ganador es una categoría núcleo, forzamos que sea el winner aunque haya productos con 90 pts
  // Excepción: Si el usuario buscó un producto muy específico que matchea texto exacto.
  const topCategory = candidates.find(c => c.type === 'category');
  const topProduct = candidates.find(c => c.type === 'product');

  let finalWinner = winner;

  if (topCategory && topCategory.data.tipo === 'nucleo') {
    // Si hay una categoría núcleo (ej: "Farmacia")
    // Y el mejor producto no tiene un match de texto EXACTO con el término (ej: no buscó "Ibuprofeno")
    // Entonces gana la categoría.
    const termIsProduct = topProduct && topProduct.data.titulo.toLowerCase() === termLower;
    
    if (!termIsProduct) {
      finalWinner = topCategory;
    }
  }

  return {
    winner: finalWinner,
    rankedProducts,
    rankedBusinesses
  };
}

// =====================================================================
// VISTAS
// =====================================================================

function renderBusinessProfileView(business, products) {
  const container = document.getElementById('products-container');
  if (!container) return;
  container.innerHTML = '';
  
  container.appendChild(createBusinessCard(business));

  if (products && products.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'mt-6 mb-4 text-center text-gray-500 font-medium';
    separator.textContent = `Productos en ${business.nombre}:`;
    container.appendChild(separator);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    
    products.forEach(prod => {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500';
      card.innerHTML = `
        <h3 class="font-bold text-lg">${prod.titulo}</h3>
        <p class="text-gray-600 text-sm mt-1">${prod.descripcion || ''}</p>
      `;
      grid.appendChild(card);
    });
    container.appendChild(grid);
  }
  navigateTo('view-results-product');
}

function renderProductListView(products, relatedBusinesses, term) {
  const container = document.getElementById('products-container');
  
  // Renderizar productos
  renderProductos(products);

  // Renderizar Negocios Recomendados (Fallback)
  if (relatedBusinesses.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'mt-10 mb-6 text-center text-gray-500 font-medium border-t pt-6';
    separator.textContent = 'Negocios relacionados con tu búsqueda:';
    container.appendChild(separator);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    relatedBusinesses.slice(0, 6).forEach(b => grid.appendChild(createBusinessCard(b)));
    container.appendChild(grid);
  }
  navigateTo('view-results-product');
}

function renderCategoryView(category, businesses) {
  const container = document.getElementById('products-container');
  if (!container) return;
  container.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'text-2xl font-bold mb-6 text-gray-800';
  title.textContent = `Resultados para "${category.nombre}"`;
  container.appendChild(title);

  if (businesses.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8';
    businesses.forEach(b => grid.appendChild(createBusinessCard(b)));
    container.appendChild(grid);
  } else {
    container.innerHTML += '<p class="text-gray-500">No se encontraron negocios.</p>';
  }
  navigateTo('view-results-product');
}

// =====================================================================
// HELPERS
// =====================================================================

async function searchByCategory(category) {
  updateSearchInputs(category);
  await performSearch();
}

function handleSearchKeyUp(event) {
  if (event.key === 'Enter' || event.keyCode === 13) {
    event.preventDefault();
    event.target.blur(); 
    performSearch();
  }
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  clearResults();
  document.querySelectorAll('.view-section').forEach(el => {
    if(el.id !== 'view-home') el.classList.add('hidden');
  });
  initDynamicPlaceholder();
});

function initDynamicPlaceholder() {
  const input = document.getElementById('search-input-home');
  if (!input) return;
  const placeholders = [
    "¿Qué estás buscando?", "Busca 'Cambio de aceite'...", "Busca 'Tengo hambre'...",
    "Busca 'Tornillo fix'...", "Busca 'Farmacia de turno'...", "Busca 'Hamburguesa completa'..."
  ];
  let index = 0;
  setInterval(() => {
    index = (index + 1) % placeholders.length;
    input.setAttribute('placeholder', placeholders[index]);
  }, 2500);
}


