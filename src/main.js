import './style.css';
import { navigateTo, goBack } from './utils/navigation.js';
import { getSearchTerm, updateSearchInputs, clearResults, showLoadingState, showNoResults, renderSkeletonLoader } from './utils/dom.js';
import { searchProductos, searchPalabrasClave, searchNegociosByRubro, searchNegociosByNombre, searchSemantic } from './services/searchService.js';
import { renderProductos, renderNegocios, createBusinessCard } from './components/renderer.js';

// Exponer funciones globalmente para onclick handlers en HTML
window.navigateTo = navigateTo;
window.goBack = goBack;
window.performSearch = performSearch;
window.searchByCategory = searchByCategory;
window.handleSearchKeyUp = handleSearchKeyUp;

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
  // Mostrar la vista de resultados de productos y un skeleton mientras cargan
  navigateTo('view-results-product');
  renderSkeletonLoader();

  try {
    // Nivel 1: Productos
    const productos = await searchProductos(searchTerm);
    if (productos && productos.length > 0) {
      // Si hay muchos productos, comportamiento normal: mostrar solo productos
      if (productos.length >= 4) {
        renderProductos(productos);
        navigateTo('view-results-product');
        return;
      }

      // Vista Híbrida para pocos productos (1-3): renderizar productos y sugerir locales del mismo rubro
      renderProductos(productos);

      // Intentar obtener el rubro del primer producto
      const firstRubro = productos[0]?.negocios?.rubro;
      let suggestions = [];

      if (firstRubro) {
        const negociosSugeridos = await searchNegociosByRubro(firstRubro);

        // Filtrar para no incluir el mismo negocio donde está el producto (si se puede identificar)
        const productNegocioKey = productos[0]?.negocios?.id ?? productos[0]?.negocios?.google_place_id;
        suggestions = (negociosSugeridos || []).filter(n => {
          const key = n.id ?? n.google_place_id;
          if (!productNegocioKey) return true;
          return key !== productNegocioKey;
        });
      } else {
        // Si no hay rubro en el producto (negocios null), intentar extraer rubros por palabras clave
        const rubrosFromKeywords = await searchPalabrasClave(searchTerm);
        if (Array.isArray(rubrosFromKeywords) && rubrosFromKeywords.length > 0) {
          const negociosFromKeywords = await searchNegociosByRubro(rubrosFromKeywords);
          suggestions = negociosFromKeywords || [];
        } else {
          // Último recurso: buscar negocios por nombre que contenga el término
          const negociosByName = await searchNegociosByNombre(searchTerm);
          suggestions = negociosByName || [];
        }
      }

      // Si hay sugerencias, insertarlas debajo de los productos
      if (suggestions.length > 0) {
        const productsContainer = document.getElementById('products-container');
        if (productsContainer) {
          const separator = document.createElement('div');
          separator.className = 'mt-6 text-center text-gray-500 font-medium';
          separator.textContent = 'También podrías encontrarlo en estos locales:';
          productsContainer.appendChild(separator);

          const sugGrid = document.createElement('div');
          sugGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4';

          // Evitar duplicados por id/place_id
          const seen = new Set();
          suggestions.forEach(negocio => {
            const key = negocio.id ?? negocio.google_place_id ?? JSON.stringify(negocio);
            if (seen.has(key)) return;
            seen.add(key);

            const card = createBusinessCard(negocio);
            sugGrid.appendChild(card);
          });

          productsContainer.appendChild(sugGrid);
        }
      }

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

    // Si hubo coincidencia por rubro/keywords, decidir si devolver o completar
    let businessesToRender = [];

    if (combined.length >= 3) {
      // Suficientes resultados: mostrar y salir
      renderNegocios(combined);
      navigateTo('view-results-business');
      return;
    } else if (combined.length > 0) {
      businessesToRender = combined.slice();
    }

    // Nivel 4: Nombre de negocio
    const negociosPorNombre = await searchNegociosByNombre(searchTerm);
    if (negociosPorNombre && negociosPorNombre.length >= 3) {
      renderNegocios(negociosPorNombre);
      navigateTo('view-results-business');
      return;
    } else if (negociosPorNombre && negociosPorNombre.length > 0) {
      // Añadir sin duplicados
      negociosPorNombre.forEach(n => {
        const key = n.id ?? n.google_place_id ?? JSON.stringify(n);
        if (!seen.has(key)) {
          seen.add(key);
          businessesToRender.push(n);
        }
      });
    }

    // Si tenemos menos de 3 resultados acumulados, intentar búsqueda semántica
    if (businessesToRender.length < 3) {
      try {
        const semanticResults = await searchSemantic(searchTerm);
        if (Array.isArray(semanticResults) && semanticResults.length > 0) {
          semanticResults.forEach(n => {
            const key = n.id ?? n.google_place_id ?? JSON.stringify(n);
            if (!seen.has(key)) {
              seen.add(key);
              businessesToRender.push(n);
            }
          });
        }
      } catch (semErr) {
        console.warn('Error en búsqueda semántica:', semErr);
      }
    }

    if (businessesToRender.length > 0) {
      const msg = businessesToRender.length < 3 ? 'Resultados relacionados por IA y búsqueda ampliada.' : null;
      renderNegocios(businessesToRender, msg);
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
  // 1) Poner el término en todos los inputs para mantener la UI sincronizada
  updateSearchInputs(category);

  // 2) Delegar la búsqueda al motor principal (performSearch) que ya maneja keywords, rubros,
  //    búsqueda semántica y toda la lógica de waterfall
  await performSearch();
}

/**
 * Maneja el evento keyup en los inputs (reemplaza keypress para mejor soporte móvil).
 * Detecta Enter y ejecuta búsqueda, cerrando el teclado virtual.
 */
function handleSearchKeyUp(event) {
  if (event.key === 'Enter' || event.keyCode === 13) {
    event.preventDefault();
    event.target.blur(); // Cerrar teclado virtual en móviles
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

  // Inicializar placeholder dinámico en el input de home
  initDynamicPlaceholder();
});

/**
 * Rotate dynamic placeholder on the home search input to teach users examples.
 */
function initDynamicPlaceholder() {
  const input = document.getElementById('search-input-home');
  if (!input) return;

  const placeholders = [
    "¿Qué estás buscando?",
    "Busca 'Cambio de aceite'...",
    "Busca 'Tengo hambre'...",
    "Busca 'Tornillo fix'...",
    "Busca 'Farmacia de turno'...",
    "Busca 'Hamburguesa completa'..."
  ];

  let index = 0;
  // Cambiar cada 2.5 segundos
  setInterval(() => {
    index = (index + 1) % placeholders.length;
    input.setAttribute('placeholder', placeholders[index]);
  }, 2500);
}

