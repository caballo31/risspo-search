let lastListView = 'view-results-product';

/**
 * Navega a una vista específica
 */
export function navigateTo(viewId) {
  if (viewId === 'view-profile') {
    const currentView = document.querySelector('.view-section:not(.hidden)');
    if (currentView && currentView.id.includes('results')) {
      lastListView = currentView.id;
    }
  }

  document.querySelectorAll('.view-section').forEach(el => {
    if (el.id !== viewId) {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
      el.scrollTop = 0;
    }
  });
}

/**
 * Vuelve a la última vista de lista
 */
export function goBack() {
  navigateTo(lastListView);
}
