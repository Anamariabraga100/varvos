const API_BASE = 'https://api.vidgo.ai';
const KIE_API_BASE = 'https://api.kie.ai';
const POLL_INTERVAL = 3000;
const CREDITS_COST_VIDEO = 50;
const CREDITS_PER_SECOND_MOTION = 8;   // Imitar movimento 720p: 8 créditos/seg
const CREDITS_PER_SECOND_MOTION_1080P = 11;  // Imitar movimento 1080p: 11 créditos/seg
const STORAGE_KEY = 'varvos_api_key';
const HISTORY_STORAGE_KEY = 'varvos_history';
const CREDITS_STORAGE_KEY = 'varvos_credits';
const AUTH_STORAGE = 'varvos_user';
const ACTIVE_TASK_STORAGE = 'varvos_active_task';

let selectedModel = 'veo3.1-fast';
let hideModelSelection = false;
let currentMode = 'video';
let currentTaskId = null;
let lastPrompt = '';
let refImageUrl = '';  // Video reference (uploaded)
let refImageUploading = false;  // Upload em andamento
let imgRefUrl = '';   // Image reference (uploaded)
let motionCharImageUrl = '';  // Kling: character image
let motionRefVideoUrl = '';   // Kling: reference video

// Elements
const generateForm = document.getElementById('generateForm');
const btnGenerate = document.getElementById('btnGenerate');
const outputPlaceholder = document.getElementById('outputPlaceholder');
const outputResultsList = document.getElementById('outputResultsList');

const LOADING_PHRASES = {
  video: [
    'Preparando sua criação…',
    'A IA está analisando sua criação…',
    'Gerando frames e movimentos…',
    'Compondo cenas e iluminação…',
    'Renderizando o vídeo em alta qualidade…',
    'Ajustando detalhes finais…',
    'Quase pronto! Finalizando…'
  ],
  motion: [
    'Analisando o movimento de referência…',
    'A IA está mapeando os gestos…',
    'Transferindo o movimento para seu personagem…',
    'Aplicando expressões e timing…',
    'Renderizando a imitação…',
    'Quase pronto!'
  ]
};

const loadingIntervals = new WeakMap();

/** Captura o primeiro frame de um vídeo e define como poster. Funciona com cross-origin se o servidor enviar CORS. */
function captureVideoThumbnail(videoEl, onDone) {
  if (!videoEl || !videoEl.src) return;
  const draw = () => {
    try {
      if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return;
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0);
      videoEl.poster = canvas.toDataURL('image/jpeg', 0.7);
    } catch (_) {}
    cleanup();
    if (typeof onDone === 'function') onDone();
  };
  const cleanup = () => {
    videoEl.removeEventListener('loadeddata', onLoaded);
    videoEl.removeEventListener('seeked', draw);
    videoEl.removeEventListener('error', cleanup);
    if (typeof onDone === 'function') onDone();
  };
  const onLoaded = () => {
    videoEl.currentTime = 0.1;
    videoEl.addEventListener('seeked', draw, { once: true });
  };
  videoEl.crossOrigin = 'anonymous';
  videoEl.preload = 'auto';
  videoEl.addEventListener('error', cleanup);
  if (videoEl.readyState >= 2) {
    onLoaded();
  } else {
    videoEl.addEventListener('loadeddata', onLoaded);
    videoEl.load();
  }
}

