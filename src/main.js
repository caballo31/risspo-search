import './style.css';
import { navigateTo, goBack } from './utils/navigation.js';
import { getSearchTerm, updateSearchInputs, clearResults, showLoadingState, showNoResults, renderSkeletonLoader } from './utils/dom.js';
import { searchProductos, searchProductosSemantic, searchPalabrasClave, searchNegociosByRubro, searchNegociosByNombre, searchSemantic } from './services/searchService.js';
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
 * Maneja la búsqueda principal con estrategia de "Rescate Explícito":
 * 
 * Fase 1 (Literal): Búsquedas rápidas sin IA
 * Fase 2 (Rescate): Solo si Fase 1 encuentra 0 resultados, activa IA
 * Fase 3 (Sin resultados): Si ambas fases fallan
 */
async function performSearch() {
  const searchTerm = getSearchTerm();
  
  if (!searchTerm) {
    alert('Por favor, ingresa un término de búsqueda');
    return;
  }

  // Sincronizar inputs
  updateSearchInputs(searchTerm);

  // Limpiar y mostrar skeleton
  clearResults();
  showLoadingState();
  navigateTo('view-results-product');
  renderSkeletonLoader();

  try {
    console.log(`🔍 FASE 1 (Literal): Buscando "${searchTerm}"...`);

    // ==================== FASE 1: BÚSQUEDA LITERAL ====================
    // Ejecutar en paralelo: productos y negocios (por rubro y por nombre)
    const [productos, negociosPorRubro, negociosPorNombre] = await Promise.all([
      searchProductos(searchTerm),
      searchNegociosByRubro(searchTerm),
      searchNegociosByNombre(searchTerm)
    ]);

    console.log(`  📦 Productos encontrados: ${productos?.length || 0}`);
    console.log(`  🏪 Negocios por rubro: ${negociosPorRubro?.length || 0}`);
    console.log(`  🏢 Negocios por nombre: ${negociosPorNombre?.length || 0}`);

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

    addNegocios(negociosPorRubro);
    addNegocios(negociosPorNombre);

    // Evaluación Fase 1: ¿hay CUALQUIER resultado?
    const totalFase1 = (productos?.length || 0) + (negociosDirectos.length || 0);

    if (totalFase1 > 0) {
      console.log(`✅ FASE 1 EXITOSA: ${totalFase1} resultado(s) encontrado(s). Renderizando...`);

      // Caso A: Hay productos
      if (productos && productos.length > 0) {
        console.log('  → Renderizando productos');
        renderProductos(productos);

        // Si hay negocios directos, mostrarlos como sugerencias
        if (negociosDirectos.length > 0) {
          console.log('  → Agregando negocios como sugerencias');
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
        console.log('  → Mostrando solo negocios');
        renderNegocios(negociosDirectos);
        navigateTo('view-results-business');
        return;
      }
    }

    // ==================== FASE 2: RESCATE CON IA ====================
    console.log(`❌ FASE 1 SIN RESULTADOS (0/0). Activando FASE 2 (Rescate con IA)...`);

    const [productosSemanticos, negociosSemanticos] = await Promise.all([
      searchProductosSemantic(searchTerm),
      searchSemantic(searchTerm)
    ]);

    console.log(`  ✨ Productos semánticos crudos: ${productosSemanticos?.length || 0}`);
    console.log(`  ✨ Negocios semánticos crudos: ${negociosSemanticos?.length || 0}`);

    // Aplicar filtrado de relevancia adaptativa
    const productosFiltrados = filterByRelevance(productosSemanticos);
    const negociosFiltrados = filterByRelevance(negociosSemanticos);

    console.log(`  🔽 Productos filtrados: ${productosFiltrados.length}`);
    console.log(`  🔽 Negocios filtrados: ${negociosFiltrados.length}`);

    const totalFase2 = (productosFiltrados?.length || 0) + (negociosFiltrados?.length || 0);

    if (totalFase2 > 0) {
      console.log(`✅ FASE 2 EXITOSA: ${totalFase2} resultado(s) relevante(s) encontrado(s) por IA. Renderizando...`);

      // Mostrar productos semánticos si existen
      if (productosFiltrados && productosFiltrados.length > 0) {
        console.log('  → Renderizando productos semánticos');
        renderProductos(productosFiltrados);

        // Si hay negocios semánticos, mostrarlos como sugerencias
        if (negociosFiltrados && negociosFiltrados.length > 0) {
          console.log('  → Agregando negocios semánticos como sugerencias');
          const productsContainer = document.getElementById('products-container');
          if (productsContainer) {
            const separator = document.createElement('div');
            separator.className = 'mt-6 text-center text-gray-500 font-medium';
            separator.textContent = 'También podrías encontrarlo en estos locales:';
            productsContainer.appendChild(separator);

            const sugGrid = document.createElement('div');
            sugGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4';

            negociosFiltrados.forEach(negocio => {
              const card = createBusinessCard(negocio);
              sugGrid.appendChild(card);
            });

            productsContainer.appendChild(sugGrid);
          }
        }

        navigateTo('view-results-product');
        return;
      }

      // Si solo hay negocios semánticos
      if (negociosFiltrados && negociosFiltrados.length > 0) {
        console.log('  → Mostrando solo negocios semánticos');
        renderNegocios(negociosFiltrados);
        navigateTo('view-results-business');
        return;
      }
    }

    // ==================== FASE 3: SIN RESULTADOS ====================
    console.log(`❌ FASE 2 SIN RESULTADOS. Sin resultados en ningún nivel.`);
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

