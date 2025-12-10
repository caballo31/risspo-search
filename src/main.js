import './style.css';
import { navigateTo, goBack } from './utils/navigation.js';
import { getSearchTerm, updateSearchInputs, clearResults, showLoadingState, showNoResults, renderSkeletonLoader } from './utils/dom.js';
import { detectarRubro, buscarProductosPorRubro, obtenerTodosProductosDelRubro, searchProductos, searchProductosSemantic, searchPalabrasClave, searchNegociosByRubro, searchNegociosByNombre, searchSemantic } from './services/searchService.js';
import { renderProductos, renderNegocios, createBusinessCard } from './components/renderer.js';

// Exponer funciones globalmente para onclick handlers en HTML
window.navigateTo = navigateTo;
window.goBack = goBack;
window.performSearch = performSearch;
window.searchByCategory = searchByCategory;
window.handleSearchKeyUp = handleSearchKeyUp;

/**
 * Filtra resultados semánticos por relevancia adaptativa
 * Estrategia: Usar similitud para decidir cuántos resultados mostrar
 * @param {Array} results Array de objetos con propiedad 'similarity'
 * @returns {Array} Resultados filtrados por relevancia
 */
function filterByRelevance(results) {
  if (!results || results.length === 0) return [];
  
  // Asegurar orden por similitud (descendente)
  results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  const bestScore = results[0].similarity || 0;

  console.log(`📊 Filtrado de relevancia: mejor score = ${bestScore.toFixed(3)}`);

  // ESTRATEGIA ADAPTATIVA

  // Caso A: Coincidencia Alta (ej: Typos o términos exactos)
  // Si el mejor es > 0.6, cortamos la cola de resultados mediocres para evitar ruido
  if (bestScore > 0.6) {
    console.log('  → Modo ALTA RELEVANCIA: filtrando scores < 0.5');
    return results.filter(r => r.similarity > 0.5);
  }

  // Caso B: Coincidencia Media (ej: Conceptos abstractos como "tengo hambre")
  // Somos más flexibles, pero limitamos a los top 3-4 para no mostrar disparates
  console.log('  → Modo RELEVANCIA MEDIA: tomando top 3-4 resultados');
  return results.slice(0, 4);
}

/**
 * MOTOR DE BÚSQUEDA EN CASCADA (WATERFALL)
 * Estrategia secuencial para optimizar recursos y precisión:
 * NIVEL 1: Detectar rubro (categoría)
 * NIVEL 2: Buscar productos y negocios dentro de ese rubro
 * NIVEL 3: Presentación con exploración
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
    console.log(`\n========== 🔍 BÚSQUEDA EN CASCADA: "${searchTerm}" ==========\n`);

    // ====================== NIVEL 1: DETECCIÓN DE RUBRO ======================
    console.log(`📋 NIVEL 1: Detectando Rubro...`);
    const rubroDetectado = await detectarRubro(searchTerm);

    if (!rubroDetectado) {
      console.log(`❌ No se detectó rubro. Mostrando "Sin resultados".`);
      showNoResults(searchTerm);
      navigateTo('view-results-product');
      return;
    }

    console.log(`✅ Rubro detectado: "${rubroDetectado.nombre}"\n`);

    // ====================== NIVEL 2: BÚSQUEDA EN EL RUBRO ======================
    console.log(`🛍️  NIVEL 2: Buscando productos en rubro "${rubroDetectado.nombre}"...`);
    
    const productosDelRubro = await buscarProductosPorRubro(searchTerm, rubroDetectado);
    console.log(`  → Productos encontrados: ${productosDelRubro.length}\n`);

    // Obtener todos los negocios del rubro (para sugerencias de exploración)
    const negociosDelRubro = await searchNegociosByRubro(rubroDetectado.nombre);
    console.log(`  → Negocios del rubro: ${negociosDelRubro?.length || 0}\n`);

    // ====================== NIVEL 3: PRESENTACIÓN ======================
    if (productosDelRubro.length > 0) {
      console.log(`🎨 NIVEL 3: Presentación de resultados`);
      console.log(`  → Renderizando ${productosDelRubro.length} producto(s) encontrado(s)\n`);
      
      // Renderizar productos encontrados
      renderProductos(productosDelRubro);

      // Mostrar negocios como sugerencias si existen
      if (negociosDelRubro && negociosDelRubro.length > 0) {
        console.log(`  → Agregando ${negociosDelRubro.length} negocio(s) como "También podrías encontrarlo en..."  `);
        const productsContainer = document.getElementById('products-container');
        if (productsContainer) {
          const separator = document.createElement('div');
          separator.className = 'mt-6 text-center text-gray-500 font-medium';
          separator.textContent = 'También podrías encontrarlo en estos locales:';
          productsContainer.appendChild(separator);

          const sugGrid = document.createElement('div');
          sugGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4';

          negociosDelRubro.forEach(negocio => {
            const card = createBusinessCard(negocio);
            sugGrid.appendChild(card);
          });

          productsContainer.appendChild(sugGrid);
        }
      }

      navigateTo('view-results-product');
      return;
    }

    // Si no hay productos, mostrar solo negocios
    if (negociosDelRubro && negociosDelRubro.length > 0) {
      console.log(`🎨 NIVEL 3: Sin productos, mostrando negocios del rubro`);
      console.log(`  → Renderizando ${negociosDelRubro.length} negocio(s)\n`);
      
      renderNegocios(negociosDelRubro);
      navigateTo('view-results-business');
      return;
    }

    // Sin productos ni negocios
    console.log(`❌ Sin productos ni negocios en rubro "${rubroDetectado.nombre}"`);
    showNoResults(searchTerm);
    navigateTo('view-results-product');

  } catch (error) {
    console.error('❌ Error en búsqueda en cascada:', error);
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

