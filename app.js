const API_BASE = 'https://api.vidgo.ai';
const POLL_INTERVAL = 3000;
const STORAGE_KEY = 'varvos_api_key';
const HISTORY_STORAGE_KEY = 'varvos_history';
const CREDITS_STORAGE_KEY = 'varvos_credits';
const AUTH_STORAGE = 'varvos_user';
const ACTIVE_TASK_STORAGE = 'varvos_active_task';

let selectedModel = 'sora-2';
let currentMode = 'video';
let currentTaskId = null;
let lastPrompt = '';
let refImageUrl = '';  // Video reference (uploaded)
let imgRefUrl = '';   // Image reference (uploaded)
let motionCharImageUrl = '';  // Kling: character image
let motionRefVideoUrl = '';   // Kling: reference video

// Elements
const generateForm = document.getElementById('generateForm');
const btnGenerate = document.getElementById('btnGenerate');
const outputPlaceholder = document.getElementById('outputPlaceholder');
const outputResultsList = document.getElementById('outputResultsList');

function getCardRefs(cardEl) {
  if (!cardEl) return null;
  return {
    card: cardEl,
    taskStatusEl: cardEl.querySelector('.status-badge'),
    taskProgressEl: cardEl.querySelector('.task-progress'),
    progressFill: cardEl.querySelector('.progress-fill'),
    loadingPlaceholder: cardEl.querySelector('.loading-placeholder'),
    videoPlayer: cardEl.querySelector('.media-output'),
    imageGallery: cardEl.querySelector('.image-gallery'),
    statusMessage: cardEl.querySelector('.status-message'),
    downloadWarning: cardEl.querySelector('.download-warning'),
    downloadBtn: cardEl.querySelector('.btn-download')
  };
}
function getCardByIndex(i) {
  const card = outputResultsList?.querySelector(`.output-result-card[data-card="${i}"]`);
  return card ? getCardRefs(card) : null;
}
const btnVerify = document.getElementById('btnVerify'); // Removido da UI, mantido para compatibilidade
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const btnClearHistory = document.getElementById('btnClearHistory');
const creditsModal = document.getElementById('creditsModal');

const activeTasks = new Map();
const EXPECTED_DURATION_MS = 10 * 60 * 1000;

// Prompt suggestion chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const p = chip.dataset.prompt || '';
    const prompt = document.getElementById('prompt');
    if (prompt) { prompt.value = p; updateClearPromptVisibility(); }
  });
});

// Limpar prompt
function updateClearPromptVisibility() {
  const prompt = document.getElementById('prompt');
  const btn = document.getElementById('btnClearPrompt');
  if (!prompt || !btn) return;
  btn.classList.toggle('empty', !prompt.value.trim());
}

document.getElementById('btnClearPrompt')?.addEventListener('click', () => {
  const prompt = document.getElementById('prompt');
  if (prompt) { prompt.value = ''; prompt.focus(); updateClearPromptVisibility(); }
});

document.getElementById('prompt')?.addEventListener('input', updateClearPromptVisibility);
document.getElementById('prompt')?.addEventListener('change', updateClearPromptVisibility);

// Init clear button visibility
updateClearPromptVisibility();

// Modal vídeo ampliado - Biblioteca de IA
const videoModal = document.getElementById('videoModal');
const videoModalVideo = document.getElementById('videoModalVideo');
const videoModalClose = document.getElementById('videoModalClose');
const btnImitarMovimentoModal = document.getElementById('btnImitarMovimentoModal');

function openVideoModal(src, promptText) {
  if (!videoModal || !videoModalVideo) return;
  videoModalVideo.src = src || '';
  videoModal.dataset.videoSrc = src || '';
  videoModal.classList.remove('hidden');
  videoModalVideo.play().catch(() => {});
}

function closeVideoModal() {
  if (videoModal) {
    videoModal.classList.add('hidden');
    if (videoModalVideo) {
      videoModalVideo.pause();
      videoModalVideo.src = '';
    }
  }
}

function setMotionRefVideoFromUrl(url) {
  if (!url) return;
  const area = document.getElementById('motionRefVideoArea');
  const preview = document.getElementById('motionRefVideoPreview');
  const previewVid = document.getElementById('motionRefVideoPreviewVid');
  if (!area || !preview || !previewVid) return;
  motionRefVideoUrl = url;
  area.classList.add('hidden');
  preview.classList.remove('hidden');
  previewVid.src = url;
  updateMotionReadyState();
}

function handleImitarMovimentoFromModal() {
  const src = videoModal?.dataset?.videoSrc || videoModalVideo?.src || '';
  if (!src) return;
  const isMotionPage = /imitar-movimento/.test(window.location.pathname);
  closeVideoModal();
  if (isMotionPage) {
    setMotionRefVideoFromUrl(src);
    document.getElementById('motionRefVideoUpload')?.closest('.field')?.scrollIntoView({ behavior: 'smooth' });
  } else {
    window.location.href = '../imitar-movimento/?refVideo=' + encodeURIComponent(src);
  }
}

// Sample video slots - abre modal ampliado
document.querySelectorAll('.sample-video-slot').forEach(card => {
  card.addEventListener('click', () => {
    const video = card.querySelector('video');
    const src = video?.src || video?.getAttribute('src') || '';
    const p = card.dataset.prompt || '';
    if (src && src !== 'undefined') openVideoModal(src, p);
  });
});

if (videoModalClose) videoModalClose.addEventListener('click', closeVideoModal);
videoModal?.querySelector('.video-modal-backdrop')?.addEventListener('click', closeVideoModal);
if (btnImitarMovimentoModal) btnImitarMovimentoModal.addEventListener('click', handleImitarMovimentoFromModal);