function getCardRefs(cardEl) {
  if (!cardEl) return null;
  return {
    card: cardEl,
    taskStatusEl: cardEl.querySelector('.status-badge'),
    taskProgressEl: cardEl.querySelector('.task-progress'),
    progressFill: cardEl.querySelector('.progress-fill'),
    loadingPlaceholder: cardEl.querySelector('.loading-placeholder'),
    loadingTextEl: cardEl.querySelector('.loading-placeholder-text'),
    videoPlayer: cardEl.querySelector('.media-output'),
    imageGallery: cardEl.querySelector('.image-gallery'),
    creationDisclaimer: cardEl.querySelector('.creation-disclaimer'),
    statusMessage: cardEl.querySelector('.status-message'),
    downloadWarning: cardEl.querySelector('.download-warning'),
    downloadBtn: cardEl.querySelector('.btn-download'),
    shareSection: cardEl.querySelector('.share-video-buttons'),
    whatsappBtn: cardEl.querySelector('.btn-share-whatsapp'),
    resultPromptEl: cardEl.querySelector('.result-prompt')
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

function updateVideoModelUI() {
  const modelSelect = document.getElementById('videoModel');
  const durationSelect = document.getElementById('duration');
  const durationFixed = document.getElementById('durationFixed');
  const veoResolutionWrap = document.getElementById('veoResolutionWrap');
  const styleField = document.getElementById('styleField');
  const noticeVeo = document.getElementById('modelNoticeVeo');
  const noticeSora = document.getElementById('modelNoticeSora');
  if (!modelSelect) return;
  selectedModel = modelSelect.value;
  const isVEO = selectedModel === 'veo3.1-fast';
  if (durationSelect) durationSelect.classList.toggle('hidden', isVEO);
  if (durationFixed) durationFixed.classList.toggle('hidden', !isVEO);
  if (veoResolutionWrap) veoResolutionWrap.classList.toggle('hidden', !isVEO);
  if (styleField) styleField.classList.toggle('hidden', isVEO);
  if (noticeVeo) noticeVeo.classList.toggle('hidden', !isVEO);
  if (noticeSora) noticeSora.classList.toggle('hidden', isVEO);
}
document.getElementById('videoModel')?.addEventListener('change', updateVideoModelUI);

async function applyHideModelSetting() {
  const fieldModel = document.querySelector('.field-model');
  if (!fieldModel) return;
  const sb = window.varvosSupabase;
  if (!sb) return;
  try {
    const { data } = await sb.from('app_settings').select('value').eq('key', 'hide_model_selection').maybeSingle();
    hideModelSelection = !!(data?.value === true || data?.value === 'true');
    if (hideModelSelection) {
      fieldModel.classList.add('hidden');
      selectedModel = 'veo3.1-fast';
      updateVideoModelUI();
    }
  } catch (e) {
    console.warn('app_settings:', e);
  }
}

(async function initVideoModelSettings() {
  if (document.getElementById('videoModel')) {
    await applyHideModelSetting();
    if (!hideModelSelection) updateVideoModelUI();
  }
})();

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
  videoModal.dataset.context = 'library';
  const playerWrap = videoModal?.querySelector('.video-modal-player');
  if (playerWrap) playerWrap.style.aspectRatio = '9/16';
  document.getElementById('videoModalPrompt')?.classList.add('hidden');
  const btnImitar = document.getElementById('btnImitarMovimentoModal');
  const btnDownloadWrap = videoModal?.querySelector('.video-modal-download-wrap');
  if (btnImitar) btnImitar.classList.remove('hidden');
  if (btnDownloadWrap) btnDownloadWrap.classList.add('hidden');
  videoModal.classList.remove('hidden');
  videoModalVideo.play().catch(() => {});
}

function openVideoModalForResult(src, downloadBtnOrHref, downloadName, aspectRatio, prompt) {
  if (!videoModal || !videoModalVideo) return;
  videoModalVideo.src = src || '';
  videoModal.dataset.videoSrc = src || '';
  videoModal.dataset.context = 'result';
  const playerWrap = videoModal?.querySelector('.video-modal-player');
  if (playerWrap) {
    const ratio = aspectRatio === '16:9' ? '16/9' : aspectRatio === '1:1' ? '1/1' : '9/16';
    playerWrap.style.aspectRatio = ratio;
  }
  const promptEl = document.getElementById('videoModalPrompt');
  if (promptEl) {
    promptEl.textContent = prompt ? `Prompt: ${prompt}` : '';
    promptEl.classList.toggle('hidden', !prompt);
  }
  const btnImitar = document.getElementById('btnImitarMovimentoModal');
  const btnDownloadWrap = videoModal?.querySelector('.video-modal-download-wrap');
  const modalDownloadBtn = videoModal?.querySelector('.video-modal-download-btn');
  const modalWhatsappBtn = videoModal?.querySelector('.btn-share-whatsapp');
  if (btnImitar) btnImitar.classList.add('hidden');
  if (btnDownloadWrap) btnDownloadWrap.classList.remove('hidden');
  const href = typeof downloadBtnOrHref === 'string' ? downloadBtnOrHref : downloadBtnOrHref?.getAttribute('href');
  const download = downloadName || (downloadBtnOrHref?.getAttribute?.('download'));
  const videoUrl = href || src || '';
  const shareUrl = encodeURIComponent(videoUrl);
  if (modalDownloadBtn) {
    modalDownloadBtn.href = videoUrl;
    modalDownloadBtn.download = download || 'varvos-video.mp4';
    modalDownloadBtn.onclick = (e) => { e.preventDefault(); triggerDownload(videoUrl, download || 'varvos-video.mp4'); closeVideoModal(); };
  }
  if (modalWhatsappBtn) modalWhatsappBtn.href = `https://api.whatsapp.com/send?text=${shareUrl}`;
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
  const loadingOverlay = document.getElementById('motionRefVideoLoading');
  if (!area || !preview || !previewVid) return;
  motionRefVideoUrl = url;
  area.classList.add('hidden');
  preview.classList.remove('hidden');
  if (loadingOverlay) {
    loadingOverlay.classList.remove('hidden');
    loadingOverlay.setAttribute('aria-hidden', 'false');
  }
  previewVid.classList.add('loading');
  previewVid.src = url;
  const hideLoading = () => {
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
      loadingOverlay.setAttribute('aria-hidden', 'true');
    }
    previewVid.classList.remove('loading');
    updateMotionReadyState();
    updateMotionButtonCredits();
  };
  if (previewVid.readyState >= 2) hideLoading();
  else {
    previewVid.addEventListener('loadeddata', hideLoading, { once: true });
    previewVid.addEventListener('canplay', hideLoading, { once: true });
    previewVid.addEventListener('error', hideLoading, { once: true });
  }
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

// Sample video slots — na página Imitar Movimento: define direto como referência; senão: abre modal
document.querySelectorAll('.sample-video-slot').forEach(card => {
  card.addEventListener('click', () => {
    const video = card.querySelector('video');
    const src = video?.src || video?.getAttribute('src') || '';
    if (!src || src === 'undefined') return;
    if (/imitar-movimento/.test(window.location.pathname)) {
      setMotionRefVideoFromUrl(src);
    } else {
      openVideoModal(src, card.dataset.prompt || '');
    }
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
  const loadingPlaceholder = mediaContainer.querySelector('.loading-placeholder');
  if (loadingPlaceholder && !loadingPlaceholder.classList.contains('hidden')) return;
  const video = mediaContainer.querySelector('.media-output');
  const src = video?.src || video?.getAttribute('src');
  if (!src || src === 'about:blank' || src.length < 10) return;
  const card = mediaContainer.closest('.output-result-card');
  const aspectRatio = card?.dataset?.aspectRatio || '9:16';
  const prompt = card?.dataset?.prompt || '';
  openVideoModalForResult(src, mediaContainer.querySelector('.btn-download'), null, aspectRatio, prompt);
});

// Event delegation: histórico — download e clique para abrir vídeo
historyList?.addEventListener('click', (e) => {
  const downloadLink = e.target.closest('.creation-actions a');
  if (downloadLink && !downloadLink.classList.contains('creation-share')) {
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
      const downloadLink = itemEl?.querySelector('.creation-actions a[href]');
      const href = downloadLink?.getAttribute('href');
      const download = downloadLink?.getAttribute('download');
      const aspectRatio = itemEl?.dataset?.aspectRatio || '9:16';
      const prompt = itemEl?.dataset?.prompt || '';
      if (src) openVideoModalForResult(src, href, download, aspectRatio, prompt);
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

async function refreshCreditsFromSupabase() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    if (!user?.id || !window.varvosSupabase) return;
    const { data } = await window.varvosSupabase.from('users').select('credits').eq('id', user.id).single();
    if (data && data.credits != null) {
      user.credits = data.credits;
      localStorage.setItem(AUTH_STORAGE, JSON.stringify(user));
      updateCreditsDisplay();
    }
  } catch (_) {}
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

// Atualiza créditos do Supabase (ex.: após admin editar) — ao carregar e ao focar na janela
refreshCreditsFromSupabase();
window.addEventListener('focus', refreshCreditsFromSupabase);

// Abre modal de planos quando ?planos=1 na URL (ex: vindo de "Planos e preços")
if (new URLSearchParams(location.search).get('planos') === '1' && document.getElementById('plansModal')) {
  setTimeout(openPlansModal, 150);
}

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
  const video = card.querySelector('video');
  const loadingEl = card.querySelector('.sample-thumb-loading');
  if (video && loadingEl) {
    const hideLoading = () => {
      card.classList.add('loaded');
      loadingEl.remove();
    };
    if (video.readyState >= 2) hideLoading();
    else video.addEventListener('loadeddata', hideLoading, { once: true });
    video.addEventListener('canplay', hideLoading, { once: true });
    video.addEventListener('error', hideLoading, { once: true });
  }
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
  if (btnText) {
    let cost = CREDITS_COST_VIDEO;
    let hasValue = true;
    if (currentMode === 'motion') {
      cost = getCreditsCostForBody({ model: 'kling-2.6/motion-control' });
      if (!motionRefVideoUrl) {
        cost = '—';
        hasValue = false;
      }
    } else if (currentMode === 'video' || currentMode === 'image') {
      cost = CREDITS_COST_VIDEO;
    }
    btnText.textContent = hasValue ? `${labels[currentMode] || 'Gerar'} · ${cost} créditos` : labels[currentMode] || 'Gerar';
  }
  const btnCredits = document.querySelector('.btn-credits');
  if (btnCredits) btnCredits.textContent = '✨';
  const motionNote = document.querySelector('.motion-cost-note');
  const motionHasValue = currentMode === 'motion' && motionRefVideoUrl && getCreditsCostForBody({ model: 'kling-2.6/motion-control' }) > 0;
  if (motionNote) motionNote.classList.toggle('hidden', currentMode !== 'motion' || !motionHasValue);
  document.getElementById('prompt').required = currentMode !== 'motion';
  if (currentMode === 'motion') setTimeout(updateMotionReadyState, 0);
  else if (btnGenerate) { if (currentMode === 'video') updateRefImageReadyState(); else btnGenerate.disabled = false; }
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

function getKieApiKey() {
  const cfg = window.VARVOS_CONFIG;
  if (cfg?.kieApiKey) return cfg.kieApiKey;
  if (cfg?.apiKey) return cfg.apiKey;
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
    const { data } = await sb.from('user_creations').select('task_id, prompt, mode, files, created_at, aspect_ratio').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    if (data && data.length) {
      historyCache = data.map(row => ({
        id: row.task_id + '-' + (row.created_at ? new Date(row.created_at).getTime() : Date.now()),
        task_id: row.task_id,
        created_time: row.created_at,
        prompt: row.prompt || '',
        mode: row.mode || 'video',
        files: row.files || [],
        aspect_ratio: row.aspect_ratio || '9:16'
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
    const row = {
      user_id: userId,
      task_id: entry.task_id,
      prompt: entry.prompt || '',
      mode: entry.mode || 'video',
      files: entry.files || []
    };
    if (entry.aspect_ratio) row.aspect_ratio = entry.aspect_ratio;
    await sb.from('user_creations').insert(row);
  } catch (e) { console.warn('addToHistorySupabase:', e); }
}

async function addToHistory(data, prompt, aspectRatio) {
  if (data.status !== 'finished' || !data.files?.length) return;
  const ar = aspectRatio || document.getElementById('aspectRatio')?.value || '9:16';
  const mode = currentMode === 'motion' ? 'motion' : (data.files[0].file_type === 'video' ? 'video' : 'image');
  const entry = {
    id: data.task_id + '-' + Date.now(),
    task_id: data.task_id,
    created_time: data.created_time || new Date().toISOString(),
    prompt: prompt || '',
    mode,
    files: data.files,
    aspect_ratio: ar
  };
  historyCache.unshift(entry);
  saveHistory(historyCache);
  await addToHistorySupabase(entry);
  renderHistory();
}

function renderHistory() {
  const allItems = getHistory();
  const isMotionPage = /imitar-movimento/.test(window.location.pathname || '');
  const items = isMotionPage
    ? allItems.filter(i => i.mode === 'motion')
    : allItems.filter(i => i.mode !== 'motion');
  historyList.classList.toggle('hidden', !items.length);
  historyEmpty.classList.toggle('hidden', !!items.length);
  document.querySelector('.history-download-hint')?.classList.toggle('hidden', !items.length);

  if (!items.length) return;

  historyList.innerHTML = items.map(item => {
    const mainFile = item.files[0];
    const thumb = mainFile.file_type === 'image'
      ? `<img src="${mainFile.file_url}" alt="">`
      : `<video src="${mainFile.file_url}" muted loop playsinline autoplay preload="auto"></video>`;
    const date = item.created_time ? new Date(item.created_time).toLocaleDateString('pt-BR') : '';
    const aspectRatio = item.aspect_ratio || '9:16';
    const downloads = item.files.map((f, i) =>
      `<a href="${f.file_url}" download="varvos-${item.task_id}-${i + 1}.${f.file_type === 'video' ? 'mp4' : 'png'}">Baixar${item.files.length > 1 ? ' ' + (i + 1) : ''}</a>`
    ).join('');
    const firstVideo = item.files.find(f => f.file_type === 'video');
    const shareUrl = firstVideo ? encodeURIComponent(firstVideo.file_url) : '';
    const shareLinks = firstVideo
      ? `<a href="https://api.whatsapp.com/send?text=${shareUrl}" target="_blank" rel="noopener" class="creation-share creation-share-whatsapp" title="Enviar por WhatsApp">WhatsApp</a>`
      : '';
    return `
      <div class="creation-item" data-aspect-ratio="${escapeHtml(aspectRatio)}" data-prompt="${escapeHtml(item.prompt || '')}">
        <div class="creation-thumb">${thumb}</div>
        <div class="creation-info">
          <div class="meta">${item.mode === 'motion' ? '✨ Imitar Movimento' : (item.mode === 'video' ? '🎬 Vídeo' : '🖼️ Imagem')}${date ? ' · ' + date : ''}</div>
        </div>
        <div class="creation-actions">${downloads}${shareLinks}</div>
      </div>
    `;
  }).join('');
  historyList.querySelectorAll('.creation-thumb video').forEach((v) => {
    v.play().catch(() => {});
  });
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

// Formatos aceitos pela KIE para Imitar Movimento (KIE exige JPEG/PNG para imagem, MP4/MOV para vídeo)
const MOTION_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const MOTION_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];

function validateMotionFileType(file, bucket) {
  const type = (file.type || '').toLowerCase();
  const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
  if (bucket === 'images') {
    const ok = MOTION_IMAGE_TYPES.includes(type) || ['jpg', 'jpeg', 'png'].includes(ext);
    if (!ok) throw new Error('Formato não suportado. Use JPEG ou PNG (a KIE não aceita WebP).');
  } else if (bucket === 'videos') {
    const ok = MOTION_VIDEO_TYPES.includes(type) || ['mp4', 'mov', 'm4v'].includes(ext);
    if (!ok) throw new Error('Formato não suportado. Use MP4 ou MOV.');
  }
}

// Extrai bucket e path da URL pública do Supabase Storage
function parseSupabaseStorageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/\/object\/public\/([^/]+)\/(.+)$/);
  return m ? { bucket: m[1], path: m[2] } : null;
}

// Apaga um ou mais arquivos de motion-refs do Storage (libera espaço)
async function deleteMotionRefsFromStorage(urlsToDelete) {
  const urls = urlsToDelete || [motionCharImageUrl, motionRefVideoUrl].filter(Boolean);
  if (urls.length === 0) return;
  const sb = window.varvosSupabase;
  if (!sb) return;
  for (const url of urls) {
    const parsed = parseSupabaseStorageUrl(url);
    if (!parsed || parsed.path.indexOf('motion-refs/') !== 0) continue;
    try {
      await sb.storage.from(parsed.bucket).remove([parsed.path]);
    } catch (_) {}
  }
}

// File upload - Supabase Storage (para Imitar Movimento: suporta imagem e vídeo)
async function uploadToSupabaseStorage(file, bucket) {
  const sb = window.varvosSupabase;
  if (!sb) throw new Error('Supabase não configurado');
  validateMotionFileType(file, bucket);
  const ext = (file.name || '').split('.').pop() || 'bin';
  const path = `motion-refs/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await sb.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw new Error(error.message || 'Falha no upload');
  const { data: urlData } = sb.storage.from(bucket).getPublicUrl(data.path);
  return urlData?.publicUrl || '';
}

// File upload - Vidgo Base64 API (apenas imagens; vídeo não suportado)
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
        if (!res.ok) throw new Error(data?.detail || data?.error?.message || `Erro ${res.status}`);
        const url = data?.data?.file_url || data?.data?.download_url || data?.file_url;
        if (url) resolve(url);
        else reject(new Error('URL não retornada pela API. Resposta: ' + JSON.stringify(data).slice(0, 150)));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

function runSimulatedProgress(progressEl) {
  const fill = progressEl?.querySelector('.upload-progress-fill');
  const pct = progressEl?.querySelector('.upload-progress-pct');
  const media = progressEl?.closest('.motion-preview-wrap')?.querySelector('.motion-preview-media');
  if (!fill || !pct) return () => {};
  media?.classList.add('loading');
  let t = 0;
  const interval = setInterval(() => {
    t += 5 + Math.random() * 8;
    const v = Math.min(Math.floor(t), 95);
    fill.style.width = v + '%';
    pct.textContent = v + '%';
  }, 180);
  return () => {
    clearInterval(interval);
    fill.style.width = '100%';
    pct.textContent = '100%';
    media?.classList.remove('loading');
  };
}

function setupFileUpload(config) {
  const { inputId, areaId, previewId, imgId, removeId, setUrl, maxMb = 10, onReady, uploadFn, onRemove, uploadStatusLabel, setUploadStatus, progressElId, hideProgressUI, onUploadStart, onUploadEnd } = config;
  const input = document.getElementById(inputId);
  const area = document.getElementById(areaId);
  const preview = document.getElementById(previewId);
  const previewImg = document.getElementById(imgId);
  const removeBtn = document.getElementById(removeId);
  const progressEl = progressElId ? document.getElementById(progressElId) : null;

  if (!input || !area) return;

  let cancelProgress = () => {};
  const setProgress = (show) => {
    if (!progressEl) return;
    if (hideProgressUI) {
      progressEl.classList.toggle('uploading', show);
      return;
    }
    const fill = progressEl.querySelector('.upload-progress-fill');
    const pct = progressEl.querySelector('.upload-progress-pct');
    if (show) {
      cancelProgress();
      if (fill) fill.style.width = '0%';
      if (pct) pct.textContent = '0%';
      progressEl.classList.remove('hidden');
      progressEl.setAttribute('aria-hidden', 'false');
    } else {
      cancelProgress();
      progressEl.classList.add('hidden');
      progressEl.setAttribute('aria-hidden', 'true');
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) {
      if (setUploadStatus) setUploadStatus({ error: `Arquivo muito grande. Máximo ${maxMb}MB.` });
      else alert(`Arquivo muito grande. Máximo ${maxMb}MB.`);
      return;
    }
    area.classList.add('hidden');
    preview.classList.remove('hidden');
    previewImg.src = URL.createObjectURL(file);
    setProgress(true);
    if (!hideProgressUI) cancelProgress = runSimulatedProgress(progressEl);
    if (uploadStatusLabel && setUploadStatus) setUploadStatus({ uploading: uploadStatusLabel });
    onUploadStart?.();
    try {
      const url = await (uploadFn || uploadFileToVidgo)(file);
      setUrl(url);
      if (!hideProgressUI) {
        cancelProgress();
        const fill = progressEl?.querySelector('.upload-progress-fill');
        const pct = progressEl?.querySelector('.upload-progress-pct');
        const media = progressEl?.closest('.motion-preview-wrap')?.querySelector('.motion-preview-media');
        if (fill) fill.style.width = '100%';
        if (pct) pct.textContent = '100%';
        media?.classList.remove('loading');
        setTimeout(() => { setProgress(false); setUploadStatus?.(); onReady?.(); onUploadEnd?.(); }, 400);
      } else {
        setProgress(false);
        setUploadStatus?.();
        onReady?.();
        onUploadEnd?.();
      }
    } catch (err) {
      if (!hideProgressUI) {
        cancelProgress();
        const media = progressEl?.closest('.motion-preview-wrap')?.querySelector('.motion-preview-media');
        media?.classList.remove('loading');
      }
      setProgress(false);
      onUploadEnd?.();
      if (setUploadStatus) setUploadStatus({ error: err.message });
      else alert('Erro no upload: ' + err.message);
      reset();
    }
  };

  const reset = () => {
    if (onRemove) onRemove().catch(() => {});
    setUrl('');
    onUploadEnd?.();
    if (!hideProgressUI) {
      cancelProgress();
      const media = progressEl?.closest('.motion-preview-wrap')?.querySelector('.motion-preview-media');
      if (media) media.classList.remove('loading');
    }
    setProgress(false);
    preview.classList.add('hidden');
    area.classList.remove('hidden');
    if (previewImg.src) URL.revokeObjectURL(previewImg.src);
    setUploadStatus?.();
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
function updateRefImageReadyState() {
  const btn = document.getElementById('btnGenerate');
  if (btn && currentMode === 'video') btn.disabled = refImageUploading;
}
setupFileUpload({
  inputId: 'imageRefFile',
  areaId: 'imageRefArea',
  previewId: 'imageRefPreview',
  imgId: 'imageRefPreviewImg',
  removeId: 'imageRefRemove',
  setUrl: (v) => { refImageUrl = v; updateRefImageReadyState(); },
  onUploadStart: () => { refImageUploading = true; updateRefImageReadyState(); },
  onUploadEnd: () => { refImageUploading = false; updateRefImageReadyState(); },
  progressElId: 'imageRefProgress'
});
setupFileUpload({ inputId: 'imgRefFile', areaId: 'imgRefArea', previewId: 'imgRefPreview', imgId: 'imgRefPreviewImg', removeId: 'imgRefRemove', setUrl: (v) => imgRefUrl = v });
function updateMotionReadyState(forceState) {
  const el = document.getElementById('motionReadyState');
  const btn = document.getElementById('btnGenerate');
  if (!el) return;
  if (forceState?.uploading) {
    el.textContent = '';
    el.className = 'motion-ready-state';
  } else if (forceState?.error) {
    el.textContent = '⚠ ' + forceState.error;
    el.className = 'motion-ready-state error';
  } else {
    const ok = !!(motionCharImageUrl && motionRefVideoUrl);
    el.textContent = ok ? '✓ Imagem e vídeo enviados — prontos para gerar' : '';
    el.className = 'motion-ready-state' + (ok ? ' ready' : '');
  }
  const p1 = document.getElementById('motionRefVideoProgress');
  const p2 = document.getElementById('motionCharImageProgress');
  const hasUploading = (p1 && !p1.classList.contains('hidden')) || (p2 && p2.classList.contains('uploading'));
  if (btn && currentMode === 'motion') btn.disabled = hasUploading || !(motionCharImageUrl && motionRefVideoUrl);
  if (currentMode === 'motion') updateMotionButtonCredits();
}
setupFileUpload({ inputId: 'motionCharImageFile', areaId: 'motionCharImageArea', previewId: 'motionCharImagePreview', imgId: 'motionCharImagePreviewImg', removeId: 'motionCharImageRemove', setUrl: (v) => motionCharImageUrl = v, onReady: updateMotionReadyState, uploadFn: (f) => uploadToSupabaseStorage(f, 'images'), onRemove: () => deleteMotionRefsFromStorage([motionCharImageUrl]), uploadStatusLabel: 'image', setUploadStatus: updateMotionReadyState, progressElId: 'motionCharImageProgress', hideProgressUI: true });

function setupVideoUpload(config) {
  const { inputId, areaId, previewId, videoId, removeId, setUrl, maxMb = 50, onReady, uploadFn, onRemove, uploadStatusLabel, setUploadStatus, progressElId } = config;
  const input = document.getElementById(inputId);
  const area = document.getElementById(areaId);
  const preview = document.getElementById(previewId);
  const previewVideo = document.getElementById(videoId);
  const removeBtn = document.getElementById(removeId);
  const progressEl = progressElId ? document.getElementById(progressElId) : null;

  if (!input || !area) return;

  let cancelProgress = () => {};
  const setProgress = (show) => {
    if (!progressEl) return;
    const fill = progressEl.querySelector('.upload-progress-fill');
    const pct = progressEl.querySelector('.upload-progress-pct');
    if (show) {
      cancelProgress();
      if (fill) fill.style.width = '0%';
      if (pct) pct.textContent = '0%';
      progressEl.classList.remove('hidden');
      progressEl.setAttribute('aria-hidden', 'false');
    } else {
      cancelProgress();
      progressEl.classList.add('hidden');
      progressEl.setAttribute('aria-hidden', 'true');
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) {
      if (setUploadStatus) setUploadStatus({ error: `Vídeo muito grande. Máximo ${maxMb}MB.` });
      else alert(`Vídeo muito grande. Máximo ${maxMb}MB.`);
      return;
    }
    area.classList.add('hidden');
    preview.classList.remove('hidden');
    previewVideo.src = URL.createObjectURL(file);
    setProgress(true);
    cancelProgress = runSimulatedProgress(progressEl);
    if (uploadStatusLabel && setUploadStatus) setUploadStatus({ uploading: uploadStatusLabel });
    try {
      const upload = uploadFn || uploadFileToVidgo;
      const url = await upload(file);
      setUrl(url);
      cancelProgress();
      const fill = progressEl?.querySelector('.upload-progress-fill');
      const pct = progressEl?.querySelector('.upload-progress-pct');
      const media = progressEl?.closest('.motion-preview-wrap')?.querySelector('.motion-preview-media');
      if (fill) fill.style.width = '100%';
      if (pct) pct.textContent = '100%';
      media?.classList.remove('loading');
      setTimeout(() => { setProgress(false); setUploadStatus?.(); onReady?.(); }, 400);
    } catch (err) {
      cancelProgress();
      const media = progressEl?.closest('.motion-preview-wrap')?.querySelector('.motion-preview-media');
      media?.classList.remove('loading');
      setProgress(false);
      if (setUploadStatus) setUploadStatus({ error: err.message });
      else alert('Erro no upload: ' + err.message);
      reset();
    }
  };

  const reset = () => {
    if (onRemove) onRemove().catch(() => {});
    setUrl('');
    cancelProgress();
    const media = progressEl?.closest('.motion-preview-wrap')?.querySelector('.motion-preview-media');
    if (media) media.classList.remove('loading');
    setProgress(false);
    preview.classList.add('hidden');
    area.classList.remove('hidden');
    previewVideo.src = '';
    setUploadStatus?.();
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

setupVideoUpload({ inputId: 'motionRefVideoFile', areaId: 'motionRefVideoArea', previewId: 'motionRefVideoPreview', videoId: 'motionRefVideoPreviewVid', removeId: 'motionRefVideoRemove', setUrl: (v) => motionRefVideoUrl = v, maxMb: 100, onReady: updateMotionReadyState, uploadFn: (f) => uploadToSupabaseStorage(f, 'videos'), onRemove: () => deleteMotionRefsFromStorage([motionRefVideoUrl]), uploadStatusLabel: 'video', setUploadStatus: updateMotionReadyState, progressElId: 'motionRefVideoProgress' });

function updateMotionButtonCredits() {
  if (currentMode !== 'motion') return;
  const btnText = document.getElementById('btnGenerateText');
  const motionNote = document.querySelector('.motion-cost-note');
  if (!btnText) return;
  const cost = getCreditsCostForBody({ model: 'kling-2.6/motion-control' });
  const hasValue = motionRefVideoUrl && cost > 0;
  const labels = { motion: 'Imitar movimento' };
  btnText.textContent = hasValue ? `${labels.motion} · ${cost} créditos` : labels.motion;
  if (motionNote) motionNote.classList.toggle('hidden', !hasValue);
}

function updateGenerateButtonLabel(showCredits = true) {
  const btnText = document.getElementById('btnGenerateText');
  if (!btnText) return;
  if (!showCredits) {
    btnText.textContent = 'Gerando...';
    return;
  }
  const labels = { video: 'Gerar vídeo', image: 'Gerar imagem', motion: 'Imitar movimento' };
  let cost = CREDITS_COST_VIDEO;
  let hasValue = true;
  if (currentMode === 'motion') {
    cost = getCreditsCostForBody({ model: 'kling-2.6/motion-control' });
    if (!motionRefVideoUrl) {
      cost = '—';
      hasValue = false;
    }
  } else if (currentMode === 'video' || currentMode === 'image') {
    cost = CREDITS_COST_VIDEO;
  }
  btnText.textContent = hasValue ? `${labels[currentMode] || 'Gerar'} · ${cost} créditos` : labels[currentMode] || 'Gerar';
}
document.getElementById('motionRefVideoPreviewVid')?.addEventListener('loadedmetadata', updateMotionButtonCredits);
document.getElementById('motionResolution')?.addEventListener('change', updateMotionButtonCredits);

// Build request body from form
function buildRequestBody() {
  if (currentMode === 'motion') {
    const orientation = document.getElementById('motionOrientation').value;
    const mode = document.getElementById('motionResolution').value;
    const aspectRatio = (document.getElementById('motionFormat') || document.getElementById('aspectRatio'))?.value || '9:16';
    const input = {
      input_urls: [motionCharImageUrl],
      video_urls: [motionRefVideoUrl],
      character_orientation: orientation,
      mode,
      aspect_ratio: aspectRatio
    };
    const prompt = document.getElementById('prompt').value.trim();
    if (prompt) input.prompt = prompt;
    return { model: 'kling-2.6/motion-control', input };
  }
  if (currentMode === 'video') {
    const model = hideModelSelection ? 'veo3.1-fast' : selectedModel;
    const prompt = document.getElementById('prompt').value.trim();

    if (model === 'veo3.1-fast') {
      const aspectRatio = document.getElementById('aspectRatio').value;
      const resolution = document.getElementById('veoResolution')?.value || '720p';
      // Regra: vídeo sempre em português, independente do prompt
      const promptPt = prompt + ' [IMPORTANTE: Todo o vídeo, áudio, diálogos e texto devem ser em português brasileiro.]';
      const input = {
        prompt: promptPt,
        duration: 8,
        aspect_ratio: aspectRatio === '1:1' ? '9:16' : aspectRatio,
        resolution
      };
      if (refImageUrl) {
        input.image_urls = [refImageUrl];
        // Modo reference: imagem guia personagem/objeto/estilo (não frame)
        input.generation_type = 'reference';
      }
      return { model: 'veo3.1-fast', input };
    }

    const duration = parseInt(document.getElementById('duration').value, 10);
    const aspectRatio = document.getElementById('aspectRatio').value;
    const style = document.getElementById('style').value;

    const input = { prompt, duration, aspect_ratio: aspectRatio };
    if (refImageUrl) input.image_urls = [refImageUrl];
    if (style) input.style = style;

    return { model, input };
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
  const isMotion = body?.model === 'kling-2.6/motion-control';
  const apiKey = isMotion ? getKieApiKey() : getApiKey();
  if (!apiKey) {
    alert('Configure sua chave API em config.js para começar.');
    return null;
  }

  if (isMotion) {
    const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    let data;
    try { data = await res.json(); } catch (_) { throw new Error(`Erro ${res.status}`); }
    if (data?.code !== 200) {
      const msg = (data?.msg || data?.failMsg || `Erro ${res.status}`).toString();
      const err = new Error(msg);
      err.isCredits = /credit|insufficient|saldo|quota|balance|402/i.test(msg);
      throw err;
    }
    return data?.data?.taskId || null;
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

async function getTaskStatus(taskId, isMotion = false) {
  if (isMotion) {
    const apiKey = getKieApiKey();
    const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await res.json();
    if (data?.code !== 200) throw new Error(data?.msg || `Erro ${res.status}`);
    const d = data?.data || {};
    const state = d.state || 'waiting';
    const mapped = {
      status: state === 'success' ? 'finished' : state === 'fail' ? 'failed' : 'running',
      task_id: d.taskId || taskId,
      progress: state === 'success' ? 100 : state === 'fail' ? 0 : 50,
      error_message: d.failMsg || null
    };
    if (state === 'success' && d.resultJson) {
      try {
        const result = JSON.parse(d.resultJson);
        const urls = result?.resultUrls || [];
        mapped.files = urls.map(url => ({ file_type: 'video', file_url: url }));
      } catch (_) {}
    }
    return mapped;
  }

  const apiKey = getApiKey();
  const res = await fetch(`${API_BASE}/api/generate/status/${taskId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Erro ${res.status}`);
  return data?.data;
}

const STATUS_PT = { not_started: 'Na fila', running: 'Gerando', finished: 'Pronto', failed: 'Falhou' };

function startLoadingForCard(cardRefs, mode) {
  if (!cardRefs?.loadingPlaceholder) return;
  cardRefs.loadingPlaceholder.classList.remove('hidden');
  const phrases = LOADING_PHRASES[mode] || LOADING_PHRASES.video;
  let idx = 0;
  if (cardRefs.loadingTextEl) cardRefs.loadingTextEl.textContent = phrases[0];
  const tid = setInterval(() => {
    idx = (idx + 1) % phrases.length;
    if (cardRefs.loadingTextEl) cardRefs.loadingTextEl.textContent = phrases[idx];
  }, 5000);
  loadingIntervals.set(cardRefs.card, tid);
}

function stopLoadingForCard(cardRefs) {
  if (cardRefs?.loadingPlaceholder) cardRefs.loadingPlaceholder.classList.add('hidden');
  const tid = cardRefs?.card && loadingIntervals.get(cardRefs.card);
  if (tid) {
    clearInterval(tid);
    loadingIntervals.delete(cardRefs.card);
  }
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
  const { taskStatusEl, taskProgressEl, progressFill, loadingPlaceholder, videoPlayer, imageGallery, creationDisclaimer, statusMessage, downloadWarning, downloadBtn, resultPromptEl } = cardRefs;
  const status = data.status || '';
  if (taskStatusEl) {
    taskStatusEl.textContent = STATUS_PT[status] || status;
    taskStatusEl.className = 'status-badge ' + status;
  }
  const apiProgress = data.progress || 0;
  if (taskProgressEl) taskProgressEl.textContent = apiProgress + '%';
  if (progressFill) progressFill.style.width = apiProgress + '%';

  if (data.status === 'finished' && data.files?.length) {
    const taskMeta = activeTasks.get(data.task_id);
    activeTasks.delete(data.task_id);
    const prompt = taskMeta?.prompt || '';
    const aspectRatio = taskMeta?.aspectRatio || '9:16';
    stopLoadingForCard(cardRefs);
    if (videoPlayer) {
      videoPlayer.src = '';
      videoPlayer.style.display = 'none';
    }
    if (imageGallery) {
      imageGallery.classList.add('hidden');
      imageGallery.innerHTML = '';
    }
    if (resultPromptEl) resultPromptEl.classList.add('hidden');
    if (creationDisclaimer) creationDisclaimer.classList.add('hidden');
    if (statusMessage) statusMessage.classList.add('hidden');
    if (cardRefs.card) {
      cardRefs.card.dataset.aspectRatio = aspectRatio;
      cardRefs.card.dataset.prompt = prompt;
    }

    const videoFile = data.files.find(f => f.file_type === 'video');
    const imageFiles = data.files.filter(f => f.file_type === 'image');

    if (videoFile) {
      if (videoPlayer) {
        videoPlayer.src = videoFile.file_url;
        videoPlayer.style.display = 'block';
        captureVideoThumbnail(videoPlayer);
      }
      const shareUrl = encodeURIComponent(videoFile.file_url);
      if (downloadBtn) {
        downloadBtn.href = videoFile.file_url;
        downloadBtn.download = `varvos-video-${data.task_id}.mp4`;
      }
      if (cardRefs.shareSection) {
        cardRefs.shareSection.classList.remove('hidden');
        if (cardRefs.whatsappBtn) {
          cardRefs.whatsappBtn.href = `https://api.whatsapp.com/send?text=${shareUrl}`;
          cardRefs.whatsappBtn.classList.remove('hidden');
        }
      }
      if (downloadWarning) downloadWarning.classList.remove('hidden');
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
        if (cardRefs.shareSection) cardRefs.shareSection.classList.remove('hidden');
      }
      if (downloadWarning) downloadWarning.classList.remove('hidden');
    }
  } else if (data.status === 'failed') {
    activeTasks.delete(data.task_id);
    const errMsg = (data.error_message || '').toString().trim();
    if (isCreditsError(errMsg)) {
      openCreditsModal();
      return;
    }
    stopLoadingForCard(cardRefs);
    if (statusMessage) {
      statusMessage.textContent = errMsg || 'Ocorreu um erro ao gerar. Tente novamente em alguns minutos.';
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

async function saveActiveTask(taskId, startTime, prompt) {
  const payload = {
    taskId,
    startTime: startTime || Date.now(),
    mode: currentMode,
    prompt: prompt || ''
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
      const tasks = Array.isArray(d.tasks) ? d.tasks : (d.taskId ? [{ taskId: d.taskId, startTime: d.startTime || Date.now(), mode: d.mode || 'video', prompt: d.prompt || '' }] : []);
      return tasks.map(t => ({ ...t, prompt: t.prompt || '' })).slice(0, 2);
    }
  } catch (e) {}
  return [];
}

async function pollUntilComplete(taskId, cardRefs, startTime, isMotion = false) {
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const data = await getTaskStatus(taskId, isMotion);
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

function getMotionRefVideoDuration() {
  const vid = document.getElementById('motionRefVideoPreviewVid');
  if (!vid || !vid.src) return 0;
  const d = vid.duration;
  return (typeof d === 'number' && !isNaN(d) && d > 0) ? d : 0;
}

function getCreditsCostForBody(body) {
  const isMotion = body?.model === 'kling-2.6/motion-control';
  if (!isMotion) return CREDITS_COST_VIDEO;
  const resolution = document.getElementById('motionResolution')?.value || '720p';
  const creditsPerSec = resolution === '1080p' ? CREDITS_PER_SECOND_MOTION_1080P : CREDITS_PER_SECOND_MOTION;
  const duration = getMotionRefVideoDuration();
  const seconds = Math.ceil(duration);
  return Math.max(creditsPerSec, seconds * creditsPerSec);
}

async function generateMedia(body) {
  const cost = getCreditsCostForBody(body);
  const userId = getCurrentUserId();
  const credits = getCredits();

  if (!userId) {
    openCreditsModal();
    return;
  }
  if (credits == null || credits < cost) {
    openCreditsModal();
    return;
  }

  btnGenerate.disabled = true;
  updateGenerateButtonLabel(false);
  const startTime = Date.now();
  const cardIndex = getAvailableCardIndex();
  const cardRefs = getCardByIndex(cardIndex);

  if (!cardRefs) {
    updateGenerateButtonLabel(true);
    if (currentMode === 'video') updateRefImageReadyState(); else btnGenerate.disabled = false;
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
  if (cardRefs.shareSection) cardRefs.shareSection.classList.add('hidden');
  if (cardRefs.downloadWarning) cardRefs.downloadWarning.classList.add('hidden');
  if (cardRefs.creationDisclaimer) cardRefs.creationDisclaimer.classList.remove('hidden');
  if (cardRefs.statusMessage) { cardRefs.statusMessage.classList.remove('hidden'); cardRefs.statusMessage.textContent = ''; }
  if (cardRefs.resultPromptEl) cardRefs.resultPromptEl.classList.add('hidden');

  let taskId = null;
  let creditsDeducted = false;
  try {
    taskId = await submitTask(body);
    if (!taskId) throw new Error('Nenhum task_id retornado');

    const deductRes = await fetch('/api/deduct-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount: cost, taskId }),
    });
    if (deductRes.ok) {
      creditsDeducted = true;
      await refreshCreditsFromSupabase();
    } else {
      console.warn('[VARVOS] Deduct credits falhou:', await deductRes.text());
    }

    outputPlaceholder.classList.add('hidden');
    outputResultsList.classList.remove('hidden');

    if (cardRefs.taskStatusEl) cardRefs.taskStatusEl.textContent = 'Enviando...';
    if (cardRefs.taskStatusEl) cardRefs.taskStatusEl.className = 'status-badge';
    if (cardRefs.taskProgressEl) cardRefs.taskProgressEl.textContent = '0%';
    if (cardRefs.progressFill) cardRefs.progressFill.style.width = '0%';
    if (cardRefs.statusMessage) cardRefs.statusMessage.textContent = '';

    const aspectRatio = (currentMode === 'motion' ? document.getElementById('motionFormat') : document.getElementById('aspectRatio'))?.value || '9:16';
    if (cardRefs.card) cardRefs.card.dataset.aspectRatio = aspectRatio;
    activeTasks.set(taskId, { cardRefs, startTime, prompt: lastPrompt, aspectRatio, isMotion: body?.model === 'kling-2.6/motion-control' });
    startLoadingForCard(cardRefs, currentMode);
    document.getElementById('currentResultSection')?.scrollIntoView({ behavior: 'smooth', block: 'end' });

    currentTaskId = taskId;
    saveActiveTask(taskId, startTime, lastPrompt);
    updateOutputUI({ status: 'not_started', progress: 0 }, cardRefs, startTime);

    updateGenerateButtonLabel(true);
    if (currentMode === 'video') updateRefImageReadyState(); else btnGenerate.disabled = false;

    const isMotion = body?.model === 'kling-2.6/motion-control';
    const result = await pollUntilComplete(taskId, cardRefs, startTime, isMotion);
    const tid = pollTimeouts.get(taskId);
    if (tid) { clearTimeout(tid); pollTimeouts.delete(taskId); }
    if (isMotion) deleteMotionRefsFromStorage();
    if (result?.status === 'finished' && result?.files?.length) {
      const ar = result.files[0]?.file_type === 'video'
        ? ((currentMode === 'motion' ? document.getElementById('motionFormat') : document.getElementById('aspectRatio'))?.value || '9:16')
        : (document.getElementById('imgSize')?.value || '1:1');
      addToHistory(result, lastPrompt, ar);
    }
  } catch (err) {
    if (taskId) activeTasks.delete(taskId);
    if (body?.model === 'kling-2.6/motion-control') deleteMotionRefsFromStorage();
    stopLoadingForCard(cardRefs);
    console.error('[VARVOS] Erro na geração:', err);

    let refunded = false;
    if (creditsDeducted && userId && taskId) {
      try {
        const refundRes = await fetch('/api/refund-credits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount: cost, taskId }),
        });
        if (refundRes.ok) {
          refunded = true;
          await refreshCreditsFromSupabase();
        }
      } catch (e) { console.warn('[VARVOS] Refund falhou:', e); }
    }

    if (err.isCredits) {
      openCreditsModal();
    } else if (cardRefs.statusMessage) {
      const msg = (err?.message || '').toString().trim();
      let displayMsg = msg || 'Ocorreu um erro. Tente novamente em alguns minutos.';
      if (refunded) displayMsg += ' Seus créditos foram estornados.';
      cardRefs.statusMessage.textContent = displayMsg;
      cardRefs.statusMessage.className = 'status-message error';
    }
    const tid = pollTimeouts.get(taskId);
    if (tid) { clearTimeout(tid); pollTimeouts.delete(taskId); }
    updateGenerateButtonLabel(true);
    if (currentMode === 'video') updateRefImageReadyState(); else btnGenerate.disabled = false;
  }
}

generateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (currentMode === 'motion') {
    if (!motionCharImageUrl || !motionRefVideoUrl) {
      alert('Selecione a imagem do personagem e o vídeo de referência.');
      return;
    }
    const duration = getMotionRefVideoDuration();
    if (duration <= 0) {
      alert('Aguarde o carregamento do vídeo de referência.');
      return;
    }
    lastPrompt = document.getElementById('prompt').value.trim() || 'Motion transfer';
  } else {
    const prompt = document.getElementById('prompt').value.trim();
    if (!prompt) {
      alert('Preencha o prompt.');
      return;
    }
    // Imagem de ref selecionada mas upload ainda em andamento?
    const preview = document.getElementById('imageRefPreview');
    if (preview && !preview.classList.contains('hidden') && !refImageUrl) {
      alert('Aguarde o upload da imagem terminar antes de gerar.');
      return;
    }
    lastPrompt = prompt;
  }
  const body = buildRequestBody();
  await generateMedia(body);
});

// JSON tab submit
document.getElementById('btnClearHistory')?.addEventListener('click', clearHistory);

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

// Preencher prompt vindo do Recriar vídeo (?prompt=texto)
const promptParam = urlParams.get('prompt');
if (promptParam && pathname.includes('video')) {
  try {
    const prompt = decodeURIComponent(promptParam);
    const promptEl = document.getElementById('prompt');
    if (prompt && promptEl) {
      promptEl.value = prompt;
      updateClearPromptVisibility();
    }
  } catch (_) {}
}

// Restaurar tarefas em andamento após recarregar (Supabase se logado, senão sessionStorage)
async function restoreActiveTask() {
  if (!outputPlaceholder || !outputResultsList) return;
  const allTasks = await getStoredActiveTasks();
  const isMotionPage = /imitar-movimento/.test(window.location.pathname || '');
  const tasks = isMotionPage
    ? allTasks.filter(t => t.mode === 'motion')
    : allTasks.filter(t => t.mode !== 'motion');
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
    startLoadingForCard(cardRefs, data.mode || 'video');

    if (cardRefs.taskStatusEl) cardRefs.taskStatusEl.textContent = 'Enviando...';
    if (cardRefs.taskProgressEl) cardRefs.taskProgressEl.textContent = '0%';
    if (cardRefs.progressFill) cardRefs.progressFill.style.width = '0%';

    const isMotion = data.mode === 'motion';
    pollUntilComplete(data.taskId, cardRefs, startTime, isMotion)
      .then((result) => {
        const tid = pollTimeouts.get(data.taskId);
        if (tid) { clearTimeout(tid); pollTimeouts.delete(data.taskId); }
        if (result?.status === 'finished' && result?.files?.length) {
          const ar = result.files[0]?.file_type === 'video'
            ? (document.getElementById('aspectRatio')?.value || '9:16')
            : (document.getElementById('imgSize')?.value || '1:1');
          const promptToSave = data.prompt || lastPrompt || '';
          addToHistory(result, promptToSave, ar);
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
          const msg = (err?.message || '').toString().trim();
          cardRefs.statusMessage.textContent = msg || 'Ocorreu um erro. Tente novamente em alguns minutos.';
          cardRefs.statusMessage.className = 'status-message error';
        }
      })
      .finally(() => {
        updateGenerateButtonLabel(true);
        if (currentMode === 'video') updateRefImageReadyState(); else btnGenerate.disabled = false;
      });
  };

  tasks.forEach((data, i) => restoreOne(data, i));
  if (tasks.length > 0) {
    currentTaskId = tasks[0].taskId;
    document.getElementById('currentResultSection')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
}

restoreActiveTask();

