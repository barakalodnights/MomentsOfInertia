(() => {
  const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
  const panels = {
    area: document.getElementById('areaPanel'),
    dynamics: document.getElementById('dynamicsPanel'),
    race: document.getElementById('racePanel'),
  };

  if (!tabButtons.length) {
    return;
  }

  const activators = {
    area: () => window.SectionExplorer?.activate?.(),
    dynamics: () => window.DynamicsExplorer?.activate?.(),
    race: () => window.RollingRace?.activate?.(),
  };

  tabButtons.forEach((button, index) => {
    const tabId = button.dataset.tab;
    button.id = button.id || `${tabId}Tab`;
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');

    button.addEventListener('click', () => {
      if (button.classList.contains('is-active')) {
        return;
      }

      tabButtons.forEach((btn) => {
        const target = btn.dataset.tab;
        const panel = panels[target];
        const isActive = btn === button;

        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');

        if (panel) {
          panel.classList.toggle('is-active', isActive);
          panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        }
      });

      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        activators[tabId]?.();
      });
    });
  });

  activators.area?.();
})();
