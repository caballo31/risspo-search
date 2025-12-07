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

    // NUEVO: Buscar negocios por rubro directo (prioridad máxima para rubros explícitos)
    const negociosPorRubroDirecto = await searchNegociosByRubro(searchTerm);

    // Nivel siguiente: buscar todos los rubros asociados a la keyword (puede devolver múltiples)
    const rubrosAsociados = await searchPalabrasClave(searchTerm);

    let negociosFromKeywords = [];
    if (Array.isArray(rubrosAsociados) && rubrosAsociados.length > 0) {
      // Si el RPC devolvió rubros, buscar negocios que pertenezcan a cualquiera de esos rubros
      negociosFromKeywords = await searchNegociosByRubro(rubrosAsociados);
    }

    // Unificar resultados: priorizar los negocios por rubro directo, luego los de keywords
    const combined = [];
    const seen = new Set();

    function pushUnique(negociosArray) {
      if (!Array.isArray(negociosArray)) return;
      negociosArray.forEach(n => {
        const key = n.id ?? n.google_place_id ?? JSON.stringify(n);
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(n);
        }
      });
    }

    // Directo primero (si existe)
    pushUnique(negociosPorRubroDirecto);
    // Luego los traídos por palabras clave (pueden superponer)
    pushUnique(negociosFromKeywords);

    if (combined.length > 0) {
      // Si hubo coincidencia directa (primeros) y/o por keywords, renderizar combinado
      let message = '';
      if ((negociosPorRubroDirecto && negociosPorRubroDirecto.length > 0) && (negociosFromKeywords && negociosFromKeywords.length > 0)) {
        message = `Se encontraron locales por rubro y por palabras clave relacionadas.`;
      } else if (negociosFromKeywords && negociosFromKeywords.length > 0) {
        message = `Resultados encontrados en rubros relacionados.`;
      }
      renderNegocios(combined, message);
      navigateTo('view-results-business');
      return;
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