// Download forçado (evita abrir em nova aba em URLs cross-origin)
async function triggerDownload(url, filename) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'download';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 100);
  } catch (e) {
    window.open(url, '_blank');
  }
}

outputResultsList?.addEventListener('click', (e) => {
  const downloadBtn = e.target.closest('.btn-download');
  if (!downloadBtn) return;
  const href = downloadBtn.getAttribute('href');
  if (href && href !== '#') {
    e.preventDefault();
    const name = downloadBtn.getAttribute('download') || 'varvos-video.mp4';
    triggerDownload(href, name);
  }
});

// Clique no vídeo gerado para abrir modal (delegação)
outputResultsList?.addEventListener('click', (e) => {
  const mediaContainer = e.target.closest('.media-container');
  if (!mediaContainer) return;
  if (e.target.closest('.btn-download')) return;
  const video = mediaContainer.querySelector('.media-output');
  const src = video?.src || video?.getAttribute('src');
  if (src) openVideoModal(src, '');
});

// Event delegation: histórico — download e clique para abrir vídeo
historyList?.addEventListener('click', (e) => {
  const downloadLink = e.target.closest('.creation-actions a');
  if (downloadLink) {
    e.preventDefault();
    const href = downloadLink.getAttribute('href');
    const filename = downloadLink.getAttribute('download') || 'varvos.mp4';
    if (href) triggerDownload(href, filename);
    return;
  }
  const thumb = e.target.closest('.creation-thumb');
  if (thumb) {
    const video = thumb.querySelector('video');
    if (video) {
      const src = video.src || video.getAttribute('src');
      const itemEl = thumb.closest('.creation-item');
      const prompt = itemEl?.querySelector('.prompt')?.textContent || '';
      if (src) openVideoModal(src, prompt);
    } else {
      const img = thumb.querySelector('img');
      if (img?.src) window.open(img.src, '_blank');
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const hamburger = document.getElementById('hamburgerOverlay');
    const plans = document.getElementById('plansModal');
    if (hamburger?.classList.contains('open')) closeHamburger();
    else if (plans && !plans.classList.contains('hidden')) closePlansModal();
    else if (videoModal && !videoModal.classList.contains('hidden')) closeVideoModal();
    else if (creditsModal && !creditsModal.classList.contains('hidden')) closeCreditsModal();
  }
});

document.getElementById('creditsModalClose')?.addEventListener('click', closeCreditsModal);
document.querySelector('.credits-modal-backdrop')?.addEventListener('click', closeCreditsModal);
document.getElementById('creditsModalDismiss')?.addEventListener('click', closeCreditsModal);

// Credits modal: "Ver planos" abre o modal de planos
document.getElementById('creditsModalPlans')?.addEventListener('click', () => {
  closeCreditsModal();
  openPlansModal();
});

// Header: créditos — preferir do usuário (Supabase) quando logado
function getCredits() {
  try {
    const userRaw = localStorage.getItem(AUTH_STORAGE);
    if (userRaw) {
      const user = JSON.parse(userRaw);
      if (user.credits != null && user.credits !== undefined) return parseInt(user.credits, 10);
    }
    const v = localStorage.getItem(CREDITS_STORAGE_KEY);
    return v != null ? parseInt(v, 10) : null;
  } catch { return null; }
}

function updateCreditsDisplay() {
  const n = getCredits();
  const txt = n != null ? String(n) : '0';
  document.querySelectorAll('#headerCredits, #hamburgerCredits').forEach(el => { if (el) el.textContent = txt; });
}

function openPlansModal() {
  const m = document.getElementById('plansModal');
  if (m) {
    m.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closePlansModal() {
  const m = document.getElementById('plansModal');
  if (m) {
    m.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function updateHamburgerUser() {
  const block = document.getElementById('hamburgerUser');
  const nameEl = document.getElementById('hamburgerUserName');
  const avatarEl = document.getElementById('hamburgerUserAvatar');
  const initialEl = document.getElementById('hamburgerUserInitial');
  const wrap = block?.querySelector('.hamburger-user-avatar-wrap');
  if (!block || !nameEl) return;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    if (!user || !user.email) {
      block.classList.add('hidden');
      return;
    }
    block.classList.remove('hidden');
    const name = user.name || user.email?.split('@')[0] || 'Usuário';
    nameEl.textContent = name;
    if (user.picture && avatarEl && wrap) {
      avatarEl.src = user.picture;
      avatarEl.alt = name;
      wrap.classList.add('has-img');
    } else if (initialEl && wrap) {
      initialEl.textContent = (name.charAt(0) || '?').toUpperCase();
      wrap.classList.remove('has-img');
      if (avatarEl) avatarEl.removeAttribute('src');
    }
  } catch {
    block.classList.add('hidden');
  }
}

function openHamburger() {
  const o = document.getElementById('hamburgerOverlay');
  const b = document.getElementById('hamburgerBtn');
  updateHamburgerUser();
  if (o) { o.classList.add('open'); o.setAttribute('aria-hidden', 'false'); }
  if (b) { b.setAttribute('aria-expanded', 'true'); }
  document.body.style.overflow = 'hidden';
}

function closeHamburger() {
  const o = document.getElementById('hamburgerOverlay');
  const b = document.getElementById('hamburgerBtn');
  if (o) { o.classList.remove('open'); o.setAttribute('aria-hidden', 'true'); }
  if (b) { b.setAttribute('aria-expanded', 'false'); }
  document.body.style.overflow = '';
}

document.getElementById('btnAddCredits')?.addEventListener('click', () => { openPlansModal(); });
document.getElementById('hamburgerBtn')?.addEventListener('click', () => {
  const o = document.getElementById('hamburgerOverlay');
  if (o?.classList.contains('open')) closeHamburger();
  else openHamburger();
});

document.getElementById('hamburgerOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'hamburgerOverlay') closeHamburger();
});

document.querySelectorAll('.hamburger-close').forEach(a => {
  a.addEventListener('click', () => { closeHamburger(); });
});

document.getElementById('hamburgerPlans')?.addEventListener('click', () => {
  closeHamburger();
  openPlansModal();
});

function logout() {
  localStorage.removeItem(AUTH_STORAGE);
  updateHamburgerUser();
}

document.getElementById('hamburgerLogout')?.addEventListener('click', () => {
  logout();
  closeHamburger();
});

// Plans modal: tabs e fechar
document.querySelectorAll('.plans-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const t = tab.dataset.tab;
    document.querySelectorAll('.plans-tab').forEach(x => x.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('plansAvulsos')?.classList.toggle('hidden', t !== 'avulsos');
    document.getElementById('plansMensais')?.classList.toggle('hidden', t !== 'mensais');
  });
});

document.getElementById('plansModalClose')?.addEventListener('click', closePlansModal);
document.querySelector('.plans-modal-backdrop')?.addEventListener('click', closePlansModal);

// Init créditos
updateCreditsDisplay();

// Vídeos Social & UGC Ads — loop e mudo ao rolar (igual à landing)
const samplesObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const card = entry.target;
    const video = card.querySelector('video');
    if (!video || !video.src) return;
    if (entry.isIntersecting) {
      video.muted = true;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.sample-video-slot').forEach(card => {
  samplesObserver.observe(card);
});

