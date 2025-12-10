import './style.css';
import { navigateTo, goBack } from './utils/navigation.js';
import { getSearchTerm, updateSearchInputs, clearResults, showLoadingState, showNoResults, renderSkeletonLoader } from './utils/dom.js';
import { supabase } from './api/supabase.js';
import { 
  buscarNegociosCandidatos, 
  detectarContextoDeRubros, 
  obtenerNegociosPorRubro, 
  obtenerProductosDeNegocios, 
  obtenerTodosProductosDelRubro, 
  searchProductos, 
  searchProductosSemantic, 
  searchPalabrasClave, 
  searchNegociosByRubro, 
  searchNegociosByNombre, 
  searchSemantic 
} from './services/searchService.js';
import { renderProductos, renderNegocios, createBusinessCard } from './components/renderer.js';

// Exponer funciones globalmente para onclick handlers en HTML
window.navigateTo = navigateTo;
window.goBack = goBack;
window.performSearch = performSearch;
window.searchByCategory = searchByCategory;
window.handleSearchKeyUp = handleSearchKeyUp;

/**
 * MOTOR DE BÚSQUEDA HÍBRIDO PARALELO
 * 
 * ESTRATEGIA:
 * 1. Ejecución Paralela (Race):
 *    - Buscar candidatos de negocio (Nombre exacto/parcial/typos)
 *    - Detectar contexto de rubros (Exacto/Keywords/Semántico)
 * 
 * 2. Consolidación:
 *    - Unificar candidatos de negocio directos + negocios de los rubros detectados
 * 
 * 3. Determinación de Intención:
 *    - ¿Es búsqueda de Categoría? (ej: "Farmacia", "Comida rápida")
 *    - ¿Es búsqueda de Producto? (ej: "Ibuprofeno", "Hamburguesa")
 * 
 * 4. Recuperación de Productos:
 *    - Si es Categoría -> Traer destacados de esos negocios
 *    - Si es Producto -> Filtrar por título/descripción
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
    console.log(`\n========== 🚀 BÚSQUEDA HÍBRIDA PARALELA: "${searchTerm}" ==========\n`);

    // ===================== PASO 1: EJECUCIÓN PARALELA =====================
    console.log(`1️⃣  PASO 1: Lanzando hilos paralelos (Negocios + Contexto)...`);
    
    const pNegociosCandidatos = buscarNegociosCandidatos(searchTerm);
    const pContextoRubros = detectarContextoDeRubros(searchTerm);

    const [negociosCandidatos, contextoRubros] = await Promise.all([
      pNegociosCandidatos,
      pContextoRubros
    ]);

    console.log(`   ✅ Hilos completados:`);
    console.log(`      - Negocios Candidatos: ${negociosCandidatos.length}`);
    console.log(`      - Contexto Rubros: ${contextoRubros.length} (${contextoRubros.map(r => r.nombre).join(', ')})`);

    // ===================== PASO 2: CONSOLIDACIÓN DE CANDIDATOS =====================
    let negociosFinales = [...negociosCandidatos];
    const idsExistentes = new Set(negociosFinales.map(n => n.id));

    // Si hay rubros detectados, traemos sus negocios
    let negociosDelContexto = [];
    if (contextoRubros.length > 0) {
      negociosDelContexto = await obtenerNegociosPorRubro(contextoRubros);
      negociosDelContexto.forEach(n => {
        if (!idsExistentes.has(n.id)) {
          negociosFinales.push(n);
          idsExistentes.add(n.id);
        }
      });
    }

    console.log(`2️⃣  PASO 2: Consolidación -> ${negociosFinales.length} negocios totales considerados.`);

    // ===================== PASO 3: DETERMINACIÓN DE MODO =====================
    // Analizamos la intención del usuario
    
    const mejorRubro = contextoRubros[0];
    // Es categoría si:
    // A) El mejor rubro tiene score muy alto (>=95) -> Match exacto o fuzzy fuerte
    // B) O si no encontramos negocios por nombre pero sí un contexto claro
    const esBusquedaCategoria = (mejorRubro && mejorRubro.score >= 95) || 
                                (negociosCandidatos.length === 0 && contextoRubros.length > 0);

    console.log(`3️⃣  PASO 3: Modo detectado -> ${esBusquedaCategoria ? '🏢 CATEGORÍA (Exploración)' : '📦 PRODUCTO (Específico)'}`);

    // ===================== PASO 4: RECUPERACIÓN DE PRODUCTOS =====================
    const productos = await obtenerProductosDeNegocios(searchTerm, negociosFinales, esBusquedaCategoria);
    console.log(`4️⃣  PASO 4: Productos recuperados -> ${productos.length}`);

    // ===================== PASO 5: RENDERIZADO INTELIGENTE =====================
    
    // CASO ESPECIAL: Un solo negocio candidato MUY fuerte (Nombre exacto)
    // Y NO es modo categoría (ej: usuario buscó "McDonalds" específicamente)
    if (negociosCandidatos.length === 1 && 
        negociosCandidatos[0].nombre.toLowerCase() === searchTerm.toLowerCase() &&
        !esBusquedaCategoria) {
       
       console.log(`   🎯 Match exacto de negocio único. Mostrando perfil.`);
       renderBusinessProfileView(negociosCandidatos[0], productos);
       return;
    }

    if (negociosFinales.length === 0 && productos.length === 0) {
      console.log(`❌ Sin resultados.`);
      showNoResults(searchTerm);
      return;
    }

    // RENDERIZADO MIXTO
    const productsContainer = document.getElementById('products-container');
    if (productsContainer) productsContainer.innerHTML = '';

    if (esBusquedaCategoria) {
      // MODO CATEGORÍA: Mostrar Negocios primero, luego productos destacados
      console.log(`   🎨 Renderizando vista de Categoría...`);
      
      // 1. Lista de Negocios
      if (negociosFinales.length > 0) {
        renderNegocios(negociosFinales); // Esto renderiza en 'view-results-business' normalmente, pero aquí queremos mezclar
        // Hack: Si renderNegocios usa un contenedor específico, lo adaptamos.
        // Asumimos que renderNegocios limpia y pinta en su contenedor.
        // Para esta vista híbrida, vamos a construir manualmente si es necesario o usar las funciones existentes.
        
        // Si renderNegocios reemplaza la vista, mejor usamos renderProductos para todo o adaptamos.
        // Vamos a usar una estrategia de bloques en el contenedor de productos.
        
        const title = document.createElement('h2');
        title.className = 'text-xl font-bold mb-4 px-2';
        title.textContent = `Negocios de ${mejorRubro ? mejorRubro.nombre : 'la categoría'}`;
        productsContainer.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8';
        negociosFinales.forEach(n => grid.appendChild(createBusinessCard(n)));
        productsContainer.appendChild(grid);
      }

      // 2. Productos Destacados (si hay)
      if (productos.length > 0) {
        const separator = document.createElement('div');
        separator.className = 'mt-6 mb-4 text-xl font-bold px-2';
        separator.textContent = 'Productos Destacados';
        productsContainer.appendChild(separator);
        
        // Usamos renderProductos pero sin limpiar el contenedor (necesitamos adaptar renderProductos o hacerlo manual)
        // Como renderProductos limpia el contenedor, vamos a hacerlo manual aquí para no borrar los negocios.
        const prodGrid = document.createElement('div');
        prodGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
        
        productos.forEach(prod => {
            // Reutilizamos lógica de tarjeta de producto si existe, o creamos una simple
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow';
            card.innerHTML = `
              <h3 class="font-bold text-lg">${prod.titulo}</h3>
              <p class="text-gray-600 text-sm mt-1">${prod.descripcion || ''}</p>
              <div class="mt-2 text-sm text-blue-600 font-medium">
                En: ${prod.negocios ? prod.negocios.nombre : 'Negocio'}
              </div>
            `;
            prodGrid.appendChild(card);
        });
        productsContainer.appendChild(prodGrid);
      }

    } else {
      // MODO PRODUCTO: Mostrar Productos primero, luego negocios relacionados
      console.log(`   🎨 Renderizando vista de Producto...`);

      if (productos.length > 0) {
        renderProductos(productos); // Esto limpia y pinta productos
      } else {
        productsContainer.innerHTML = '<p class="text-center text-gray-500 mt-10">No encontramos productos específicos, pero mira estos negocios:</p>';
      }

      // Agregar negocios al final
      if (negociosFinales.length > 0) {
        const separator = document.createElement('div');
        separator.className = 'mt-8 mb-4 text-center text-gray-500 font-medium border-t pt-6';
        separator.textContent = 'Disponibles en estos negocios:';
        productsContainer.appendChild(separator);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
        negociosFinales.forEach(n => grid.appendChild(createBusinessCard(n)));
        productsContainer.appendChild(grid);
      }
    }

    navigateTo('view-results-product');

  } catch (error) {
    console.error('❌ Error en búsqueda híbrida:', error);
    alert('Ocurrió un error al realizar la búsqueda. Por favor, intenta nuevamente.');
  }
}

/**
 * Helper para renderizar perfil de negocio único
 */
function renderBusinessProfileView(negocio, productos) {
  const productsContainer = document.getElementById('products-container');
  if (productsContainer) {
    productsContainer.innerHTML = '';
    productsContainer.appendChild(createBusinessCard(negocio));

    if (productos && productos.length > 0) {
      const separator = document.createElement('div');
      separator.className = 'mt-6 text-center text-gray-500 font-medium';
      separator.textContent = 'Productos de este negocio:';
      productsContainer.appendChild(separator);

      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4';
      
      productos.forEach(prod => {
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
  }
  navigateTo('view-results-product');
}

/**
 * Busca negocios por categoría/rubro
 */
async function searchByCategory(category) {
  updateSearchInputs(category);
  await performSearch();
}

/**
 * Maneja el evento keyup en los inputs
 */
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
    "¿Qué estás buscando?",
    "Busca 'Cambio de aceite'...",
    "Busca 'Tengo hambre'...",
    "Busca 'Tornillo fix'...",
    "Busca 'Farmacia de turno'...",
    "Busca 'Hamburguesa completa'..."
  ];

  let index = 0;
  setInterval(() => {
    index = (index + 1) % placeholders.length;
    input.setAttribute('placeholder', placeholders[index]);
  }, 2500);
}

