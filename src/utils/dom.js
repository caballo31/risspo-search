/**
 * Limpia los contenedores de resultados
 */
export function clearResults() {
  const productsContainer = document.getElementById('products-container');
  const businessesContainer = document.getElementById('businesses-container');
  const messageProduct = document.getElementById('search-message-product');
  const messageBusiness = document.getElementById('search-message-business');
  
  if (productsContainer) {
    const grid = productsContainer.querySelector('.grid');
    if (grid) grid.innerHTML = '';
  }
  if (businessesContainer) businessesContainer.innerHTML = '';
  if (messageProduct) {
    messageProduct.classList.add('hidden');
    messageProduct.textContent = '';
  }
  if (messageBusiness) {
    messageBusiness.classList.add('hidden');
    messageBusiness.textContent = '';
  }
}

/**
 * Muestra un estado de carga (placeholder para futuro spinner)
 */
export function showLoadingState() {
  // Podrías agregar un spinner aquí si lo deseas
}

/**
 * Muestra mensaje cuando no hay resultados
 */
export function showNoResults(term) {
  const messageProduct = document.getElementById('search-message-product');
  const messageBusiness = document.getElementById('search-message-business');
  
  const message = `No se encontraron resultados para "${term}"`;
  
  if (messageProduct) {
    messageProduct.textContent = message;
    messageProduct.classList.remove('hidden');
  }
  if (messageBusiness) {
    messageBusiness.textContent = message;
    messageBusiness.classList.remove('hidden');
  }
}

/**
 * Obtiene el término de búsqueda del input activo
 */
export function getSearchTerm() {
  // Detectar la vista activa buscando la que NO tenga la clase .hidden
  const activeView = document.querySelector('.view-section:not(.hidden)');
  if (!activeView) return '';

  const viewId = activeView.id;
  let inputId = '';

  if (viewId === 'view-home') {
    inputId = 'search-input-home';
  } else if (viewId === 'view-results-product') {
    inputId = 'search-input-product';
  } else if (viewId === 'view-results-business') {
    inputId = 'search-input-business';
  }

  if (inputId) {
    const input = document.getElementById(inputId);
    return input ? input.value.trim() : '';
  }

  return '';
}

/**
 * Sincroniza todos los inputs de búsqueda con un término
 */
export function updateSearchInputs(term) {
  const inputs = [
    document.getElementById('search-input-home'),
    document.getElementById('search-input-product'),
    document.getElementById('search-input-business')
  ];
  inputs.forEach(input => {
    if (input) input.value = term;
  });
}


/**
 * Renderiza un skeleton loader (6 tarjetas) en el contenedor de productos.
 * Las tarjetas usan la clase `.skeleton` definida en `src/style.css`.
 */
export function renderSkeletonLoader() {
  const productsContainer = document.getElementById('products-container');
  if (!productsContainer) return;
  // Preferir el contenedor grid ya presente para evitar nested grids
  const existingGrid = productsContainer.querySelector('.grid');

  const skeletonCard = () => `
    <div class="bg-white rounded-2xl border border-gray-200/60 p-5 shadow-sm hover:shadow-md hover:border-orange-100 transition-all flex flex-col h-full">
      <div class="relative h-32 bg-gray-100 rounded-xl mb-4 overflow-hidden group">
        <div class="h-full w-full skeleton"></div>
      </div>

      <div class="flex-grow">
        <div class="h-6 w-3/4 rounded skeleton mb-3"></div>
        <div class="h-4 w-1/2 rounded skeleton mb-3"></div>
        <div class="h-3 w-1/3 rounded skeleton mb-4"></div>
        <div class="flex items-center gap-2 mt-2">
          <div class="h-3 w-20 rounded skeleton"></div>
          <div class="h-3 w-24 rounded skeleton"></div>
        </div>
      </div>

      <div class="mt-5 pt-5 border-t border-gray-100">
        <div class="grid grid-cols-2 gap-2">
          <div class="h-10 bg-white rounded-xl skeleton"></div>
          <div class="h-10 bg-white rounded-xl skeleton"></div>
        </div>
        <div class="mt-2">
          <div class="h-10 bg-orange-50 rounded-xl skeleton w-full"></div>
        </div>
      </div>
    </div>
  `;

  const cardsHtml = Array.from({ length: 6 }).map(() => skeletonCard()).join('');

  if (existingGrid) {
    existingGrid.innerHTML = cardsHtml;
  } else {
    productsContainer.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${cardsHtml}</div>`;
  }
}