// Aplica modo (campos, botões, como fazer)
function applyMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mode-btn[data-mode="' + currentMode + '"]').forEach(b => b && b.classList.add('active'));
  document.getElementById('videoFields').classList.toggle('hidden', currentMode !== 'video');
  document.getElementById('imageFields').classList.toggle('hidden', currentMode !== 'image');
  document.getElementById('motionFields').classList.toggle('hidden', currentMode !== 'motion');
  const configWrap = document.getElementById('configAdvancedWrap');
  if (configWrap) configWrap.classList.toggle('hidden', currentMode === 'motion');
  const promptBlock = document.getElementById('createPromptBlock');
  if (promptBlock) promptBlock.classList.toggle('hidden', currentMode === 'motion');
  const promptSuggestionsVideo = document.getElementById('promptSuggestionsVideo');
  const promptSuggestionsImage = document.getElementById('promptSuggestionsImage');
  const promptInputWrap = document.getElementById('promptInputWrap');
  if (promptSuggestionsVideo) {
    if (currentMode === 'video') promptSuggestionsVideo.classList.remove('hidden');
    else promptSuggestionsVideo.classList.add('hidden');
  }
  if (promptSuggestionsImage) {
    if (currentMode === 'image') promptSuggestionsImage.classList.remove('hidden');
    else promptSuggestionsImage.classList.add('hidden');
  }
  if (promptInputWrap) {
    if (currentMode === 'motion') promptInputWrap.classList.add('hidden');
    else promptInputWrap.classList.remove('hidden');
  }
  document.querySelectorAll('#comoFazerVideo, #comoFazerMotion').forEach(h => {
    h.classList.add('hidden');
    h.open = false;
  });
  const howtoId = { video: 'comoFazerVideo', motion: 'comoFazerMotion' }[currentMode];
  const howto = document.getElementById(howtoId);
  if (howto) { howto.classList.remove('hidden'); howto.open = true; }
  if (currentMode === 'motion') setTimeout(updateMotionReadyState, 0);
  document.getElementById('mode').value = currentMode;
  const labels = { video: 'Gerar vídeo', image: 'Gerar imagem', motion: 'Imitar movimento' };
  const btnText = document.getElementById('btnGenerateText');
  if (btnText) btnText.textContent = labels[currentMode] || 'Gerar';
  const btnCredits = document.getElementById('btnCredits');
  if (btnCredits) btnCredits.textContent = '✨';
  document.getElementById('prompt').required = currentMode !== 'motion';
}

// Mode switcher — links navegam; só botões (root index) precisam de handler
document.querySelectorAll('.mode-btn').forEach(btn => {
  if (btn.tagName === 'BUTTON') {
    btn.addEventListener('click', () => applyMode(btn.dataset.mode));
  }
});

// Load API key from config or localStorage
function getApiKey() {
  if (window.VARVOS_CONFIG?.apiKey) return window.VARVOS_CONFIG.apiKey;
  return localStorage.getItem(STORAGE_KEY);
}


// History — Supabase quando logado, localStorage como fallback
let historyCache = [];

function getHistory() {
  return historyCache;
}

function saveHistory(items) {
  historyCache = items.slice(0, 50);
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {}
}

async function loadHistoryFromSupabase() {
  const userId = getCurrentUserId();
  const sb = window.varvosSupabase;
  if (!userId || !sb) return;
  try {
    const { data } = await sb.from('user_creations').select('task_id, prompt, mode, files, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    if (data && data.length) {
      historyCache = data.map(row => ({
        id: row.task_id + '-' + (row.created_at ? new Date(row.created_at).getTime() : Date.now()),
        task_id: row.task_id,
        created_time: row.created_at,
        prompt: row.prompt || '',
        mode: row.mode || 'video',
        files: row.files || []
      }));
      renderHistory();
    }
  } catch (e) { console.warn('loadHistoryFromSupabase:', e); }
}

