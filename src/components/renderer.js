/**
 * Formatea un precio en formato de moneda argentina
 */
function formatPrice(precio) {
  if (!precio) return 'Consultar precio';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(precio);
}

/**
 * Renderiza las tarjetas de productos
 */
export function renderProductos(productos) {
  const container = document.getElementById('products-container');
  const grid = container.querySelector('.grid') || container;
  
  // Limpiar contenedor
  grid.innerHTML = '';

  productos.forEach(producto => {
    const negocio = producto.negocios;
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl border border-gray-200/60 p-5 shadow-sm relative hover:shadow-md transition-shadow flex flex-col justify-between h-full';
    
    const imagenUrl = producto.imagen_url || 'https://via.placeholder.com/200?text=Sin+imagen';
    const disponible = producto.disponible 
      ? '<p class="text-xs text-green-600 font-semibold">EN STOCK</p>' 
      : '<p class="text-xs text-gray-500 font-semibold">AGOTADO</p>';
    const precio = producto.precio ? formatPrice(producto.precio) : 'Consultar precio';
    const nombreNegocio = negocio ? negocio.nombre : 'Negocio no disponible';
    const direccionNegocio = negocio ? negocio.direccion : '';
    const estadoVerificado = negocio && negocio.estado === 'verificado' 
      ? '<span class="material-symbols-outlined !text-base text-trustworthy-blue" style="font-variation-settings: \'FILL\' 1, \'wght\' 700, \'opsz\' 20;">verified</span>' 
      : '';
    
    card.innerHTML = `
      <div>
        <div class="flex items-start mb-4">
          <div class="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center mr-4 flex-shrink-0">
            <img alt="${producto.titulo}" class="h-16 w-16 object-contain mix-blend-multiply" src="${imagenUrl}" onerror="this.src='https://via.placeholder.com/200?text=Sin+imagen'"/>
          </div>
          <div class="flex-1">
            <h3 class="font-bold text-gray-900 leading-tight text-lg">${producto.titulo}</h3>
            <div class="flex items-center gap-2 mt-1.5">
              ${disponible}
            </div>
            <div class="flex items-baseline mt-1 space-x-2">
              <span class="text-xl font-bold text-gray-900">${precio}</span>
            </div>
          </div>
        </div>
        
        <div class="space-y-1 mt-2">
          <div class="flex items-center gap-1.5 group cursor-pointer" data-navigate="view-profile">
            <span class="material-symbols-outlined !text-lg text-gray-400 group-hover:text-orange-highlight transition-colors">storefront</span>
            <span class="text-sm font-medium text-gray-800 group-hover:text-orange-highlight transition-colors">${nombreNegocio}</span>
            ${estadoVerificado}
          </div>

          ${direccionNegocio ? `
          <div class="flex items-center gap-1.5 group cursor-pointer">
            <span class="material-symbols-outlined !text-lg text-gray-400 group-hover:text-orange-highlight transition-colors">location_on</span>
            <span class="text-sm text-gray-500 group-hover:text-orange-highlight group-hover:underline decoration-dotted transition-colors">${direccionNegocio}</span>
          </div>
          ` : ''}
        </div>
      </div>
      
      <button class="w-full bg-orange-highlight text-white font-bold py-3 rounded-xl mt-5 text-center flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors shadow-orange-200 shadow-lg group">
        <svg aria-hidden="true" class="h-5 w-5 path-fill group-hover:scale-110 transition-transform" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.75 13.96c.25.13.41.36.44.62l.27 2.11c.06.5-.14 1-.53 1.28-.18.13-.38.19-.58.19-.24 0-.48-.08-.69-.23l-1.34-.9a.48.48 0 00-.58 0l-1.34.9c-.43.29-1 .24-1.36-.12a1.43 1.43 0 01-.53-1.28l.27-2.11c.03-.26.2-.5.44-.62l1.8-1a.48.48 0 00.25-.66l-.5-1.63a.48.48 0 00-.56-.3l-2.03.73c-.49.18-.99-.08-1.2-.55s-.08-.99.31-1.3l1.8-1.33c.25-.19.58-.23.88-.1l2.03.73c.5.18.99-.08 1.2-.55s.08-.99-.31-1.3l-1.8-1.33a.9.9 0 01-.39-1.26c.15-.3.44-.5.78-.5.1 0 .2.02.3.05l2.03.73c.49.18.99-.08 1.2-.55s.08-.99-.31-1.3L13.5 2.1c-.24-.18-.39-.46-.39-.78 0-.5.4-.9.9-.9.24 0 .47.1.65.28l1.34.9c.43.29 1 .24 1.36-.12.35-.35.42-.87.17-1.31-.08-.13-.19-.24-.31-.33a.48.48 0 00-.65.05L15 1.1c-.24.18-.57.22-.87.1L12.1.47a.9.9 0 00-1.16.57c-.15.3-.1.65.12.9l1.34.9c.43.29.58.87.31 1.3L11.42 6.5c-.24.18-.57.22-.87.1l-2.03-.73a.9.9 0 00-1.16.57c-.15.3-.1.65.12.9l1.8 1.33c.4.29.55.87.31 1.3s-.71.73-1.2.55l-2.03-.73a.9.9 0 00-1.16.57c-.15.3-.1.65.12.9l1.8 1.33c.4.29.55.87.31 1.3s-.71.73-1.2.55L4.17 14.1c-.49-.18-1 .08-1.2-.55s-.08-.99.31 1.3l1.8 1.33c.25.19.39.46.39.78 0-.5.4-.9.9-.9-.24 0-.47-.1-.65-.28l-1.34-.9a1.43 1.43 0 00-1.36.12c-.36.36-.42-.87-.17 1.31.08.13.19-.24.31.33a.48.48 0 00.65-.05L3.5 21.9c.24-.18-.57-.22.87-.1l2.03.73a.9.9 0 00-1.16-.57c.15-.3.1-.65-.12-.9l-1.34-.9c-.43-.29-.58-.87-.31-1.3l1.29-2.34c.24-.18.57-.22.87-.1l2.03.73c.49.18 1-.08 1.2-.55s.08-1-.31-1.3l-1.8-1.32z"></path>
        </svg>
        Pedir Producto
      </button>
    `;
    
    // Agregar event listener para navegación
    const navigateBtn = card.querySelector('[data-navigate]');
    if (navigateBtn) {
      navigateBtn.addEventListener('click', () => {
        const navigateTo = window.navigateTo;
        if (navigateTo) navigateTo('view-profile');
      });
    }
    
    grid.appendChild(card);
  });
}

