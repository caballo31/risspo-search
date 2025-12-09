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
      ? `<span class="material-symbols-outlined !text-base text-trustworthy-blue" style="font-variation-settings: 'FILL' 1, 'wght' 700, 'opsz' 20;">verified</span>`
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
          <path d="M16.75 13.96c.25.13.41.36.44.62l.27 2.11c.06.5-.14 1-.53 1.28-.18.13-.38.19-.58.19-.24 0-.48-.08-.69-.23l-1.34-.9a.48.48 0 00-.58 0l-1.34.9c-.43.29-1 .24-1.36-.12a1.43 1.43 0 01-.53-1.28l.27-2.11c.03-.26.2-.5.44-.62l1.8-1a.48.48 0 00.25-.66l-.5-1.63a.48.48 0 00-.56-.3l-2.03.73c-.49.18-.99-.08-1.2-.55s-.08-.99.31-1.3l1.8-1.33c.25-.19.58-.23.88-.1l2.03.73c.5.18.99-.08 1.2-.55s.08-.99-.31-1.3l-1.8-1.33a.9.9 0 01-.39-1.26c.15-.3.44-.5.78-.5.1 0 .2.02.3.05l2.03.73c.49.18.99-.08 1.2-.55s.08-.99-.31-1.3L13.5 2.1c-.24-.18-.39-.46-.39-.78 0-.5.4-.9.9-.9.24 0 .47.1.65.28l1.34.9c.43.29 1 .24 1.36-.12.35-.35.42-.87.17-1.31-.08-.13-.19-.24-.31-.33a.48.48 0 00-.65.05L15 1.1c-.24.18-.57.22-.87.1L12.1.47a.9.9 0 00-1.16.57c-.15.3-.1.65.12.9l1.34.9c.43.29.58.87.31 1.3L11.42 6.5c-.24.18-.57.22-.87.1l-2.03-.73a.9.9 0 00-1.16.57c-.15.3-.1.65.12.9l1.8 1.33c.4.29.55.87.31 1.3s-.71.73-1.2.55l-2.03-.73a.9.9 0 00-1.16.57c-.15.3-.1.65.12.9l1.8 1.33c.4.29.55.87.31 1.3s-.71.73-1.2.55L4.17 14.1c-.49-.18-1 .08-1.2-.55s-.08-.99.31 1.3l1.8 1.33c.25.19.39.46.39.78 0-.5.4-.9.9-.9-.24 0-.47-.1-.65-.28l-1.34-.9a1.43 1.43 0 00-1.36.12c-.36.36-.42-.87-.17 1.31.08.13.19-.24-.31-.33a.48.48 0 00.65-.05L3.5 21.9c.24-.18-.57-.22.87-.1l2.03.73a.9.9 0 00-1.16-.57c.15-.3.1-.65-.12-.9l-1.34-.9c-.43-.29-.58-.87-.31-1.3l1.29-2.34c.24-.18.57-.22.87-.1l2.03.73c.49.18 1-.08 1.2-.55s.08-1-.31-1.3l-1.8-1.32z"></path>
        </svg>
        Pedir Producto
      </button>
    `;
    
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
 * Analiza el horario de hoy y determina si el negocio está abierto.
 * @param {Array<Object>} horarios Array de objetos con {dia, horario}.
 * @returns {Object|null} Objeto {estado: 'abierto'|'cerrado', texto: string} o null si no hay datos.
 */
function getEstadoHorario(horarios) {
  if (!horarios || !Array.isArray(horarios) || horarios.length === 0) {
    return null;
  }

  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const now = new Date();
  const hoyNombre = dias[now.getDay()];

  const horarioHoy = horarios.find(h => h.dia === hoyNombre);

  if (!horarioHoy || !horarioHoy.horario || horarioHoy.horario.toLowerCase().includes('cerrado')) {
    return { estado: 'cerrado', texto: 'Cerrado Hoy' };
  }
  
  // Simplificado: si tiene horario, se asume abierto para el badge, y se muestra el texto.
  return { estado: 'abierto', texto: horarioHoy.horario };
}

/**
 * Crea una tarjeta DOM de negocio con toda la lógica de horarios, botones y navegación.
 * @param {Object} negocio Objeto negocio con propiedades: nombre, logo_url, direccion, telefono, whatsapp, horarios, google_url.
 * @returns {HTMLElement} Elemento div con la tarjeta renderizada.
 */
export function createBusinessCard(negocio) {
  const card = document.createElement('div');
  card.className = 'bg-white rounded-2xl border border-gray-200/60 p-5 shadow-sm hover:shadow-md hover:border-orange-100 transition-all flex flex-col h-full';

  // Enriquecer con información de horario
  const horarioInfo = getEstadoHorario(negocio.horarios);

  const logoUrl = negocio.logo_url || 'https://via.placeholder.com/400?text=';
  
  const telefono = negocio.telefono || '';
  const whatsapp = negocio.whatsapp || telefono;
  const telHref = telefono ? `tel:${telefono.replace(/\D/g, '')}` : '#';
  const waHref = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}` : '#';

  // Badge y texto de horario
  let horarioHtml = '';
  if (horarioInfo) {
    const badgeClass = horarioInfo.estado === 'abierto'
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800';
    const badgeText = horarioInfo.estado === 'abierto' ? 'Abierto' : 'Cerrado Hoy';
    const horarioTexto = horarioInfo.estado === 'abierto' ? `• ${horarioInfo.texto}` : '';

    horarioHtml = `
      <div class="flex items-center gap-2 mt-2 flex-wrap">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClass}">
          ${badgeText}
        </span>
        <span class="text-xs text-gray-500">${horarioTexto}</span>
      </div>
    `;
  }

  // Dirección como enlace
  const direccionHtml = negocio.direccion
    ? `<a href="${negocio.google_url || '#'}" target="_blank" rel="noopener noreferrer" class="flex items-start text-sm mt-3 group">
        <span class="material-symbols-outlined !text-lg mr-1.5 text-gray-400 group-hover:text-orange-highlight">location_on</span>
        <span class="text-gray-700 group-hover:text-orange-highlight">${negocio.direccion}</span>
      </a>`
    : '';

  card.innerHTML = `
    <div class="relative h-32 bg-gray-100 rounded-xl mb-4 overflow-hidden group">
      <img alt="${negocio.nombre || ''} logo" class="h-full w-full object-cover group-hover:scale-105 transition-transform" src="${logoUrl}" onerror="this.style.display='none'">
    </div>
    <div class="flex-grow">
      <h3 class="font-bold text-xl text-gray-900 leading-tight">${negocio.nombre || 'Sin nombre'}</h3>
      
      ${direccionHtml}
      ${horarioHtml}
    </div>

    <div class="mt-5 pt-5 border-t border-gray-100">
      <div class="grid grid-cols-2 gap-2">
          <a href="${telHref}" ${!telefono ? 'style="pointer-events: none; opacity: 0.5;"' : ''} class="col-span-1 bg-white text-gray-700 border border-gray-200 font-bold py-2.5 rounded-xl text-center text-sm hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-colors">
              <span class="material-symbols-outlined !text-base">call</span> Llamar
          </a>
          <a href="${waHref}" ${!whatsapp ? 'style="pointer-events: none; opacity: 0.5;"' : ''} target="_blank" rel="noopener noreferrer" class="col-span-1 bg-white text-gray-700 border border-gray-200 font-bold py-2.5 rounded-xl text-center text-sm hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-colors">
              <span class="material-symbols-outlined !text-base">chat</span> WhatsApp
          </a>
      </div>
      <button class="w-full bg-orange-50 text-orange-600 font-bold py-3 rounded-xl mt-2 text-center flex items-center justify-center gap-2 hover:bg-orange-100 transition-colors text-sm" data-navigate="view-profile">
          Ver Perfil
      </button>
    </div>
  `;

  const navigateBtn = card.querySelector('[data-navigate]');
  if (navigateBtn) {
    navigateBtn.addEventListener('click', () => {
      const navigateTo = window.navigateTo;
      if (navigateTo) navigateTo('view-profile');
    });
  }

  return card;
}


/**
 * Renderiza las tarjetas de negocios con el nuevo diseño y lógica.
 */
export function renderNegocios(negocios, message = null) {
  const container = document.getElementById('businesses-container');
  const messageEl = document.getElementById('search-message-business');
  
  if (message) {
    messageEl.textContent = message;
    messageEl.classList.remove('hidden');
  } else {
    messageEl.classList.add('hidden');
  }
  
  container.innerHTML = '';

  const enrichedNegocios = (negocios || []).map(negocio => ({
    ...negocio,
    horarioInfo: getEstadoHorario(negocio.horarios)
  }));

  // Ordenamiento: 1. Abiertos, 2. Cerrados, 3. Sin info
  enrichedNegocios.sort((a, b) => {
    const estadoA = a.horarioInfo ? (a.horarioInfo.estado === 'abierto' ? 2 : 1) : 0;
    const estadoB = b.horarioInfo ? (b.horarioInfo.estado === 'abierto' ? 2 : 1) : 0;
    return estadoB - estadoA;
  });

  enrichedNegocios.forEach(negocio => {
    const card = createBusinessCard(negocio);
    container.appendChild(card);
  });
}