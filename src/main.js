import './style.css';
import { navigateTo, goBack } from './utils/navigation.js';
import { getSearchTerm, updateSearchInputs, clearResults, showLoadingState, showNoResults, renderSkeletonLoader } from './utils/dom.js';
import { supabase } from './api/supabase.js';
import { buscarNegocioDirecto, detectarContextoDeRubros, obtenerNegociosPorRubro, obtenerProductosPorRubro, obtenerTodosProductosDelRubro, searchProductos, searchProductosSemantic, searchPalabrasClave, searchNegociosByRubro, searchNegociosByNombre, searchSemantic } from './services/searchService.js';
import { renderProductos, renderNegocios, createBusinessCard } from './components/renderer.js';

// Exponer funciones globalmente para onclick handlers en HTML
window.navigateTo = navigateTo;
window.goBack = goBack;
window.performSearch = performSearch;
window.searchByCategory = searchByCategory;
window.handleSearchKeyUp = handleSearchKeyUp;

/**
 * MOTOR DE BÚSQUEDA CON RELEVANCIA EXPANDIDA
 * 
 * PASO 1: Búsqueda Directa de Negocio (MANTENER)
 * - Si es un negocio específico, mostrar perfil y detener
 * 
 * PASO 2: Detección de Contexto de Rubros (EXPANDIDA)
 * - Núcleo: Match exacto de rubro o keyword (Prioridad 1)
 * - Periferia: Rubros relacionados vía búsqueda semántica (Prioridad 2)
 * - Devuelve array de rubros ordenados por relevancia
 * 
 * PASO 3: Recuperación Multi-Rubro (FLEXIBLE)
 * - Buscar productos en todo el contexto de rubros
 * - Ordenar por prioridad de rubro (Núcleo primero, Periferia después)
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
    console.log(`\n========== 🔍 BÚSQUEDA CON RELEVANCIA EXPANDIDA: "${searchTerm}" ==========\n`);

    // ===================== PASO 1: BÚSQUEDA DE NEGOCIO =====================
    console.log(`\n1️⃣  PASO 1: Buscando negocio directo por nombre...`);
    const negocioDirecto = await buscarNegocioDirecto(searchTerm);

    if (negocioDirecto) {
      console.log(`✅ PASO 1 ÉXITO: Negocio encontrado: "${negocioDirecto.nombre}"`);
      console.log(`   DETENER aquí y mostrar perfil del negocio.\n`);

      // Mostrar perfil del negocio (tarjeta única)
      const singleCard = createBusinessCard(negocioDirecto);
      const productsContainer = document.getElementById('products-container');
      if (productsContainer) {
        productsContainer.innerHTML = '';
        productsContainer.appendChild(singleCard);
      }

      // Si el negocio tiene productos asociados, mostrarlos también
      try {
        const { data: productosNegocio } = await supabase
          .from('productos')
          .select('*')
          .eq('negocio_id', negocioDirecto.id)
          .limit(20);

        if (productosNegocio && productosNegocio.length > 0) {
          const separator = document.createElement('div');
          separator.className = 'mt-6 text-center text-gray-500 font-medium';
          separator.textContent = 'Productos de este negocio:';
          productsContainer.appendChild(separator);

          const grid = document.createElement('div');
          grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4';
          
          productosNegocio.forEach(prod => {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow';
            card.innerHTML = `
              <h3 class="font-bold text-lg">${prod.titulo}</h3>
              <p class="text-gray-600 text-sm mt-1">${prod.descripcion || 'Sin descripción'}</p>
            `;
            grid.appendChild(card);
          });

          productsContainer.appendChild(grid);
        }
      } catch (e) {
        console.warn('No se pudieron cargar productos del negocio:', e);
      }

      navigateTo('view-results-product');
      return;
    }

    console.log(`❌ PASO 1 FALLIDO: No es un negocio específico\n`);

    // ==================== PASO 2: DETECCIÓN DE CONTEXTO ====================
    console.log(`2️⃣  PASO 2: Detectando Contexto de Rubros (Núcleo + Periferia)...`);
    const contextoDatos = await detectarContextoDeRubros(searchTerm);

    if (!contextoDatos || contextoDatos.length === 0) {
      console.log(`\n❌ PASO 2 FALLIDO: No se detectó contexto de rubros.`);
      console.log(`   No hay coherencia. Mostrando "Sin resultados".\n`);
      showNoResults(searchTerm);
      navigateTo('view-results-product');
      return;
    }

    console.log(`\n✅ PASO 2 ÉXITO: Contexto de ${contextoDatos.length} rubro(s) detectado\n`);

    // ==================== PASO 3: RECUPERACIÓN MULTI-RUBRO ====================
    console.log(`3️⃣  PASO 3: Recuperando contenido del contexto...`);

    // Obtener negocios del contexto (ya ordenados por prioridad)
    const negociosDelContexto = await obtenerNegociosPorRubro(contextoDatos);
    console.log(`  → Negocios encontrados: ${negociosDelContexto.length}`);

    // Obtener productos del contexto (ya ordenados por prioridad de rubro)
    const productosDelContexto = await obtenerProductosPorRubro(searchTerm, contextoDatos);
    console.log(`  → Productos encontrados: ${productosDelContexto.length}\n`);

    // ==================== PRESENTACIÓN DE RESULTADOS ====================
    console.log(`🎨 PRESENTACIÓN:`);

    if (productosDelContexto.length > 0) {
      console.log(`  → Renderizando ${productosDelContexto.length} producto(s) del contexto`);
      console.log(`     (Ordenados por prioridad de rubro: ${contextoDatos.join(' > ')})\n`);
      
      renderProductos(productosDelContexto);

      // Agregar negocios como sugerencias
      if (negociosDelContexto && negociosDelContexto.length > 0) {
        console.log(`  → Agregando ${negociosDelContexto.length} negocio(s) del contexto como "También podrías encontrarlo en..."\n`);
        
        const productsContainer = document.getElementById('products-container');
        if (productsContainer) {
          const separator = document.createElement('div');
          separator.className = 'mt-6 text-center text-gray-500 font-medium';
          separator.textContent = 'También podrías encontrarlo en estos locales:';
          productsContainer.appendChild(separator);

          const sugGrid = document.createElement('div');
          sugGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4';

          negociosDelContexto.forEach(negocio => {
            const card = createBusinessCard(negocio);
            sugGrid.appendChild(card);
          });

          productsContainer.appendChild(sugGrid);
        }
      }

      navigateTo('view-results-product');
      return;
    }

    // Sin productos, mostrar solo negocios
    if (negociosDelContexto && negociosDelContexto.length > 0) {
      console.log(`  → Sin productos, mostrando solo ${negociosDelContexto.length} negocio(s) del contexto\n`);
      
      renderNegocios(negociosDelContexto);
      navigateTo('view-results-business');
      return;
    }

    // Sin productos ni negocios
    console.log(`\n❌ Sin productos ni negocios en contexto [${contextoDatos.join(', ')}]`);
    showNoResults(searchTerm);
    navigateTo('view-results-product');

  } catch (error) {
    console.error('❌ Error en búsqueda con relevancia expandida:', error);
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

