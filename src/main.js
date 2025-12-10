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
 * Calcula puntajes de relevancia
 */
function calculateScoring(term, businesses, categories, products) {
  const termLower = term.toLowerCase();
  const detectedRubroIds = new Set(categories.map(c => c.id));
  
  let candidates = [];

  // Score Negocios
  businesses.forEach(b => {
    let score = 0;
    if (b.nombre.toLowerCase() === termLower) score = 100;
    else if (b.nombre.toLowerCase().startsWith(termLower)) score = 90;
    else score = 70;
    
    candidates.push({ type: 'business', data: b, score });
  });

  // Score Rubros (Solo para determinar ganador, no se renderizan directo)
  categories.forEach(c => {
    let score = 80; // Base alta para rubros
    if (c.nombre.toLowerCase() === termLower) score = 95;
    candidates.push({ type: 'category', data: c, score });
  });

  // Score Productos
  products.forEach(p => {
    let score = 60; // Base
    
    // Boost de Coherencia (+40 pts)
    if (p.negocios && detectedRubroIds.has(p.negocios.rubro_id)) {
      score += 40; // Total 100
      p.hasContextBoost = true;
    }

    // Match exacto título
    if (p.titulo.toLowerCase().includes(termLower)) {
      score += 10;
    }

    candidates.push({ type: 'product', data: p, score });
  });

  // Ordenar
  candidates.sort((a, b) => b.score - a.score);
  
  // Separar listas ordenadas para renderizado
  const rankedProducts = candidates
    .filter(c => c.type === 'product')
    .map(c => c.data); // Ya están ordenados por el sort general si el score es comparable, pero mejor reordenar localmente
  
  // Reordenar productos específicamente
  rankedProducts.sort((a, b) => {
    const scoreA = (a.hasContextBoost ? 100 : 60);
    const scoreB = (b.hasContextBoost ? 100 : 60);
    return scoreB - scoreA;
  });

  const rankedBusinesses = candidates
    .filter(c => c.type === 'business')
    .map(c => c.data);

  return {
    winner: candidates.length > 0 ? candidates[0] : { type: 'none', score: 0 },
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


