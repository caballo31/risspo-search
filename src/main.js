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
    // PASO A: Buscar productos directamente
    const productos = await searchProductos(searchTerm);
    
    if (productos && productos.length > 0) {
      renderProductos(productos);
      navigateTo('view-results-product');
      return;
    }

    // PASO B: Buscar en palabras_clave y luego negocios por rubro
    const rubro = await searchPalabrasClave(searchTerm);
    
    if (rubro) {
      const negocios = await searchNegociosByRubro(rubro);
      
      if (negocios && negocios.length > 0) {
        const message = `No encontramos el producto exacto, pero estos locales del rubro ${rubro} suelen tenerlo`;
        renderNegocios(negocios, message);
        navigateTo('view-results-business');
        return;
      }
    }

    // PASO C: Buscar negocios por nombre
    const negocios = await searchNegociosByNombre(searchTerm);
    
    if (negocios && negocios.length > 0) {
      renderNegocios(negocios);
      navigateTo('view-results-business');
      return;
    }

    // No se encontraron resultados
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

