import './style.css';
import { navigateTo, goBack } from './utils/navigation.js';
import { getSearchTerm, updateSearchInputs, clearResults, showLoadingState, showNoResults, renderSkeletonLoader } from './utils/dom.js';
import { 
  performFederatedSearch, 
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
 * ORQUESTADOR DE BÚSQUEDA FEDERADA
 * Decide qué vista mostrar basándose en el "Ganador" del scoring.
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

    // 1. EJECUTAR BÚSQUEDA FEDERADA
    const { winner, data, stats } = await performFederatedSearch(searchTerm);

    if (!winner) {
      console.log('❌ Sin resultados relevantes.');
      showNoResults(searchTerm);
      return;
    }

    console.log(`🏆 GANADOR: ${winner.type.toUpperCase()} (Score: ${winner.score})`);
    console.log(`   Stats: ${stats.totalBusinesses} negocios, ${stats.totalCategories} rubros, ${stats.totalProducts} productos`);

    // 2. LÓGICA DE DECISIÓN DE VISTA (Decision Tree)

    // CASO A: NEGOCIO ÚNICO Y FUERTE (Score > 90)
    // El usuario buscó exactamente el nombre de un negocio (ej: "McDonalds")
    if (winner.type === 'business' && winner.score > 90) {
      console.log('👉 Acción: Mostrar Perfil de Negocio');
      
      // Filtrar productos que pertenecen a este negocio
      const businessProducts = data.products.filter(p => p.negocio_id === winner.data.id);
      renderBusinessProfileView(winner.data, businessProducts);
      return;
    }

    // CASO B: CATEGORÍA DOMINANTE (Score > 70)
    // El usuario buscó un rubro (ej: "Farmacia", "Hamburguesería")
    // Y NO hay un producto específico que gane por mucho (ej: no buscó "Hamburguesa completa")
    const topProductScore = data.products.length > 0 ? data.products[0].score : 0;
    
    if (winner.type === 'category' && winner.score > 70 && winner.score > topProductScore) {
      console.log('👉 Acción: Mostrar Lista de Negocios (Vista Categoría)');
      
      // Necesitamos traer los negocios de este rubro (la búsqueda federada solo trajo coincidencias de nombre)
      const categoryBusinesses = await obtenerNegociosPorRubro([winner.data]);
      
      renderCategoryView(winner.data, categoryBusinesses, data.products);
      return;
    }

    // CASO C: PRODUCTOS (Default o Ganador)
    // El usuario buscó un producto (ej: "Ibuprofeno", "Tornillo")
    console.log('👉 Acción: Mostrar Lista de Productos');
    renderProductListView(data.products, data.businesses, searchTerm);

  } catch (error) {
    console.error('❌ Error en orquestador:', error);
    alert('Ocurrió un error al realizar la búsqueda.');
  }
}

// =====================================================================
// VISTAS (Renderers Específicos)
// =====================================================================

function renderBusinessProfileView(business, products) {
  const container = document.getElementById('products-container');
  if (!container) return;

  container.innerHTML = '';
  
  // Tarjeta del Negocio
  container.appendChild(createBusinessCard(business));

  // Productos del Negocio
  if (products && products.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'mt-6 mb-4 text-center text-gray-500 font-medium';
    separator.textContent = `Productos en ${business.nombre}:`;
    container.appendChild(separator);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    
    // Usamos renderProductos pero capturamos su output o lo hacemos manual para no borrar el container
    // Aquí simplificamos reutilizando lógica manual rápida
    products.forEach(prod => {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow border-l-4 border-blue-500';
      card.innerHTML = `
        <h3 class="font-bold text-lg">${prod.titulo}</h3>
        <p class="text-gray-600 text-sm mt-1">${prod.descripcion || ''}</p>
        <div class="mt-2 text-xs text-gray-400 font-mono">Relevancia: ${prod.score || 'N/A'}</div>
      `;
      grid.appendChild(card);
    });
    container.appendChild(grid);
  } else {
    const empty = document.createElement('p');
    empty.className = 'text-center text-gray-400 mt-4';
    empty.textContent = 'Este negocio aún no tiene productos cargados.';
    container.appendChild(empty);
  }

  navigateTo('view-results-product');
}

function renderCategoryView(category, businesses, products) {
  const container = document.getElementById('products-container');
  if (!container) return;
  container.innerHTML = '';

  // Título
  const title = document.createElement('h2');
  title.className = 'text-2xl font-bold mb-6 text-gray-800';
  title.textContent = `Negocios de ${category.nombre}`;
  container.appendChild(title);

  // Lista de Negocios
  if (businesses.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8';
    businesses.forEach(b => grid.appendChild(createBusinessCard(b)));
    container.appendChild(grid);
  } else {
    container.innerHTML += '<p class="text-gray-500">No hay negocios en esta categoría.</p>';
  }

  // Productos Destacados (si hay)
  if (products.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'mt-8 mb-4 text-xl font-bold border-t pt-6';
    separator.textContent = 'Productos Relacionados';
    container.appendChild(separator);

    // Renderizar productos (limitado a 6)
    const prodGrid = document.createElement('div');
    prodGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    products.slice(0, 6).forEach(prod => {
       const card = document.createElement('div');
       card.className = 'bg-white rounded-lg shadow-sm p-4 border border-gray-100';
       card.innerHTML = `
         <h3 class="font-bold text-md">${prod.titulo}</h3>
         <div class="text-sm text-blue-600 mt-1">En: ${prod.negocios?.nombre || 'Negocio'}</div>
       `;
       prodGrid.appendChild(card);
    });
    container.appendChild(prodGrid);
  }

  navigateTo('view-results-product');
}

function renderProductListView(products, relatedBusinesses, term) {
  const container = document.getElementById('products-container');
  
  if (products.length === 0) {
    showNoResults(term);
    return;
  }

  // Usamos el renderizador estándar de productos
  renderProductos(products);

  // Agregamos negocios relacionados al final si existen
  if (relatedBusinesses.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'mt-10 mb-6 text-center text-gray-500 font-medium border-t pt-6';
    separator.textContent = 'Negocios relacionados con tu búsqueda:';
    container.appendChild(separator);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    relatedBusinesses.forEach(b => grid.appendChild(createBusinessCard(b)));
    container.appendChild(grid);
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