async function loadHistory() {
  const userId = getCurrentUserId();
  const sb = window.varvosSupabase;
  if (userId && sb) {
    await loadHistoryFromSupabase();
    return;
  }
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    historyCache = raw ? JSON.parse(raw) : [];
  } catch { historyCache = []; }
  renderHistory();
}

async function addToHistorySupabase(entry) {
  const userId = getCurrentUserId();
  const sb = window.varvosSupabase;
  if (!userId || !sb) return;
  try {
    await sb.from('user_creations').insert({
      user_id: userId,
      task_id: entry.task_id,
      prompt: entry.prompt || '',
      mode: entry.mode || 'video',
      files: entry.files || []
    });
  } catch (e) { console.warn('addToHistorySupabase:', e); }
}

async function addToHistory(data, prompt) {
  if (data.status !== 'finished' || !data.files?.length) return;
  const entry = {
    id: data.task_id + '-' + Date.now(),
    task_id: data.task_id,
    created_time: data.created_time || new Date().toISOString(),
    prompt: prompt || '',
    mode: data.files[0].file_type === 'video' ? 'video' : 'image',
    files: data.files
  };
  historyCache.unshift(entry);
  saveHistory(historyCache);
  await addToHistorySupabase(entry);
  renderHistory();
}

function renderHistory() {
  const items = getHistory();
  historyList.classList.toggle('hidden', !items.length);
  historyEmpty.classList.toggle('hidden', !!items.length);
  btnClearHistory.classList.toggle('hidden', !items.length);
  document.querySelector('.history-download-hint')?.classList.toggle('hidden', !items.length);

  if (!items.length) return;

  historyList.innerHTML = items.map(item => {
    const mainFile = item.files[0];
    const thumb = mainFile.file_type === 'image'
      ? `<img src="${mainFile.file_url}" alt="">`
      : `<video src="${mainFile.file_url}" muted preload="metadata"></video>`;
    const promptShort = (item.prompt || 'Sem prompt').slice(0, 50) + (item.prompt?.length > 50 ? '…' : '');
    const date = item.created_time ? new Date(item.created_time).toLocaleDateString('pt-BR') : '';
    const downloads = item.files.map((f, i) =>
      `<a href="${f.file_url}" download="varvos-${item.task_id}-${i + 1}.${f.file_type === 'video' ? 'mp4' : 'png'}">Baixar${item.files.length > 1 ? ' ' + (i + 1) : ''}</a>`
    ).join('');
    return `
      <div class="creation-item">
        <div class="creation-thumb">${thumb}</div>
        <div class="creation-info">
          <div class="prompt">${escapeHtml(promptShort)}</div>
          <div class="meta">${item.mode === 'video' ? '🎬 Vídeo' : '🖼️ Imagem'}${date ? ' · ' + date : ''}</div>
        </div>
        <div class="creation-actions">${downloads}</div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function clearHistory() {
  if (!confirm('Limpar todo o histórico?')) return;
  historyCache = [];
  saveHistory([]);
  const userId = getCurrentUserId();
  const sb = window.varvosSupabase;
  if (userId && sb) {
    try {
      await sb.from('user_creations').delete().eq('user_id', userId);
    } catch (e) { console.warn('clearHistory Supabase:', e); }
  }
  renderHistory();
}

// File upload - Vidgo Base64 API
async function uploadFileToVidgo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result;
      const apiKey = getApiKey();
      if (!apiKey) {
        reject(new Error('API Key necessária para upload'));
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/common/upload/base64`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({ base64_data: base64Data })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || `Erro ${res.status}`);
        const url = data?.data?.file_url || data?.data?.download_url;
        if (url) resolve(url);
        else reject(new Error('URL não retornada'));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

function setupFileUpload(config) {
  const { inputId, areaId, previewId, imgId, removeId, setUrl, maxMb = 10, onReady } = config;
  const input = document.getElementById(inputId);
  const area = document.getElementById(areaId);
  const preview = document.getElementById(previewId);
  const previewImg = document.getElementById(imgId);
  const removeBtn = document.getElementById(removeId);

  if (!input || !area) return;

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) {
      alert(`Arquivo muito grande. Máximo ${maxMb}MB.`);
      return;
    }
    area.classList.add('hidden');
    preview.classList.remove('hidden');
    previewImg.src = URL.createObjectURL(file);
    try {
      const url = await uploadFileToVidgo(file);
      setUrl(url);
      onReady?.();
    } catch (err) {
      alert('Erro no upload: ' + err.message);
      reset();
    }
  };

  const reset = () => {
    setUrl('');
    preview.classList.add('hidden');
    area.classList.remove('hidden');
    if (previewImg.src) URL.revokeObjectURL(previewImg.src);
    onReady?.();
  };

  area.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => handleFile(e.target.files[0]));
  removeBtn?.addEventListener('click', reset);

  // Drag & drop
  area.addEventListener('dragover', (e) => { e.preventDefault(); area.closest('.file-upload').classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.closest('.file-upload').classList.remove('dragover'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.closest('.file-upload').classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
  });
}

