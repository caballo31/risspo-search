import './style.css';
import { navigateTo, goBack } from './utils/navigation.js';
import { getSearchTerm, updateSearchInputs, clearResults, showLoadingState, showNoResults, renderSkeletonLoader } from './utils/dom.js';
import { supabase } from './api/supabase.js';
import { buscarNegocioDirecto, detectarRubroEstricto, obtenerNegociosPorRubro, obtenerProductosPorRubro, obtenerTodosProductosDelRubro, searchProductos, searchProductosSemantic, searchPalabrasClave, searchNegociosByRubro, searchNegociosByNombre, searchSemantic } from './services/searchService.js';
import { renderProductos, renderNegocios, createBusinessCard } from './components/renderer.js';

// Exponer funciones globalmente para onclick handlers en HTML
window.navigateTo = navigateTo;
window.goBack = goBack;
window.performSearch = performSearch;
window.searchByCategory = searchByCategory;
window.handleSearchKeyUp = handleSearchKeyUp;

/**
 * MOTOR DE BÚSQUEDA CON JERARQUÍA TOP-DOWN ESTRICTA
 * 
 * PASO 1: Búsqueda de Negocio (Prioridad Máxima)
 * - Si encuentra un negocio con coincidencia ilike, muestra su perfil y productos
 * - DETIENE el proceso aquí
 * 
 * PASO 2: Detección de Rubro (La Fuente de la Verdad)
 * - Método A: Match exacto en rubros (ilike)
 * - Método B: Palabras clave
 * - Método C: Embedding de Rubro (último recurso)
 * - PROHIBIDO: Inferir rubro desde productos
 * 
 * PASO 3: Recuperación de Contenido (Scopeado al Rubro)
 * - Obtener negocios del rubro
 * - Obtener productos DEL RUBRO (ilike + vectorial si necesario, pero FILTRADO)
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
    console.log(`\n========== 🔍 BÚSQUEDA JERÁRQUICA TOP-DOWN: "${searchTerm}" ==========\n`);

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

    // ==================== PASO 2: DETECCIÓN DE RUBRO ====================
    console.log(`2️⃣  PASO 2: Detectando Rubro (Fuente de la Verdad)...`);
    const rubroDetectado = await detectarRubroEstricto(searchTerm);

    if (!rubroDetectado) {
      console.log(`\n❌ PASO 2 FALLIDO: No se detectó rubro por ningún método.`);
      console.log(`   No hay coherencia de categoría. Mostrando "Sin resultados".\n`);
      showNoResults(searchTerm);
      navigateTo('view-results-product');
      return;
    }

    console.log(`\n✅ PASO 2 ÉXITO: Rubro detectado: "${rubroDetectado.nombre}" (Método: ${rubroDetectado.metodo})\n`);

    // ==================== PASO 3: RECUPERACIÓN DE CONTENIDO ====================
    console.log(`3️⃣  PASO 3: Recuperando contenido scopeado al rubro "${rubroDetectado.nombre}"...`);

    // Obtener negocios del rubro
    const negociosDelRubro = await obtenerNegociosPorRubro(rubroDetectado.nombre);
    console.log(`  → Negocios encontrados: ${negociosDelRubro.length}`);

    // Obtener productos del rubro (con búsqueda ilike + vectorial filtrado)
    const productosDelRubro = await obtenerProductosPorRubro(searchTerm, rubroDetectado.nombre);
    console.log(`  → Productos encontrados: ${productosDelRubro.length}\n`);

    // ==================== PRESENTACIÓN DE RESULTADOS ====================
    console.log(`🎨 PRESENTACIÓN:`);

    if (productosDelRubro.length > 0) {
      console.log(`  → Renderizando ${productosDelRubro.length} producto(s) del rubro\n`);
      
      renderProductos(productosDelRubro);

      // Agregar negocios como sugerencias
      if (negociosDelRubro && negociosDelRubro.length > 0) {
        console.log(`  → Agregando ${negociosDelRubro.length} negocio(s) como "También podrías encontrarlo en..."\n`);
        
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

    // Sin productos, mostrar solo negocios
    if (negociosDelRubro && negociosDelRubro.length > 0) {
      console.log(`  → Sin productos, mostrando solo ${negociosDelRubro.length} negocio(s)\n`);
      
      renderNegocios(negociosDelRubro);
      navigateTo('view-results-business');
      return;
    }

    // Sin productos ni negocios
    console.log(`\n❌ Sin productos ni negocios en rubro "${rubroDetectado.nombre}"`);
    showNoResults(searchTerm);
    navigateTo('view-results-product');

  } catch (error) {
    console.error('❌ Error en búsqueda jerárquica:', error);
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

