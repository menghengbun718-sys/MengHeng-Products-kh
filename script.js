document.addEventListener('DOMContentLoaded', () => {
  // ---------- Safe storage (can throw in private mode / blocked cookies) ----------
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
  };

  // ---------- Theme ----------
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = themeToggle?.querySelector('.theme-toggle-icon');
  const themeText = themeToggle?.querySelector('.theme-toggle-text');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = store.get('mengheng-theme') || (prefersDark ? 'dark' : 'light');

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    if (themeIcon) themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    if (themeText) themeText.textContent = theme === 'dark' ? 'Light' : 'Theme';
    store.set('mengheng-theme', theme);
  }

  applyTheme(initialTheme);
  themeToggle?.addEventListener('click', () => {
    applyTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // ---------- Elements ----------
  const grid = document.getElementById('productGrid');
  const cards = Array.from(grid.querySelectorAll('.product-card'));
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const filterButton = document.getElementById('filterButton');
  const filterMenu = document.getElementById('filterMenu');

  let activeFilter = 'all';

  // ---------- Out-of-stock buttons can't be clicked ----------
  grid.querySelectorAll('.download-button').forEach((btn) => {
    if (btn.textContent.toUpperCase().includes('NO IN STOCK')) {
      btn.classList.add('out-of-stock');
      btn.removeAttribute('href');
    }
  });

  // ---------- Filter dropdown ----------
  filterButton.addEventListener('click', () => {
    const isOpen = filterMenu.classList.toggle('open');
    filterButton.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!filterButton.contains(e.target) && !filterMenu.contains(e.target)) {
      filterMenu.classList.remove('open');
      filterButton.setAttribute('aria-expanded', 'false');
    }
  });

  filterMenu.querySelectorAll('button[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      filterMenu.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filterButton.firstChild.textContent = btn.textContent.trim() + ' ';
      filterMenu.classList.remove('open');
      filterButton.setAttribute('aria-expanded', 'false');
      applyFilters();
    });
  });

  // ---------- Search ----------
  searchInput.addEventListener('input', applyFilters);

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    cards.forEach((card) => {
      const status = (card.dataset.status || '').toLowerCase();
      const category = (card.dataset.category || '').toLowerCase();
      const filter = activeFilter.toLowerCase();
      const matchesFilter =
        filter === 'all' ||
        (filter === 'free' && status === 'free') ||
        category === filter;
      const matchesSearch = !query || (card.dataset.search || '').toLowerCase().includes(query);
      const visible = matchesFilter && matchesSearch;
      card.hidden = !visible;
      if (visible) visibleCount++;
    });

    emptyState.hidden = visibleCount !== 0;
  }

  // ---------- Activity log (optional Telegram notification via /api/log) ----------
  // Configured by <meta name="log-endpoint" content="...">. Use "off" on static hosts
  // that have no backend, or a full https:// URL if the API lives elsewhere.
  function logEndpoint() {
    const configured = (document.querySelector('meta[name="log-endpoint"]')?.content || '/api/log').trim();
    if (!configured || configured.toLowerCase() === 'off') return null;

    const host = location.hostname;
    const isLocalHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
    // Page opened straight from disk, or served by a different local dev server:
    // talk to server.py on its default port.
    if (location.protocol === 'file:' || (isLocalHost && location.port && location.port !== '8001')) {
      return 'http://127.0.0.1:8001/api/log';
    }
    return configured;
  }

  function productName(link) {
    return link.dataset.name || link.getAttribute('download') || link.textContent.trim();
  }

  function sendActivityLog(event, name) {
    const endpoint = logEndpoint();
    if (!endpoint) return;
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, product: name }),
        keepalive: true,
      }).catch(() => { /* logging must never break the page */ });
    } catch { /* ignore */ }
  }

  // ---------- Downloads ----------
  const specsOverlay = document.getElementById('specsOverlay');
  const specsTitle = document.getElementById('specsModalTitle');
  const specsLine = document.getElementById('specsModalSpecs');
  const specsConfirm = document.getElementById('specsConfirm');
  const specsClose = document.getElementById('specsClose');
  const specsCancel = document.getElementById('specsCancel');
  let lastFocused = null;

  function openDownloadModal(link) {
    lastFocused = document.activeElement;
    specsTitle.textContent = link.dataset.name || 'This item';
    specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');

    const destination = link.getAttribute('href');
    specsConfirm.href = destination;
    specsConfirm.dataset.product = productName(link);
    if (/^https?:\/\//i.test(destination || '')) {
      specsConfirm.target = '_blank';
      specsConfirm.rel = 'noopener noreferrer';
    } else {
      specsConfirm.removeAttribute('target');
      specsConfirm.removeAttribute('rel');
    }
    const fileName = link.getAttribute('download');
    if (fileName !== null) specsConfirm.setAttribute('download', fileName);
    else specsConfirm.removeAttribute('download');

    specsOverlay.classList.add('open');
    specsConfirm.focus();
  }

  function closeModal() {
    specsOverlay.classList.remove('open');
    lastFocused?.focus?.();
  }

  grid.querySelectorAll('a.download-button:not(.out-of-stock)').forEach((link) => {
    link.addEventListener('click', (e) => {
      // External links (Drive, official libraries, ...) open directly in a new tab.
      if (/^https?:\/\//i.test(link.getAttribute('href') || '')) {
        sendActivityLog('link_opened', productName(link));
        return;
      }
      // Files hosted on this site: show the info modal first.
      if (link.dataset.specs) {
        e.preventDefault();
        openDownloadModal(link);
      } else {
        sendActivityLog('download_clicked', productName(link));
      }
    });
  });

  specsConfirm.addEventListener('click', () => {
    sendActivityLog('download_clicked', specsConfirm.dataset.product || 'unknown product');
    setTimeout(closeModal, 200);
  });

  specsClose.addEventListener('click', closeModal);
  specsCancel.addEventListener('click', closeModal);
  specsOverlay.addEventListener('click', (e) => {
    if (e.target === specsOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && specsOverlay.classList.contains('open')) closeModal();
  });
});