// Initialize file uploads
setupFileUpload({ inputId: 'imageRefFile', areaId: 'imageRefArea', previewId: 'imageRefPreview', imgId: 'imageRefPreviewImg', removeId: 'imageRefRemove', setUrl: (v) => refImageUrl = v });
setupFileUpload({ inputId: 'imgRefFile', areaId: 'imgRefArea', previewId: 'imgRefPreview', imgId: 'imgRefPreviewImg', removeId: 'imgRefRemove', setUrl: (v) => imgRefUrl = v });
function updateMotionReadyState() {
  const el = document.getElementById('motionReadyState');
  if (!el) return;
  const ok = !!(motionCharImageUrl && motionRefVideoUrl);
  el.textContent = ok ? '✓ Imagem e vídeo enviados à Vidgo — prontos para gerar' : '';
  el.className = 'motion-ready-state' + (ok ? ' ready' : '');
}
setupFileUpload({ inputId: 'motionCharImageFile', areaId: 'motionCharImageArea', previewId: 'motionCharImagePreview', imgId: 'motionCharImagePreviewImg', removeId: 'motionCharImageRemove', setUrl: (v) => motionCharImageUrl = v, onReady: updateMotionReadyState });

function setupVideoUpload(config) {
  const { inputId, areaId, previewId, videoId, removeId, setUrl, maxMb = 50, onReady } = config;
  const input = document.getElementById(inputId);
  const area = document.getElementById(areaId);
  const preview = document.getElementById(previewId);
  const previewVideo = document.getElementById(videoId);
  const removeBtn = document.getElementById(removeId);

  if (!input || !area) return;

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) {
      alert(`Vídeo muito grande. Máximo ${maxMb}MB.`);
      return;
    }
    area.classList.add('hidden');
    preview.classList.remove('hidden');
    previewVideo.src = URL.createObjectURL(file);
    try {
      const url = await uploadFileToVidgo(file);
      setUrl(url);
      onReady?.();
    } catch (err) {
      alert('Erro no upload: ' + err.message);
      reset();
    }
  };

  const reset = () => {
    setUrl('');
    preview.classList.add('hidden');
    area.classList.remove('hidden');
    previewVideo.src = '';
    onReady?.();
  };

  area.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => handleFile(e.target.files[0]));
  removeBtn?.addEventListener('click', reset);

  area.addEventListener('dragover', (e) => { e.preventDefault(); area.closest('.file-upload').classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.closest('.file-upload').classList.remove('dragover'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.closest('.file-upload').classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
  });
}

setupVideoUpload({ inputId: 'motionRefVideoFile', areaId: 'motionRefVideoArea', previewId: 'motionRefVideoPreview', videoId: 'motionRefVideoPreviewVid', removeId: 'motionRefVideoRemove', setUrl: (v) => motionRefVideoUrl = v, maxMb: 50, onReady: updateMotionReadyState });

// Build request body from form
function buildRequestBody() {
  if (currentMode === 'motion') {
    const orientation = document.getElementById('motionOrientation').value;
    const mode = document.getElementById('motionResolution').value;
    const input = {
      image_urls: [motionCharImageUrl],
      video_urls: [motionRefVideoUrl],
      character_orientation: orientation,
      mode
    };
    const prompt = document.getElementById('prompt').value.trim();
    if (prompt) input.prompt = prompt;
    return { model: 'kling-2.6-motion-control', input };
  }
  if (currentMode === 'video') {
    const prompt = document.getElementById('prompt').value.trim();
    const duration = parseInt(document.getElementById('duration').value, 10);
    const aspectRatio = document.getElementById('aspectRatio').value;
    const style = document.getElementById('style').value;

    const input = { prompt, duration, aspect_ratio: aspectRatio };
    if (refImageUrl) input.image_urls = [refImageUrl];
    if (style) input.style = style;

    return { model: selectedModel, input };
  } else {
    const prompt = document.getElementById('prompt').value.trim();
    const aspectRatio = document.getElementById('imgSize').value;
    const mode = document.getElementById('imgMode')?.value || 'normal';
    const input = { prompt, aspect_ratio: aspectRatio, mode };
    if (imgRefUrl) input.image_urls = [imgRefUrl];
    return { model: 'grok-imagine', input };
  }
}

