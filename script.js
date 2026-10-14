document.addEventListener('DOMContentLoaded', () => {
  initHeroShader();

  const grid = document.getElementById('productGrid');
  const cards = Array.from(grid.querySelectorAll('.product-card'));
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const filterButton = document.getElementById('filterButton');
  const filterMenu = document.getElementById('filterMenu');

  let activeFilter = 'all';

  // --- Mark out-of-stock buttons so they can't be clicked ---
  grid.querySelectorAll('.download-button').forEach((btn) => {
    if (btn.textContent.toUpperCase().includes('NO IN STOCK')) {
      btn.classList.add('out-of-stock');
      btn.removeAttribute('href');
    }
  });

  // --- Filter dropdown open/close ---
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

  // --- Search ---
  searchInput.addEventListener('input', applyFilters);

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    cards.forEach((card) => {
      const status = (card.dataset.status || '').toLowerCase();
      const category = (card.dataset.category || '').toLowerCase();
      const matchesStatus =
        activeFilter === 'all' ||
        (activeFilter === 'free' && status === 'free') ||
        (activeFilter === 'sell' && status === 'sell') ||
        category === activeFilter.toLowerCase();
      const matchesSearch = !query || (card.dataset.search || '').toLowerCase().includes(query);
      const visible = matchesStatus && matchesSearch;
      card.hidden = !visible;
      if (visible) visibleCount++;
    });

    emptyState.hidden = visibleCount !== 0;
  }

  // --- Downloads ---
  // Real files use plain <a href="..." download> links and need no JS.
  // This only handles leftover placeholder <button> cards with data-content.
  grid.querySelectorAll('button.download-button[data-content]').forEach((button) => {
    button.addEventListener('click', () => {
      const fileName = button.dataset.file || 'mengheng-download.txt';
      const content = (button.dataset.content || '').replace(/\\n/g, '\n');

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const originalLabel = button.innerHTML;
      button.classList.add('done');
      button.innerHTML = 'Downloaded <span>&#10003;</span>';
      setTimeout(() => {
        button.classList.remove('done');
        button.innerHTML = originalLabel;
      }, 1800);
    });
  });

  // --- Requirements / payment modal for real-file download links ---
  const specsOverlay = document.getElementById('specsOverlay');
  const specsTitle = document.getElementById('specsModalTitle');
  const specsLine = document.getElementById('specsModalSpecs');
  const specsConfirm = document.getElementById('specsConfirm');
  const specsClose = document.getElementById('specsClose');
  const specsCancel = document.getElementById('specsCancel');
  const specsQRWrap = document.getElementById('specsQRWrap');
  const specsQR = document.getElementById('specsQR');
  const specsPrice = document.getElementById('specsPrice');
  const specsStatus = document.getElementById('specsStatus');
  let activePaymentLink = null;

  function getProductKey(link) {
    return link.dataset.name || link.getAttribute('href') || link.textContent.trim();
  }

  function sendActivityLog(event, link) {
    const isLocalPage = window.location.protocol === 'file:' ||
      ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const logEndpoint = isLocalPage
      ? 'http://127.0.0.1:8001/api/log'
      : '/api/log';
    fetch(logEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        product: getProductKey(link),
        price: link.dataset.price || 'Not specified',
      }),
    }).then(async (response) => {
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Activity log failed (${response.status}): ${details}`);
      }
    }).catch((error) => {
      console.error('Could not send Telegram activity log:', error);
    });
  }

  function closeSpecs() {
    specsOverlay.classList.remove('open');
  }

  function cancelPayment() {
    closeSpecs();
  }

  // Step 1: shows the "Generate QR" button. No QR yet, no timer yet.
  function openPaymentModal(link) {
    activePaymentLink = link;
    sendActivityLog('buy_clicked', link);

    specsTitle.textContent = link.dataset.name || 'This product';
    specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');

    specsQRWrap.hidden = true;
    specsQR.src = '';

    specsPrice.textContent = link.dataset.price || 'Payment required';
    specsStatus.textContent = 'Click below to generate your payment QR code. | ចុចខាងក្រោមដើម្បីបង្កើត QR ទូទាត់ប្រាក់';

    specsConfirm.hidden = false;
    specsConfirm.removeAttribute('aria-disabled');
    specsConfirm.classList.remove('disabled');
    specsConfirm.innerHTML = 'Generate QR <span>&#8595;</span>';
    specsConfirm.href = '#';
    specsConfirm.removeAttribute('download');
    specsConfirm.dataset.mode = 'generate';
    specsConfirm.dataset.productKey = getProductKey(link);

    specsOverlay.classList.add('open');
  }

  function openSellModal(link) {
    activePaymentLink = null;
    sendActivityLog('buy_clicked', link);

    specsTitle.textContent = link.dataset.name || 'This product';
    specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');
    specsQRWrap.hidden = true;
    specsQR.src = '';
    specsPrice.textContent = link.dataset.price || 'Price not specified';
    specsStatus.textContent = 'Contact MengHeng Productions on Telegram to purchase this item.';

    specsConfirm.hidden = false;
    specsConfirm.innerHTML = 'Contact to buy <span>&#8599;</span>';
    specsConfirm.href = 'https://t.me/MengHeng_KH';
    specsConfirm.target = '_blank';
    specsConfirm.rel = 'noopener noreferrer';
    specsConfirm.removeAttribute('download');
    specsConfirm.removeAttribute('aria-disabled');
    specsConfirm.classList.remove('disabled');
    specsConfirm.dataset.mode = 'contact';
    specsConfirm.dataset.productKey = getProductKey(link);

    specsOverlay.classList.add('open');
  }

  // Reveal the product's configured payment QR without claiming payment succeeded.
  function generateQR(link) {
    const paymentQR = link.dataset.paymentQr;
    if (!paymentQR) {
      specsStatus.textContent = 'Payment QR is not available for this product yet.';
      return;
    }

    specsQR.src = paymentQR;
    specsQR.alt = `${specsTitle.textContent} payment QR code`;
    specsQRWrap.hidden = false;
    specsStatus.textContent = 'Scan this KHQR code to pay. Your download will be provided after payment is confirmed.';
    specsConfirm.hidden = true;
    sendActivityLog('qr_generated', link);
  }

  function openFreeDownloadModal(link) {
    specsTitle.textContent = link.dataset.name || 'This product';
    if (link.dataset.specsList) {
      specsLine.innerHTML = `<ul class="specs-list">${link.dataset.specsList.split('|').map((spec) => `<li>${spec}</li>`).join('')}</ul>`;
    } else {
      specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');
    }
    specsQRWrap.hidden = true;
    specsPrice.textContent = '';
    specsStatus.textContent = 'Ready to download';
    specsConfirm.hidden = false;
    specsConfirm.innerHTML = 'Download <span>&#8595;</span>';
    const destination = link.getAttribute('href');
    specsConfirm.href = destination;
    if (/^https?:\/\//i.test(destination || '')) {
      specsConfirm.target = '_blank';
      specsConfirm.rel = 'noopener noreferrer';
    } else {
      specsConfirm.removeAttribute('target');
      specsConfirm.removeAttribute('rel');
    }
    specsConfirm.setAttribute('download', link.getAttribute('download') || '');
    specsConfirm.dataset.mode = 'download';

    specsOverlay.classList.add('open');
  }

  grid.querySelectorAll('a.download-button[data-specs]:not(.out-of-stock)').forEach((link) => {
    link.addEventListener('click', (e) => {
      // External free links should leave the site directly in a new tab.
      if (!link.dataset.paymentQr && link.closest('.product-card')?.dataset.status !== 'sell' &&
          /^https?:\/\//i.test(link.href)) {
        return;
      }

      e.preventDefault();
      if (link.dataset.paymentQr) {
        openPaymentModal(link);
      } else if (link.closest('.product-card')?.dataset.status === 'sell') {
        openSellModal(link);
      } else {
        openFreeDownloadModal(link);
      }
    });
  });

  specsConfirm.addEventListener('click', (e) => {
    if (specsConfirm.dataset.mode === 'generate') {
      e.preventDefault();
      generateQR(activePaymentLink);
      return;
    }

    if (specsConfirm.dataset.mode === 'contact') return;
    setTimeout(closeSpecs, 200);
  });

  specsClose.addEventListener('click', () => {
    cancelPayment();
  });
  specsCancel.addEventListener('click', cancelPayment);
  specsOverlay.addEventListener('click', (e) => {
    if (e.target === specsOverlay) cancelPayment();
  });
});

function initHeroShader() {
  const canvas = document.getElementById('canvas');
  const image = document.getElementById('sourceImage');
  if (!canvas || !image) return;

  const gl = canvas.getContext('webgl', { premultipliedAlpha: false });
  if (!gl) return;

  const vertexSource = `attribute vec2 position; varying vec2 uv; void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;
  const fragmentSource = `precision mediump float;
    uniform vec2 resolution; uniform float time; uniform vec2 mouse; uniform sampler2D image;
    varying vec2 uv;
    void main() {
      vec2 centered = uv - 0.5;
      float distanceFromMouse = length(centered - (mouse - 0.5) * 0.25);
      float lens = smoothstep(0.75, 0.05, distanceFromMouse) * 0.035;
      vec2 warped = uv + normalize(centered + 0.001) * lens * sin(time * 0.35);
      float scan = sin((uv.y + time * 0.025) * 18.0) * 0.008;
      vec4 color = texture2D(image, warped + vec2(scan, 0.0));
      float light = 0.10 * sin(time * 0.45 + uv.x * 5.0) + 0.08 * (1.0 - distanceFromMouse);
      gl_FragColor = vec4(color.rgb + light, 1.0);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return;
  const program = gl.createProgram();
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const resolution = gl.getUniformLocation(program, 'resolution');
  const time = gl.getUniformLocation(program, 'time');
  const mouse = gl.getUniformLocation(program, 'mouse');
  let pointer = { x: 0.5, y: 0.5 };
  canvas.addEventListener('pointermove', (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointer = { x: (event.clientX - bounds.left) / bounds.width, y: 1 - (event.clientY - bounds.top) / bounds.height };
  });

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize); resize();

  function render(now) {
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(time, now * 0.001); gl.uniform2f(mouse, pointer.x, pointer.y);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); requestAnimationFrame(render);
  }
  image.addEventListener('load', () => {
    gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    requestAnimationFrame(render);
  });
  if (image.complete) image.dispatchEvent(new Event('load'));
}
