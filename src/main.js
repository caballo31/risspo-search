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
 * Maneja la búsqueda principal con búsqueda independiente de productos y negocios,
 * mostrando resultados mixtos de forma inteligente.
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
  navigateTo('view-results-product');
  renderSkeletonLoader();

  try {
    // PASO 1: Buscar Productos (de forma independiente)
    console.log('🔍 Buscando productos para:', searchTerm);
    const productos = await searchProductos(searchTerm);
    console.log('✅ Productos encontrados:', productos?.length || 0);

    // PASO 2: Buscar Negocios (en paralelo y de múltiples formas)
    console.log('🏪 Buscando negocios...');
    
    // 2a) Búsqueda directa por rubro
    const negociosPorRubroDirecto = await searchNegociosByRubro(searchTerm);
    
    // 2b) Búsqueda por palabras clave asociadas
    const rubrosAsociados = await searchPalabrasClave(searchTerm);
    let negociosFromKeywords = [];
    if (Array.isArray(rubrosAsociados) && rubrosAsociados.length > 0) {
      negociosFromKeywords = await searchNegociosByRubro(rubrosAsociados);
    }
    
    // 2c) Búsqueda por nombre de negocio
    const negociosPorNombre = await searchNegociosByNombre(searchTerm);

    // Combinar negocios sin duplicados
    const negociosDirectos = [];
    const seenNegocios = new Set();

    function addNegocios(arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(n => {
        const key = n.id ?? n.google_place_id ?? JSON.stringify(n);
        if (!seenNegocios.has(key)) {
          seenNegocios.add(key);
          negociosDirectos.push(n);
        }
      });
    }

    addNegocios(negociosPorRubroDirecto);
    addNegocios(negociosFromKeywords);
    addNegocios(negociosPorNombre);

    console.log('✅ Negocios encontrados:', negociosDirectos.length);

    // PASO 3: Lógica de Renderizado (según disponibilidad de resultados)

    // Caso A: Hay productos
    if (productos && productos.length > 0) {
      console.log('📦 Renderizando productos...');
      renderProductos(productos);

      // Si hay negocios directos, mostrarlos como sugerencias debajo
      if (negociosDirectos.length > 0) {
        console.log('🏢 Agregando negocios como sugerencias...');
        const productsContainer = document.getElementById('products-container');
        if (productsContainer) {
          const separator = document.createElement('div');
          separator.className = 'mt-6 text-center text-gray-500 font-medium';
          separator.textContent = 'También podrías encontrarlo en estos locales:';
          productsContainer.appendChild(separator);

          const sugGrid = document.createElement('div');
          sugGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4';

          negociosDirectos.forEach(negocio => {
            const card = createBusinessCard(negocio);
            sugGrid.appendChild(card);
          });

          productsContainer.appendChild(sugGrid);
        }
      }

      navigateTo('view-results-product');
      return;
    }

    // Caso B: No hay productos, pero sí negocios
    if (negociosDirectos.length > 0) {
      console.log('📋 Sin productos, mostrando solo negocios...');
      
      // Si hay pocos negocios, intentar enriquecerlos con búsqueda semántica
      if (negociosDirectos.length < 3) {
        try {
          console.log('🤖 Intentando búsqueda semántica para negocios...');
          const semanticResults = await searchSemantic(searchTerm);
          if (Array.isArray(semanticResults) && semanticResults.length > 0) {
            semanticResults.forEach(n => {
              const key = n.id ?? n.google_place_id ?? JSON.stringify(n);
              if (!seenNegocios.has(key)) {
                seenNegocios.add(key);
                negociosDirectos.push(n);
              }
            });
            console.log('✨ Enriquecidos con semántica, total:', negociosDirectos.length);
          }
        } catch (semErr) {
          console.warn('⚠️ Error en búsqueda semántica de negocios:', semErr);
        }
      }

      renderNegocios(negociosDirectos);
      navigateTo('view-results-business');
      return;
    }

    // Caso C: No hay productos ni negocios directos, intentar búsqueda semántica de productos
    console.log('🤖 Sin resultados directos, intentando búsqueda semántica de productos...');
    try {
      // Esta función ya intenta buscar semántica de productos si tiene < 3 resultados
      // Pero aquí ejecutamos manualmente por si acaso
      const semanticProductos = await searchProductos(searchTerm); // Ya internamente intenta semántica
      if (semanticProductos && semanticProductos.length > 0) {
        console.log('✨ Productos por semántica:', semanticProductos.length);
        renderProductos(semanticProductos);
        navigateTo('view-results-product');
        return;
      }
    } catch (semErr) {
      console.warn('⚠️ Error en búsqueda semántica de productos:', semErr);
    }

    // Caso D: Sin resultados en ningún nivel
    console.log('❌ Sin resultados para:', searchTerm);
    showNoResults(searchTerm);
    navigateTo('view-results-product');

  } catch (error) {
    console.error('❌ Error en la búsqueda:', error);
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