async function submitTask(body) {
  const apiKey = getApiKey();
  if (!apiKey) {
    alert('Configure sua chave API em config.js para começar.');
    return null;
  }

  const res = await fetch(`${API_BASE}/api/generate/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(`Erro ${res.status}`);
  }

  if (!res.ok) {
    const msg = (data?.error?.message || data?.detail || `Erro ${res.status}`).toString();
    const err = new Error(msg);
    err.isCredits = /credit|insufficient|saldo|quota|balance|crédito/i.test(msg);
    throw err;
  }

  return data?.data?.task_id || null;
}

async function getTaskStatus(taskId) {
  const apiKey = getApiKey();
  const res = await fetch(`${API_BASE}/api/generate/status/${taskId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Erro ${res.status}`);
  return data?.data;
}

const STATUS_PT = { not_started: 'Na fila', running: 'Gerando', finished: 'Pronto', failed: 'Falhou' };

function startLoadingForCard(cardRefs) {
  if (cardRefs?.loadingPlaceholder) cardRefs.loadingPlaceholder.classList.remove('hidden');
}

function stopLoadingForCard(cardRefs) {
  if (cardRefs?.loadingPlaceholder) cardRefs.loadingPlaceholder.classList.add('hidden');
}

function openCreditsModal() {
  activeTasks.forEach(m => stopLoadingForCard(m.cardRefs));
  if (outputResultsList) outputResultsList.classList.add('hidden');
  if (outputPlaceholder) outputPlaceholder.classList.remove('hidden');
  if (creditsModal) {
    creditsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closeCreditsModal() {
  if (creditsModal) {
    creditsModal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function isCreditsError(msg) {
  return msg && /credit|insufficient|saldo|quota|balance|crédito/i.test(msg.toString());
}

function updateOutputUI(data, cardRefs, startTime) {
  if (!cardRefs) return;
  const { taskStatusEl, taskProgressEl, progressFill, loadingPlaceholder, videoPlayer, imageGallery, statusMessage, downloadWarning, downloadBtn } = cardRefs;
  const status = data.status || '';
  if (taskStatusEl) {
    taskStatusEl.textContent = STATUS_PT[status] || status;
    taskStatusEl.className = 'status-badge ' + status;
  }
  const apiProgress = data.progress || 0;
  if (taskProgressEl) taskProgressEl.textContent = apiProgress + '%';
  if (progressFill) progressFill.style.width = apiProgress + '%';

  if (data.status === 'finished' && data.files?.length) {
    activeTasks.delete(data.task_id);
    stopLoadingForCard(cardRefs);
    if (videoPlayer) {
      videoPlayer.src = '';
      videoPlayer.style.display = 'none';
    }
    if (imageGallery) {
      imageGallery.classList.add('hidden');
      imageGallery.innerHTML = '';
    }

    const videoFile = data.files.find(f => f.file_type === 'video');
    const imageFiles = data.files.filter(f => f.file_type === 'image');

    if (videoFile) {
      if (videoPlayer) {
        videoPlayer.src = videoFile.file_url;
        videoPlayer.style.display = 'block';
      }
      if (downloadBtn) {
        downloadBtn.href = videoFile.file_url;
        downloadBtn.download = `varvos-video-${data.task_id}.mp4`;
        downloadBtn.classList.remove('hidden');
      }
      if (downloadWarning) downloadWarning.classList.remove('hidden');
      const elapsed = startTime ? Date.now() - startTime : EXPECTED_DURATION_MS;
      if (statusMessage) statusMessage.textContent = elapsed < EXPECTED_DURATION_MS ? 'Boas notícias! Seu vídeo ficou pronto antes do tempo estimado. Você já pode baixar.' : 'Vídeo pronto!';
    } else if (imageFiles?.length) {
      if (imageGallery) {
        imageGallery.classList.remove('hidden');
        imageFiles.forEach((file, i) => {
          const item = document.createElement('div');
          item.className = 'gallery-item';
          item.innerHTML = `<img src="${file.file_url}" alt="Imagem ${i + 1}"><a href="${file.file_url}" download="varvos-image-${data.task_id}-${i + 1}.png">Baixar</a>`;
          imageGallery.appendChild(item);
        });
      }
      if (imageFiles.length === 1 && downloadBtn) {
        downloadBtn.href = imageFiles[0].file_url;
        downloadBtn.download = `varvos-image-${data.task_id}.png`;
        downloadBtn.classList.remove('hidden');
      }
      if (downloadWarning) downloadWarning.classList.remove('hidden');
      if (statusMessage) statusMessage.textContent = imageFiles.length === 1 ? 'Imagem pronta!' : `${imageFiles.length} imagens prontas!`;
    }
    if (statusMessage) statusMessage.className = 'status-message success';
  } else if (data.status === 'failed') {
    activeTasks.delete(data.task_id);
    const errMsg = (data.error_message || '').toString();
    if (isCreditsError(errMsg)) {
      openCreditsModal();
      return;
    }
    stopLoadingForCard(cardRefs);
    if (statusMessage) {
      statusMessage.textContent = 'Há muitos vídeos na fila, por isso está ocorrendo este erro. Tente novamente em alguns minutos.';
      statusMessage.className = 'status-message error';
    }
  } else {
    if (downloadWarning) downloadWarning.classList.add('hidden');
    if (statusMessage) statusMessage.textContent = '';
  }
}

const pollTimeouts = new Map();

function getCurrentUserId() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    return (user && user.id) ? String(user.id) : null;
  } catch { return null; }
}

async function saveActiveTask(taskId, startTime) {
  const payload = {
    taskId,
    startTime: startTime || Date.now(),
    mode: currentMode
  };
  try {
    const stored = sessionStorage.getItem(ACTIVE_TASK_STORAGE);
    let tasks = [];
    if (stored) {
      const d = JSON.parse(stored);
      tasks = Array.isArray(d.tasks) ? d.tasks : (d.taskId ? [{ taskId: d.taskId, startTime: d.startTime || Date.now(), mode: d.mode || 'video' }] : []);
    }
    const idx = tasks.findIndex(t => t.taskId === taskId);
    if (idx >= 0) tasks[idx] = payload;
    else {
      tasks.push(payload);
      if (tasks.length > 2) tasks.shift();
    }
    sessionStorage.setItem(ACTIVE_TASK_STORAGE, JSON.stringify({ tasks }));
  } catch (e) {}
  const userId = getCurrentUserId();
  const sb = window.varvosSupabase;
  if (userId && sb) {
    try {
      await sb.from('user_active_tasks').upsert({
        user_id: userId,
        task_id: taskId,
        mode: currentMode,
        started_at: new Date(payload.startTime).toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    } catch (e) { console.warn('saveActiveTask Supabase:', e); }
  }
}

async function clearActiveTask(onlyIfTaskId = null) {
  try {
    if (onlyIfTaskId) {
      const stored = sessionStorage.getItem(ACTIVE_TASK_STORAGE);
      if (stored) {
        const d = JSON.parse(stored);
        const tasks = Array.isArray(d.tasks) ? d.tasks : (d.taskId ? [d] : []);
        const filtered = tasks.filter(t => t.taskId !== onlyIfTaskId);
        if (filtered.length === 0) sessionStorage.removeItem(ACTIVE_TASK_STORAGE);
        else sessionStorage.setItem(ACTIVE_TASK_STORAGE, JSON.stringify({ tasks: filtered }));
      }
    } else {
      sessionStorage.removeItem(ACTIVE_TASK_STORAGE);
    }
  } catch (e) {}
  const userId = getCurrentUserId();
  const sb = window.varvosSupabase;
  if (userId && sb) {
    try {
      let q = sb.from('user_active_tasks').delete().eq('user_id', userId);
      if (onlyIfTaskId) q = q.eq('task_id', onlyIfTaskId);
      await q;
    } catch (e) { console.warn('clearActiveTask Supabase:', e); }
  }
}

async function getStoredActiveTasks() {
  const userId = getCurrentUserId();
  const sb = window.varvosSupabase;
  if (userId && sb) {
    try {
      const { data } = await sb.from('user_active_tasks').select('task_id, started_at, mode').eq('user_id', userId).maybeSingle();
      if (data) {
        const startTime = data.started_at ? new Date(data.started_at).getTime() : Date.now();
        return [{ taskId: data.task_id, startTime, mode: data.mode || 'video' }];
      }
    } catch (e) { console.warn('getStoredActiveTasks Supabase:', e); }
  }
  try {
    const stored = sessionStorage.getItem(ACTIVE_TASK_STORAGE);
    if (stored) {
      const d = JSON.parse(stored);
      const tasks = Array.isArray(d.tasks) ? d.tasks : (d.taskId ? [{ taskId: d.taskId, startTime: d.startTime || Date.now(), mode: d.mode || 'video' }] : []);
      return tasks.slice(0, 2);
    }
  } catch (e) {}
  return [];
}

async function pollUntilComplete(taskId, cardRefs, startTime) {
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const data = await getTaskStatus(taskId);
        updateOutputUI(data, cardRefs, startTime);

        if (data.status === 'finished') {
          if (currentTaskId === taskId) currentTaskId = null;
          await clearActiveTask(taskId);
          if (btnVerify) btnVerify.classList.add('hidden');
          resolve(data);
          return;
        }
        if (data.status === 'failed') {
          if (currentTaskId === taskId) currentTaskId = null;
          await clearActiveTask(taskId);
          if (btnVerify) btnVerify.classList.add('hidden');
          const errMsg = data.error_message || 'Geração falhou';
          const err = new Error(errMsg);
          err.isCredits = isCreditsError(errMsg);
          reject(err);
          return;
        }

        const tid = setTimeout(check, POLL_INTERVAL);
        pollTimeouts.set(taskId, tid);
      } catch (err) {
        if (currentTaskId === taskId) currentTaskId = null;
        clearActiveTask(taskId).catch(() => {});
        if (btnVerify) btnVerify.classList.add('hidden');
        reject(err);
      }
    };
    check();
  });
}

function getAvailableCardIndex() {
  const card0 = outputResultsList?.querySelector('.output-result-card[data-card="0"]');
  const card1 = outputResultsList?.querySelector('.output-result-card[data-card="1"]');
  const inUse0 = Array.from(activeTasks.values()).some(m => m.cardRefs?.card === card0);
  const inUse1 = Array.from(activeTasks.values()).some(m => m.cardRefs?.card === card1);
  if (!inUse0) return 0;
  if (!inUse1) return 1;
  return 0;
}

async function generateMedia(body) {
  btnGenerate.disabled = true;
  const startTime = Date.now();
  const cardIndex = getAvailableCardIndex();
  const cardRefs = getCardByIndex(cardIndex);

  if (!cardRefs) {
    btnGenerate.disabled = false;
    return;
  }

  const card = cardRefs.card;
  if (card.classList.contains('hidden')) card.classList.remove('hidden');

  if (cardRefs.videoPlayer) {
    cardRefs.videoPlayer.src = '';
    cardRefs.videoPlayer.style.display = 'none';
  }
  if (cardRefs.imageGallery) {
    cardRefs.imageGallery.classList.add('hidden');
    cardRefs.imageGallery.innerHTML = '';
  }
  if (cardRefs.downloadBtn) cardRefs.downloadBtn.classList.add('hidden');
  if (cardRefs.downloadWarning) cardRefs.downloadWarning.classList.add('hidden');

  let taskId = null;
  try {
    taskId = await submitTask(body);
    if (!taskId) throw new Error('Nenhum task_id retornado');

    outputPlaceholder.classList.add('hidden');
    outputResultsList.classList.remove('hidden');

    if (cardRefs.taskStatusEl) cardRefs.taskStatusEl.textContent = 'Enviando...';
    if (cardRefs.taskStatusEl) cardRefs.taskStatusEl.className = 'status-badge';
    if (cardRefs.taskProgressEl) cardRefs.taskProgressEl.textContent = '0%';
    if (cardRefs.progressFill) cardRefs.progressFill.style.width = '0%';
    if (cardRefs.statusMessage) cardRefs.statusMessage.textContent = '';

    activeTasks.set(taskId, { cardRefs, startTime });
    startLoadingForCard(cardRefs);
    document.getElementById('currentResultSection')?.scrollIntoView({ behavior: 'smooth', block: 'end' });

    currentTaskId = taskId;
    saveActiveTask(taskId, startTime);
    updateOutputUI({ status: 'not_started', progress: 0 }, cardRefs, startTime);

    btnGenerate.disabled = false;

    const result = await pollUntilComplete(taskId, cardRefs, startTime);
    const tid = pollTimeouts.get(taskId);
    if (tid) { clearTimeout(tid); pollTimeouts.delete(taskId); }
    if (result?.status === 'finished' && result?.files?.length) {
      addToHistory(result, lastPrompt);
    }
  } catch (err) {
    if (taskId) activeTasks.delete(taskId);
    stopLoadingForCard(cardRefs);
    if (err.isCredits) {
      openCreditsModal();
    } else if (cardRefs.statusMessage) {
      cardRefs.statusMessage.textContent = 'Há muitos vídeos na fila, por isso está ocorrendo este erro. Tente novamente em alguns minutos.';
      cardRefs.statusMessage.className = 'status-message error';
    }
    const tid = pollTimeouts.get(taskId);
    if (tid) { clearTimeout(tid); pollTimeouts.delete(taskId); }
    btnGenerate.disabled = false;
  }
}

generateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (currentMode === 'motion') {
    if (!motionCharImageUrl || !motionRefVideoUrl) {
      alert('Selecione a imagem do personagem e o vídeo de referência.');
      return;
    }
    lastPrompt = document.getElementById('prompt').value.trim() || 'Motion transfer';
  } else {
    const prompt = document.getElementById('prompt').value.trim();
    if (!prompt) {
      alert('Preencha o prompt.');
      return;
    }
    lastPrompt = prompt;
  }
  const body = buildRequestBody();
  await generateMedia(body);
});

// JSON tab submit
btnClearHistory?.addEventListener('click', clearHistory);

// Carousel Inspire-se (como na landing)
const samplesCarousel = document.getElementById('samplesCarousel');
const samplesPrev = document.getElementById('samplesPrev');
const samplesNext = document.getElementById('samplesNext');
if (samplesPrev && samplesCarousel) {
  samplesPrev.addEventListener('click', () => samplesCarousel.scrollBy({ left: -216, behavior: 'smooth' }));
}
if (samplesNext && samplesCarousel) {
  samplesNext.addEventListener('click', () => samplesCarousel.scrollBy({ left: 216, behavior: 'smooth' }));
}

// Load history on init (Supabase se logado, senão localStorage)
loadHistory();

// Detectar modo por path (/video, /imagem, /imitar-movimento) ou ?mode=
const pathname = (window.location.pathname || '').toLowerCase();
const urlParams = new URLSearchParams(window.location.search);
let initMode = null;
if (pathname.includes('imagem')) initMode = 'image';
else if (pathname.includes('imitar-movimento')) initMode = 'motion';
else if (pathname.includes('video')) initMode = 'video';
else if (urlParams.get('mode') === 'motion') initMode = 'motion';
else if (urlParams.get('mode') === 'image') initMode = 'image';
else if (urlParams.get('mode') === 'video') initMode = 'video';
if (!initMode) initMode = 'video';
applyMode(initMode);

// Preencher vídeo de referência vindo da biblioteca (?refVideo=url)
const refVideoParam = urlParams.get('refVideo');
if (refVideoParam && pathname.includes('imitar-movimento')) {
  try {
    const url = decodeURIComponent(refVideoParam);
    if (url) setMotionRefVideoFromUrl(url);
  } catch (_) {}
}

// Restaurar tarefas em andamento após recarregar (Supabase se logado, senão sessionStorage)
async function restoreActiveTask() {
  if (!outputPlaceholder || !outputResultsList) return;
  const tasks = await getStoredActiveTasks();
  if (tasks.length === 0) return;

  outputPlaceholder.classList.add('hidden');
  outputResultsList.classList.remove('hidden');

  const restoreOne = (data, cardIndex) => {
    const cardRefs = getCardByIndex(cardIndex);
    if (!cardRefs || !data?.taskId) return;

    const startTime = data.startTime || Date.now();
    // Não altera o modo da página — mantém o que o usuário escolheu (vídeo ou imitar movimento)

    if (cardRefs.videoPlayer) {
      cardRefs.videoPlayer.src = '';
      cardRefs.videoPlayer.style.display = 'none';
    }
    if (cardRefs.imageGallery) {
      cardRefs.imageGallery.classList.add('hidden');
      cardRefs.imageGallery.innerHTML = '';
    }

    cardRefs.card.classList.remove('hidden');
    activeTasks.set(data.taskId, { cardRefs, startTime });
    startLoadingForCard(cardRefs);

    if (cardRefs.taskStatusEl) cardRefs.taskStatusEl.textContent = 'Enviando...';
    if (cardRefs.taskProgressEl) cardRefs.taskProgressEl.textContent = '0%';
    if (cardRefs.progressFill) cardRefs.progressFill.style.width = '0%';

    pollUntilComplete(data.taskId, cardRefs, startTime)
      .then((result) => {
        const tid = pollTimeouts.get(data.taskId);
        if (tid) { clearTimeout(tid); pollTimeouts.delete(data.taskId); }
        if (result?.status === 'finished' && result?.files?.length) {
          addToHistory(result, lastPrompt || '');
        }
      })
      .catch((err) => {
        const tid = pollTimeouts.get(data.taskId);
        if (tid) { clearTimeout(tid); pollTimeouts.delete(data.taskId); }
        activeTasks.delete(data.taskId);
        stopLoadingForCard(cardRefs);
        if (err.isCredits) {
          openCreditsModal();
        } else if (cardRefs.statusMessage) {
          cardRefs.statusMessage.textContent = 'Há muitos vídeos na fila, por isso está ocorrendo este erro. Tente novamente em alguns minutos.';
          cardRefs.statusMessage.className = 'status-message error';
        }
      })
      .finally(() => {
        btnGenerate.disabled = false;
      });
  };

  tasks.forEach((data, i) => restoreOne(data, i));
  if (tasks.length > 0) {
    currentTaskId = tasks[0].taskId;
    document.getElementById('currentResultSection')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
}

restoreActiveTask();

