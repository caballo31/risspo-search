let lastListView = 'view-results-product'; 

/**
 * Navega a una vista específica
 */
export function navigateTo(viewId) {
  if(viewId === 'view-profile') {
    const currentView = document.querySelector('.view-section.active');
    if (currentView && currentView.id.includes('results')) {
        lastListView = currentView.id;
    }
  }

  document.querySelectorAll('.view-section').forEach(el => {
    el.classList.remove('active');
    setTimeout(() => el.classList.add('hidden'), 200);
  });

  const target = document.getElementById(viewId);
  if (target) {
    target.classList.remove('hidden');
    setTimeout(() => target.classList.add('active'), 10);
    target.scrollTop = 0;
  }
}

/**
 * Vuelve a la última vista de lista
 */
export function goBack() {
  navigateTo(lastListView);
}

