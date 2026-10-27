(() => {
  const toggle = document.querySelector('[data-toggle-nav]');
  const sidebar = document.getElementById('host-sidebar');
  const close = () => {
    document.body.classList.remove('nav-open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.focus();
  };
  toggle?.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
    if (open) sidebar?.querySelector('a')?.focus();
  });
  document.querySelector('[data-close-nav]')?.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (!document.body.classList.contains('nav-open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const focusable = [...sidebar.querySelectorAll('a,button,input,select')].filter((el) => !el.disabled && el.offsetParent !== null);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  matchMedia('(min-width:981px)').addEventListener('change', (event) => { if (event.matches) document.body.classList.remove('nav-open'); });

  const tabGroups = document.querySelectorAll('[data-tabs]');
  function selectTabs() {
    tabGroups.forEach((group) => {
      const links = [...group.querySelectorAll('a[href^="#"]')];
      const selected = links.find((a) => a.hash === location.hash) || links[0];
      if (!selected) return;
      links.forEach((a) => {
        const active = a === selected;
        a.classList.toggle('active', active);
        a.setAttribute('aria-selected', String(active));
        const panel = document.getElementById(a.hash.slice(1));
        if (panel) panel.hidden = !active;
      });
    });
  }
  addEventListener('hashchange', selectTabs);
  selectTabs();
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    const field = document.getElementById(button.dataset.copy);
    try {
      await navigator.clipboard.writeText(field.value);
      button.textContent = 'Đã copy';
    } catch {
      field.focus(); field.select();
      button.textContent = 'Chọn link để copy';
    }
  }));
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form.matches('[data-phone-lookup]')) return;
    const warning = form.dataset.confirm;
    if (warning && !confirm(warning)) event.preventDefault();
  });
})();
