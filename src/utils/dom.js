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
  const homeInput = document.getElementById('search-input-home');
  const productInput = document.getElementById('search-input-product');
  const businessInput = document.getElementById('search-input-business');
  
  if (homeInput && homeInput.value.trim()) {
    return homeInput.value.trim();
  }
  if (productInput && productInput.value.trim()) {
    return productInput.value.trim();
  }
  if (businessInput && businessInput.value.trim()) {
    return businessInput.value.trim();
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

