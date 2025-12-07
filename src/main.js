import './style.css';
import { navigateTo, goBack } from './utils/navigation.js';
import { getSearchTerm, updateSearchInputs, clearResults, showLoadingState, showNoResults } from './utils/dom.js';
import { searchProductos, searchPalabrasClave, searchNegociosByRubro, searchNegociosByNombre } from './services/searchService.js';
import { renderProductos, renderNegocios } from './components/renderer.js';

// Exponer funciones globalmente para onclick handlers en HTML
window.navigateTo = navigateTo;
window.goBack = goBack;
window.performSearch = performSearch;
window.searchByCategory = searchByCategory;
window.handleSearchKeyPress = handleSearchKeyPress;

/**
 * Maneja la búsqueda principal con lógica en cascada
 */
async function performSearch() {
  const searchTerm = getSearchTerm();
  
  if (!searchTerm) {
    alert('Por favor, ingresa un término de búsqueda');
    return;
  }

  // Sincronizar inputs
  updateSearchInputs(searchTerm);

  // Limpiar mensajes y contenedores
  clearResults();
  showLoadingState();

  try {
    // Nivel 1: Productos
    const productos = await searchProductos(searchTerm);
    if (productos && productos.length > 0) {
      renderProductos(productos);
      navigateTo('view-results-product');
      return;
    }

    // NUEVO Nivel 2: Búsqueda directa por rubro (usar término tal cual)
    const negociosPorRubroDirecto = await searchNegociosByRubro(searchTerm);
    if (negociosPorRubroDirecto && negociosPorRubroDirecto.length > 0) {
      renderNegocios(negociosPorRubroDirecto);
      navigateTo('view-results-business');
      return;
    }

    // Nivel 3: Palabras clave (diccionario) -> si sugiere un rubro distinto al término, probar ese rubro
    const rubroAsociado = await searchPalabrasClave(searchTerm);
    if (rubroAsociado && String(rubroAsociado).trim().toLowerCase() !== String(searchTerm).trim().toLowerCase()) {
      const negociosPorRubro = await searchNegociosByRubro(rubroAsociado);
      if (negociosPorRubro && negociosPorRubro.length > 0) {
        const message = `No encontramos "${searchTerm}", pero estos locales del rubro ${rubroAsociado} suelen tenerlo`;
        renderNegocios(negociosPorRubro, message);
        navigateTo('view-results-business');
        return;
      }
    }

    // Nivel 4: Nombre de negocio
    const negociosPorNombre = await searchNegociosByNombre(searchTerm);
    if (negociosPorNombre && negociosPorNombre.length > 0) {
      renderNegocios(negociosPorNombre);
      navigateTo('view-results-business');
      return;
    }

    // Fallback: sin resultados
    showNoResults(searchTerm);
    navigateTo('view-results-product');

  } catch (error) {
    console.error('Error en la búsqueda:', error);
    alert('Ocurrió un error al realizar la búsqueda. Por favor, intenta nuevamente.');
  }
}

/**
 * Busca negocios por categoría/rubro
 */
async function searchByCategory(category) {
  updateSearchInputs(category);
  clearResults();
  showLoadingState();
  
  try {
    const negocios = await searchNegociosByRubro(category);
    if (negocios && negocios.length > 0) {
      renderNegocios(negocios);
      navigateTo('view-results-business');
    } else {
      showNoResults(category);
      navigateTo('view-results-business');
    }
  } catch (error) {
    console.error('Error en búsqueda por categoría:', error);
    alert('Ocurrió un error al realizar la búsqueda.');
  }
}

/**
 * Maneja el evento de tecla Enter en los inputs
 */
function handleSearchKeyPress(event) {
  if (event.key === 'Enter') {
    performSearch();
  }
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  // Limpiar contenedores al iniciar
  clearResults();
  
  // Configurar vistas iniciales
  document.querySelectorAll('.view-section').forEach(el => {
    if(el.id !== 'view-home') el.classList.add('hidden');
  });
});