/**
 * Renderiza las tarjetas de negocios
 */
export function renderNegocios(negocios, message = null) {
  const container = document.getElementById('businesses-container');
  const messageEl = document.getElementById('search-message-business');
  
  // Mostrar mensaje si existe
  if (message) {
    messageEl.textContent = message;
    messageEl.classList.remove('hidden');
  } else {
    messageEl.classList.add('hidden');
  }
  
  // Limpiar contenedor
  container.innerHTML = '';

  negocios.forEach(negocio => {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full';
    
    const logoUrl = negocio.logo_url || 'https://via.placeholder.com/400?text=' + encodeURIComponent(negocio.nombre);
    const estadoVerificado = negocio.estado === 'verificado' 
      ? '<span class="material-symbols-outlined !text-xl text-trustworthy-blue" style="font-variation-settings: \'FILL\' 1, \'wght\' 700, \'opsz\' 20;">verified</span>' 
      : '';
    const telefono = negocio.telefono || '';
    const whatsapp = negocio.whatsapp || telefono;
    const telHref = telefono ? `tel:${telefono.replace(/\s/g, '')}` : '#';
    const waHref = whatsapp ? `https://wa.me/${whatsapp.replace(/\s/g, '').replace(/\+/g, '')}` : '#';
    
    card.innerHTML = `
      <div class="relative h-40 rounded-xl mb-4 bg-gray-100 overflow-hidden group">
        <img alt="${negocio.nombre} logo" class="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" src="${logoUrl}" onerror="this.onerror=null; this.src='https://via.placeholder.com/400?text=' + encodeURIComponent('${negocio.nombre}'); this.parentElement.innerHTML='<span class=\\'material-symbols-outlined !text-6xl text-gray-400\\'>storefront</span>'"/>
        <div class="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
      </div>
      
      <div class="flex-grow">
        <div class="flex items-center gap-1 cursor-pointer" data-navigate="view-profile">
          <a class="font-bold text-xl text-gray-900 hover:text-orange-highlight">${negocio.nombre}</a>
          ${estadoVerificado}
        </div>
        ${negocio.direccion ? `
        <div class="flex items-center text-sm text-gray-500 mt-2">
          <span class="material-symbols-outlined !text-lg mr-1.5 text-gray-400">location_on</span>
          <span class="text-gray-800 underline decoration-dotted underline-offset-2 hover:text-orange-highlight cursor-pointer">${negocio.direccion}</span>
        </div>
        ` : ''}
      </div>

      <div class="grid grid-cols-2 gap-3 mt-5">
        <a href="${telHref}" class="w-full bg-white text-black border border-gray-300 font-bold py-3 rounded-xl text-center text-sm hover:bg-gray-50">Llamar</a>
        <a href="${waHref}" target="_blank" class="w-full bg-white text-black border border-gray-300 font-bold py-3 rounded-xl text-center text-sm hover:bg-gray-50">WhatsApp</a>
      </div>
      <button class="w-full bg-orange-highlight text-white font-bold py-3 rounded-xl mt-3 text-center flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors" data-navigate="view-profile">
        Ver Perfil
      </button>
    `;
    
    // Agregar event listeners para navegación
    const navigateBtns = card.querySelectorAll('[data-navigate]');
    navigateBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const navigateTo = window.navigateTo;
        if (navigateTo) navigateTo('view-profile');
      });
    });
    
    container.appendChild(card);
  });
}

