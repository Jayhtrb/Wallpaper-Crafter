(() => {
  'use strict';

  /* ---------- Config ---------- */
  const IMAGE_API_BASE = 'https://image.pollinations.ai/prompt/';
  const MODEL = 'flux';
  const PREVIEW_MAX_EDGE = 900; // keep the live preview fast
  const DOWNLOAD_MAX_EDGE = 2048; // cap very large requests (desktop/4K) for reliability
  const LOAD_TIMEOUT_MS = 30000;
  const HISTORY_KEY = 'wallpaperai.history.v1';
  const HISTORY_LIMIT = 8;

  const SURPRISE_PROMPTS = [
    'a bioluminescent forest at midnight, glowing mushrooms, fog',
    'a lone astronaut floating above a pastel-colored planet',
    'geometric origami mountains catching golden hour light',
    'a koi pond seen from above, ripples and falling cherry blossoms',
    'liquid marble swirls in deep teal and copper',
    'a cozy reading nook by a rainy window, warm lamp light',
    'aurora borealis over a frozen lake, long exposure style',
    'a retro-futuristic city skyline at dusk, synthwave palette',
    'macro photo of dew drops on a spiderweb at sunrise',
    'an abstract paper-cut landscape with layered mountains',
  ];

  /* ---------- State ---------- */
  let currentSeed = randomSeed();
  let currentPhone = null; // { id, name, w, h }
  let loadToken = 0;

  /* ---------- Elements ---------- */
  const form = document.getElementById('generate-form');
  const promptEl = document.getElementById('prompt');
  const surpriseBtn = document.getElementById('surprise-btn');
  const chipInputs = () => Array.from(document.querySelectorAll('#style-chips input[type="checkbox"]'));
  const realismEl = document.getElementById('realism');
  const realismValueEl = document.getElementById('realism-value');
  const phoneSelect = document.getElementById('phone-select');
  const customRow = document.getElementById('custom-size-row');
  const customWidthEl = document.getElementById('custom-width');
  const customHeightEl = document.getElementById('custom-height');
  const resolutionHint = document.getElementById('resolution-hint');
  const generateBtn = document.getElementById('generate-btn');
  const mockup = document.getElementById('phone-mockup');
  const previewImg = document.getElementById('preview-img');
  const retryBtn = document.getElementById('retry-btn');
  const errorText = document.getElementById('error-text');
  const regenerateBtn = document.getElementById('regenerate-btn');
  const downloadBtn = document.getElementById('download-btn');
  const historySection = document.getElementById('history-section');
  const historyList = document.getElementById('history-list');
  const installBtn = document.getElementById('install-btn');

  /* ---------- Init ---------- */
  populatePhoneSelect();
  updatePhoneChoice();
  updateRealismOutput();
  renderHistory();
  registerServiceWorker();
  setupInstallPrompt();

  phoneSelect.addEventListener('change', updatePhoneChoice);
  customWidthEl.addEventListener('input', updatePhoneChoice);
  customHeightEl.addEventListener('input', updatePhoneChoice);
  realismEl.addEventListener('input', updateRealismOutput);
  surpriseBtn.addEventListener('click', () => {
    const pick = SURPRISE_PROMPTS[Math.floor(Math.random() * SURPRISE_PROMPTS.length)];
    promptEl.value = pick;
    promptEl.focus();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    currentSeed = randomSeed();
    generate();
  });
  retryBtn.addEventListener('click', () => generate());
  regenerateBtn.addEventListener('click', () => {
    currentSeed = randomSeed();
    generate();
  });
  downloadBtn.addEventListener('click', downloadCurrent);

  /* ---------- Phone select ---------- */
  function populatePhoneSelect() {
    for (const group of PHONE_CATALOG) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.brand;
      for (const model of group.models) {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.name;
        opt.dataset.w = model.w;
        opt.dataset.h = model.h;
        optgroup.appendChild(opt);
      }
      phoneSelect.appendChild(optgroup);
    }
    const customOpt = document.createElement('option');
    customOpt.value = CUSTOM_PHONE.id;
    customOpt.textContent = CUSTOM_PHONE.name;
    phoneSelect.appendChild(customOpt);

    // Default to a sensible common phone.
    phoneSelect.value = 'iphone-16';
  }

  function updatePhoneChoice() {
    const selectedId = phoneSelect.value;
    const isCustom = selectedId === CUSTOM_PHONE.id;
    customRow.hidden = !isCustom;

    if (isCustom) {
      const w = clampInt(customWidthEl.value, 200, 4096, 1080);
      const h = clampInt(customHeightEl.value, 200, 4096, 2400);
      currentPhone = { id: 'custom', name: 'Custom size', w, h };
    } else {
      const opt = phoneSelect.selectedOptions[0];
      currentPhone = {
        id: selectedId,
        name: opt.textContent,
        w: Number(opt.dataset.w),
        h: Number(opt.dataset.h),
      };
    }

    mockup.style.setProperty('--phone-ar', `${currentPhone.w} / ${currentPhone.h}`);

    const capped = capDimensions(currentPhone.w, currentPhone.h, DOWNLOAD_MAX_EDGE);
    let hint = `${currentPhone.w} × ${currentPhone.h}px`;
    if (capped.w !== currentPhone.w) {
      hint += ` (downloads capped to ${capped.w} × ${capped.h}px for reliability)`;
    }
    resolutionHint.textContent = hint;
  }

  /* ---------- Realism slider ---------- */
  function updateRealismOutput() {
    const v = Number(realismEl.value);
    realismEl.style.setProperty('--progress', `${v}%`);
    realismValueEl.textContent = `${v}% photoreal`;
  }

  /* ---------- Prompt composition ---------- */
  function composeFullPrompt() {
    const base = promptEl.value.trim();
    const styles = chipInputs()
      .filter((c) => c.checked)
      .map((c) => c.value);
    const realism = Number(realismEl.value);
    let look;
    if (realism >= 70) look = 'photorealistic, highly detailed, sharp focus, 8k';
    else if (realism <= 30) look = 'digital art, illustrated, stylized';
    else look = 'detailed digital painting';

    const parts = [base, ...styles, look, 'vertical mobile wallpaper composition', 'no text, no watermark, no logo'];
    return parts.filter(Boolean).join(', ');
  }

  function buildImageUrl(prompt, w, h, seed) {
    return `${IMAGE_API_BASE}${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=${MODEL}`;
  }

  /* ---------- Generation ---------- */
  function generate() {
    if (!promptEl.reportValidity()) return;
    if (!currentPhone) return;

    const prompt = composeFullPrompt();
    const preview = capDimensions(currentPhone.w, currentPhone.h, PREVIEW_MAX_EDGE);
    const url = buildImageUrl(prompt, preview.w, preview.h, currentSeed);

    setState('loading');
    generateBtn.disabled = true;
    regenerateBtn.disabled = true;

    const token = ++loadToken;
    const probe = new Image();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (token === loadToken) handleFailure('That took too long to generate. The free service may be busy — please try again.');
    }, LOAD_TIMEOUT_MS);

    probe.onload = () => {
      clearTimeout(timer);
      if (timedOut || token !== loadToken) return;
      previewImg.src = url;
      previewImg.alt = promptEl.value.trim() ? `AI-generated wallpaper: ${promptEl.value.trim()}` : 'AI-generated wallpaper';
      setState('ready');
      generateBtn.disabled = false;
      regenerateBtn.disabled = false;
      downloadBtn.disabled = false;
      saveToHistory({ prompt, seed: currentSeed, phone: currentPhone, url, thumb: url });
    };
    probe.onerror = () => {
      clearTimeout(timer);
      if (timedOut || token !== loadToken) return;
      handleFailure('The free image service couldn’t generate that image. Please try again, or tweak your prompt.');
    };
    probe.src = url;

    function handleFailure(message) {
      errorText.textContent = message;
      setState('error');
      generateBtn.disabled = false;
      regenerateBtn.disabled = false;
    }
  }

  function setState(state) {
    mockup.dataset.state = state;
  }

  /* ---------- Download ---------- */
  async function downloadCurrent() {
    if (!currentPhone) return;
    const prompt = composeFullPrompt();
    const full = capDimensions(currentPhone.w, currentPhone.h, DOWNLOAD_MAX_EDGE);
    const url = buildImageUrl(prompt, full.w, full.h, currentSeed);

    const originalLabel = downloadBtn.innerHTML;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Preparing full-res image…';

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (currentPhone.name || 'wallpaper').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      a.href = objectUrl;
      a.download = `wallpaper-${safeName}-${full.w}x${full.h}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    } catch (err) {
      // Fallback: open in a new tab so the user can save it manually.
      window.open(url, '_blank', 'noopener');
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = originalLabel;
    }
  }

  /* ---------- History ---------- */
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveToHistory(entry) {
    try {
      const history = loadHistory();
      history.unshift({ ...entry, phone: { id: entry.phone.id, name: entry.phone.name, w: entry.phone.w, h: entry.phone.h }, ts: Date.now() });
      const trimmed = history.slice(0, HISTORY_LIMIT);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      renderHistory();
    } catch {
      /* localStorage unavailable — history just won't persist */
    }
  }

  function renderHistory() {
    const history = loadHistory();
    historySection.hidden = history.length === 0;
    historyList.innerHTML = '';
    for (const item of history) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'history-thumb';
      btn.type = 'button';
      btn.title = item.prompt;
      const img = document.createElement('img');
      img.src = item.thumb;
      img.alt = '';
      img.loading = 'lazy';
      btn.appendChild(img);
      btn.addEventListener('click', () => restoreFromHistory(item));
      li.appendChild(btn);
      historyList.appendChild(li);
    }
  }

  function restoreFromHistory(item) {
    currentSeed = item.seed;
    currentPhone = item.phone;

    // Reflect the phone choice in the controls if it still exists in the catalog.
    const opt = Array.from(phoneSelect.options).find((o) => o.value === item.phone.id);
    if (opt) {
      phoneSelect.value = item.phone.id;
      updatePhoneChoice();
    } else {
      phoneSelect.value = CUSTOM_PHONE.id;
      customWidthEl.value = item.phone.w;
      customHeightEl.value = item.phone.h;
      updatePhoneChoice();
    }

    previewImg.src = item.url;
    previewImg.alt = `AI-generated wallpaper: ${item.prompt}`;
    setState('ready');
    downloadBtn.disabled = false;
    regenerateBtn.disabled = false;
  }

  /* ---------- Helpers ---------- */
  function randomSeed() {
    return Math.floor(Math.random() * 1_000_000_000);
  }

  function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function capDimensions(w, h, maxEdge) {
    const longest = Math.max(w, h);
    if (longest <= maxEdge) return { w, h };
    const scale = maxEdge / longest;
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  }

  /* ---------- Service worker (PWA) ---------- */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  /* ---------- Install prompt (PWA) ---------- */
  function setupInstallPrompt() {
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.hidden = false;
    });
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      installBtn.hidden = true;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    });
    window.addEventListener('appinstalled', () => {
      installBtn.hidden = true;
    });
  }
})();
