const API_BASE = 'https://api.vidgo.ai';
const POLL_INTERVAL = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos – cancela se a API não concluir
const CREDITS_COST_VIDEO = 50;
const CREDITS_COST_VIDEO_4K = 100;  // veo3.1-fast em 4K custa o dobro
const CREDITS_PER_SECOND_MOTION_720 = 8;   // Imitar movimento 720p: 8 créditos/segundo
const CREDITS_PER_SECOND_MOTION_1080 = 11;  // Imitar movimento Full HD (1080p): 11 créditos/segundo
const SKIP_CREDITS = false;  // true = criar vídeos sem deduzir créditos (para desenvolvimento/teste)
const STORAGE_KEY = 'varvos_api_key';
const HISTORY_STORAGE_KEY = 'varvos_history';
const CREDITS_STORAGE_KEY = 'varvos_credits';
const AUTH_STORAGE = 'varvos_user';
const ACTIVE_TASK_STORAGE = 'varvos_active_task';

let selectedModel = 'veo3.1-fast';
let hideModelGrok = false;
let hideModelVeo3 = false;
let hideModelSora2 = false;
let currentMode = 'video';
let currentTaskId = null;
let lastPrompt = '';
let refImageUrl = '';   // Video reference (uploaded)
let refImageUrl2 = '';  // VEO 3: 2ª imagem (frame ou reference)
let refImageUrl3 = '';  // VEO 3: 3ª imagem (reference)
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
    loadingPlaceholderBg: cardEl.querySelector('.loading-placeholder-bg'),
    loadingTextEl: cardEl.querySelector('.loading-placeholder-text'),
    loadingProgressPct: cardEl.querySelector('.loading-progress-pct'),
    loadingProgressFill: cardEl.querySelector('.loading-progress-fill'),
    loadingPromptWrap: cardEl.querySelector('.loading-placeholder-prompt'),
    loadingPromptText: cardEl.querySelector('.loading-prompt-text'),
    videoPlayer: cardEl.querySelector('.media-output'),
    imageGallery: cardEl.querySelector('.image-gallery'),
    creationDisclaimer: cardEl.querySelector('.creation-disclaimer'),
    statusMessage: cardEl.querySelector('.status-message'),
    downloadWarning: cardEl.querySelector('.download-warning'),
    downloadBtn: cardEl.querySelector('.btn-download'),
    shareSection: cardEl.querySelector('.share-video-buttons'),
    whatsappBtn: cardEl.querySelector('.btn-share-whatsapp'),
    resultPromptEl: cardEl.querySelector('.result-prompt-wrap')
  };
}
function getCardByIndex(i) {
  const card = outputResultsList?.querySelector(`.output-result-card[data-card="${i}"]`);
  return card ? getCardRefs(card) : null;
}
const btnVerify = document.getElementById('btnVerify'); // Removido da UI, mantido para compatibilidade
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const historyVerMaisWrap = document.getElementById('historyVerMaisWrap');
const btnVerMais = document.getElementById('btnVerMais');
let historyShowingAll = false;
const btnClearHistory = document.getElementById('btnClearHistory');
const creditsModal = document.getElementById('creditsModal');

const activeTasks = new Map();
const reservedCardIndices = new Set();
const EXPECTED_DURATION_MS = 10 * 60 * 1000;

// Prompt suggestion chips e theme boxes (ao clicar preenche o prompt)
document.querySelectorAll('.chip, .suggestion-theme-box').forEach(btn => {
  btn.addEventListener('click', () => {
    const p = btn.dataset.prompt || '';
    const prompt = document.getElementById('prompt');
    if (prompt && p) { prompt.value = p; updateClearPromptVisibility(); updatePromptWrapValue(); prompt.focus(); }
  });
});

// Placeholder animado — digita e apaga exemplos em quase transparente
const PROMPT_EXAMPLES = [
  'Mulher no mercado sorrindo com produto, luz natural, ambiente acolhedor',
  'Vendedor animado apresentando produto à câmera, gestos expressivos, pitch de vendas',
  'Unboxing com reação de surpresa ao abrir a caixa do produto',
  'Antes e depois em split screen mostrando resultado do uso do produto',
  'Personal trainer na academia falando sobre treino, ambiente fitness'
];
let promptExampleIndex = 0;
let promptExampleCharIndex = 0;
let promptTypingForward = true;
let promptTypingTimeout = null;

function runPromptPlaceholderAnimation() {
  const el = document.getElementById('promptPlaceholderAnimated');
  const wrap = document.querySelector('.prompt-field-wrap');
  const prompt = document.getElementById('prompt');
  if (!el || !wrap || !prompt) return;
  if (wrap.matches(':focus-within') || prompt.value.trim()) return;
  const text = PROMPT_EXAMPLES[promptExampleIndex];
  if (promptTypingForward) {
    promptExampleCharIndex++;
    el.textContent = text.slice(0, promptExampleCharIndex);
    if (promptExampleCharIndex >= text.length) {
      promptTypingForward = false;
      promptTypingTimeout = setTimeout(runPromptPlaceholderAnimation, 1500);
    } else {
      promptTypingTimeout = setTimeout(runPromptPlaceholderAnimation, 50 + Math.random() * 30);
    }
  } else {
    promptExampleCharIndex--;
    el.textContent = text.slice(0, promptExampleCharIndex);
    if (promptExampleCharIndex <= 0) {
      promptTypingForward = true;
      promptExampleIndex = (promptExampleIndex + 1) % PROMPT_EXAMPLES.length;
      promptTypingTimeout = setTimeout(runPromptPlaceholderAnimation, 400);
    } else {
      promptTypingTimeout = setTimeout(runPromptPlaceholderAnimation, 25);
    }
  }
}

function updatePromptWrapValue() {
  const wrap = document.querySelector('.prompt-field-wrap');
  const prompt = document.getElementById('prompt');
  if (wrap && prompt) wrap.classList.toggle('has-value', !!prompt.value.trim());
}

document.getElementById('prompt')?.addEventListener('focus', () => {
  if (promptTypingTimeout) clearTimeout(promptTypingTimeout);
  updatePromptWrapValue();
});
document.getElementById('prompt')?.addEventListener('blur', () => {
  updatePromptWrapValue();
  promptExampleIndex = 0;
  promptExampleCharIndex = 0;
  promptTypingForward = true;
  promptTypingTimeout = setTimeout(runPromptPlaceholderAnimation, 800);
});
document.getElementById('prompt')?.addEventListener('input', () => {
  updatePromptWrapValue();
  if (promptTypingTimeout) clearTimeout(promptTypingTimeout);
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
  const durationWrap = document.getElementById('durationWrap');
  const veoResolutionWrap = document.getElementById('veoResolutionWrap');
  const aspectRatioWrap = document.querySelector('.config-card[data-target="aspectRatio"]');
  const grokDurationWrap = document.getElementById('grokDurationWrap');
  const grokResolutionWrap = document.getElementById('grokResolutionWrap');
  const grokModeWrap = document.getElementById('grokModeWrap');
  const configRefOptional = document.getElementById('configRefOptional');
  const configRefRequired = document.getElementById('configRefRequired');
  const configRefWrap = document.getElementById('configRefWrap');
  const noticeVeo = document.getElementById('modelNoticeVeo');
  const noticeSora = document.getElementById('modelNoticeSora');
  if (!modelSelect) return;
  selectedModel = modelSelect.value;
  const isVEO = selectedModel === 'veo3.1-fast';
  const isGrok = selectedModel === 'grok-imagine/image-to-video';
  const isSoraOrVeo = selectedModel === 'sora-2' || selectedModel === 'veo3.1-fast';
  if (durationWrap) durationWrap.classList.toggle('hidden', isGrok);
  if (durationSelect) durationSelect.classList.toggle('hidden', isVEO || isGrok);
  if (durationFixed) durationFixed.classList.toggle('hidden', !isVEO);
  if (veoResolutionWrap) veoResolutionWrap.classList.toggle('hidden', !isVEO);
  if (aspectRatioWrap) aspectRatioWrap.classList.toggle('hidden', isGrok);
  if (grokDurationWrap) grokDurationWrap.classList.toggle('hidden', !isGrok);
  if (grokResolutionWrap) grokResolutionWrap.classList.toggle('hidden', !isGrok);
  if (grokModeWrap) grokModeWrap.classList.toggle('hidden', !isGrok);
  if (configRefOptional) configRefOptional.classList.toggle('hidden', isGrok);
  if (configRefRequired) configRefRequired.classList.toggle('hidden', !isGrok);
  if (configRefWrap && isSoraOrVeo) configRefWrap.classList.remove('hidden');
  const veo3RefsWrap = document.getElementById('veo3RefsWrap');
  const veo3RefsHint = document.getElementById('veo3RefsHint');
  const imageRefAreaText = document.querySelector('#imageRefArea .file-upload-text');
  if (veo3RefsWrap) veo3RefsWrap.classList.toggle('hidden', !isVEO);
  if (veo3RefsHint) veo3RefsHint.classList.toggle('hidden', !isVEO);
  if (imageRefAreaText) imageRefAreaText.textContent = isVEO ? 'Imagem 1' : 'Clique ou arraste uma imagem';
  if (noticeVeo) noticeVeo.classList.toggle('hidden', !isVEO);
  if (noticeSora) noticeSora.classList.toggle('hidden', isVEO && !isGrok);
  if (typeof syncConfigCardDisplays === 'function') syncConfigCardDisplays();
  if (currentMode === 'video') updateRefImageReadyState();
}
document.getElementById('videoModel')?.addEventListener('change', updateVideoModelUI);

const MODEL_OPTIONS = [
  { value: 'grok-imagine/image-to-video', label: 'Grok', hideKey: 'hideModelGrok' },
  { value: 'veo3.1-fast', label: 'VEO 3.1 Fast', hideKey: 'hideModelVeo3' },
  { value: 'sora-2', label: 'Sora 2', hideKey: 'hideModelSora2' }
];

function getEffectiveModel() {
  const hidden = { 'grok-imagine/image-to-video': hideModelGrok, 'veo3.1-fast': hideModelVeo3, 'sora-2': hideModelSora2 };
  const visible = MODEL_OPTIONS.filter(m => !hidden[m.value]);
  if (visible.length === 0) return selectedModel;
  if (visible.length === 1) return visible[0].value;
  return hidden[selectedModel] ? visible[0].value : selectedModel;
}

async function applyHideModelSetting() {
  const fieldModel = document.querySelector('.field-model');
  const modelSel = document.getElementById('videoModel');
  if (!fieldModel || !modelSel) return;
  const sb = window.varvosSupabase;
  if (!sb) return;
  try {
    const { data: rows } = await sb.from('app_settings').select('key, value').in('key', ['hide_model_grok', 'hide_model_veo3', 'hide_model_sora2']);
    const map = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
    const toBool = (v) => !!(v === true || v === 'true');
    hideModelGrok = toBool(map.hide_model_grok);
    hideModelVeo3 = toBool(map.hide_model_veo3);
    hideModelSora2 = toBool(map.hide_model_sora2);

    const hidden = { 'grok-imagine/image-to-video': hideModelGrok, 'veo3.1-fast': hideModelVeo3, 'sora-2': hideModelSora2 };
    const visible = MODEL_OPTIONS.filter(m => !hidden[m.value]);
    if (visible.length === 0) {
      fieldModel.classList.remove('hidden');
      updateVideoModelUI();
      return;
    }
    if (visible.length === 1) {
      fieldModel.classList.add('hidden');
      selectedModel = visible[0].value;
      modelSel.value = selectedModel;
    } else {
      fieldModel.classList.remove('hidden');
      const currentVal = modelSel.value;
      modelSel.innerHTML = visible.map(m => `<option value="${m.value}" ${currentVal === m.value ? 'selected' : ''}>${m.label}</option>`).join('');
      if (hidden[currentVal]) {
        selectedModel = visible[0].value;
        modelSel.value = selectedModel;
      } else {
        selectedModel = currentVal;
      }
    }
    updateVideoModelUI();
  } catch (e) {
    console.warn('app_settings:', e);
  }
}

(async function initVideoModelSettings() {
  if (document.getElementById('videoModel')) {
    await applyHideModelSetting();
    updateVideoModelUI();
  }
})();

document.getElementById('btnClearPrompt')?.addEventListener('click', () => {
  const prompt = document.getElementById('prompt');
  if (prompt) {
    prompt.value = '';
    prompt.focus();
    updateClearPromptVisibility();
    updatePromptWrapValue();
    promptExampleCharIndex = 0;
    promptTypingForward = true;
    if (promptTypingTimeout) clearTimeout(promptTypingTimeout);
    promptTypingTimeout = setTimeout(runPromptPlaceholderAnimation, 500);
  }
});

document.getElementById('prompt')?.addEventListener('input', updateClearPromptVisibility);
document.getElementById('prompt')?.addEventListener('change', updateClearPromptVisibility);

// Init clear button visibility
updateClearPromptVisibility();
updatePromptWrapValue();

// Inicia placeholder animado após carregar
setTimeout(() => {
  if (document.getElementById('promptPlaceholderAnimated') && !document.querySelector('.prompt-field-wrap.has-value')) {
    runPromptPlaceholderAnimation();
  }
}, 600);

// Sincroniza displays dos config cards
function syncConfigCardDisplays() {
  const modelSel = document.getElementById('videoModel');
  const aspectSel = document.getElementById('aspectRatio');
  const durationSel = document.getElementById('duration');
  const resSel = document.getElementById('veoResolution');
  const grokDurationSel = document.getElementById('grokDuration');
  const grokResolutionSel = document.getElementById('grokResolution');
  const grokModeSel = document.getElementById('grokMode');
  const modelDisp = document.getElementById('videoModelDisplay');
  const aspectDisp = document.getElementById('aspectRatioDisplay');
  const durationDisp = document.getElementById('durationDisplay');
  const resDisp = document.getElementById('veoResolutionDisplay');
  const grokDurationDisp = document.getElementById('grokDurationDisplay');
  const grokResolutionDisp = document.getElementById('grokResolutionDisplay');
  const grokModeDisp = document.getElementById('grokModeDisplay');
  if (modelSel && modelDisp) modelDisp.textContent = modelSel.selectedOptions[0]?.text || modelSel.value;
  if (aspectSel && aspectDisp) aspectDisp.textContent = aspectSel.selectedOptions[0]?.text || aspectSel.value;
  if (durationSel && durationDisp) {
    durationDisp.textContent = modelSel?.value === 'veo3.1-fast' ? '8 segundos' : (durationSel.selectedOptions[0]?.text || durationSel.value + ' segundos');
  }
  if (resSel && resDisp) resDisp.textContent = resSel.selectedOptions[0]?.text || resSel.value;
  if (grokDurationSel && grokDurationDisp) grokDurationDisp.textContent = grokDurationSel.selectedOptions[0]?.text || grokDurationSel.value + ' segundos';
  if (grokResolutionSel && grokResolutionDisp) grokResolutionDisp.textContent = grokResolutionSel.selectedOptions[0]?.text || grokResolutionSel.value;
  if (grokModeSel && grokModeDisp) grokModeDisp.textContent = grokModeSel.selectedOptions[0]?.text || grokModeSel.value;
}
document.getElementById('videoModel')?.addEventListener('change', () => {
  syncConfigCardDisplays();
  if (currentMode === 'video') updateGenerateButtonLabel(true);
});
document.getElementById('aspectRatio')?.addEventListener('change', syncConfigCardDisplays);
document.getElementById('duration')?.addEventListener('change', syncConfigCardDisplays);
document.getElementById('veoResolution')?.addEventListener('change', () => {
  syncConfigCardDisplays();
  if (currentMode === 'video') updateGenerateButtonLabel(true);
});
document.getElementById('grokDuration')?.addEventListener('change', () => {
  syncConfigCardDisplays();
  if (currentMode === 'video') updateGenerateButtonLabel(true);
});
document.getElementById('grokResolution')?.addEventListener('change', () => {
  syncConfigCardDisplays();
  if (currentMode === 'video') updateGenerateButtonLabel(true);
});
document.getElementById('grokMode')?.addEventListener('change', syncConfigCardDisplays);
if (document.getElementById('videoModel')) syncConfigCardDisplays();

// Sincroniza displays dos config cards — Imitar Movimento
function syncMotionConfigDisplays() {
  const formatSel = document.getElementById('motionFormat');
  const orientSel = document.getElementById('motionOrientation');
  const resSel = document.getElementById('motionResolution');
  const formatDisp = document.getElementById('motionFormatDisplay');
  const orientDisp = document.getElementById('motionOrientationDisplay');
  const resDisp = document.getElementById('motionResolutionDisplay');
  if (formatSel && formatDisp) formatDisp.textContent = formatSel.selectedOptions[0]?.text || formatSel.value;
  if (orientSel && orientDisp) orientDisp.textContent = orientSel.selectedOptions[0]?.text || orientSel.value;
  if (resSel && resDisp) resDisp.textContent = resSel.selectedOptions[0]?.text || resSel.value;
}
document.getElementById('motionFormat')?.addEventListener('change', () => { syncMotionConfigDisplays(); updateMotionButtonCredits(); });
document.getElementById('motionOrientation')?.addEventListener('change', syncMotionConfigDisplays);
document.getElementById('motionResolution')?.addEventListener('change', () => { syncMotionConfigDisplays(); updateMotionButtonCredits(); });
if (document.getElementById('motionFormat')) syncMotionConfigDisplays();

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
  if (playerWrap) playerWrap.style.aspectRatio = '9/16';
  const promptEl = document.getElementById('videoModalPrompt');
  if (promptEl) {
    promptEl.textContent = prompt || '';
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

// Botão "Fechar" para ocultar o resultado da tela
outputResultsList?.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('.btn-close-result');
  if (closeBtn) {
    e.preventDefault();
    const card = closeBtn.closest('.output-result-card');
    if (card) {
      const taskId = Array.from(activeTasks.entries()).find(([, m]) => m.cardRefs?.card === card)?.[0];
      if (taskId) {
        activeTasks.delete(taskId);
        clearActiveTask(taskId).catch(() => {});
      }
      card.classList.add('hidden');
      const video = card.querySelector('.media-output');
      if (video) { video.src = ''; video.style.display = 'none'; }
      const visibleCards = outputResultsList?.querySelectorAll('.output-result-card:not(.hidden)');
      if (outputPlaceholder && (!visibleCards || visibleCards.length === 0)) {
        outputPlaceholder.classList.remove('hidden');
        outputResultsList?.classList.add('hidden');
      }
    }
    return;
  }
  const retryBtn = e.target.closest('.btn-retry-generation');
  if (retryBtn) {
    e.preventDefault();
    const card = retryBtn.closest('.output-result-card');
    const bodyJson = card?.dataset?.retryBody;
    if (bodyJson) {
      try {
        const body = JSON.parse(bodyJson);
        card.querySelector('.status-retry-wrap')?.remove();
        card.removeAttribute('data-retry-body');
        if (card.querySelector('.status-message')) {
          card.querySelector('.status-message').textContent = '';
          card.querySelector('.status-message').classList.remove('error');
        }
        generateMedia(body);
      } catch (_) {}
    }
    return;
  }
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
  const loadingToggle = e.target.closest('.loading-prompt-toggle');
  if (loadingToggle) {
    e.preventDefault();
    const wrap = loadingToggle.closest('.loading-placeholder-prompt');
    const content = wrap?.querySelector('.loading-prompt-content');
    if (content) {
      content.classList.toggle('collapsed');
      loadingToggle.setAttribute('aria-expanded', content.classList.contains('collapsed') ? 'false' : 'true');
      const label = wrap?.querySelector('.loading-prompt-label');
      if (label) label.textContent = content.classList.contains('collapsed') ? 'Ver prompt' : 'Ver menos';
    }
    return;
  }
  const toggleBtn = e.target.closest('.result-prompt-toggle');
  if (toggleBtn) {
    e.preventDefault();
    const wrap = toggleBtn.closest('.result-prompt-wrap');
    const content = wrap?.querySelector('.result-prompt-content');
    if (wrap && content) {
      content.classList.toggle('collapsed');
      toggleBtn.setAttribute('aria-expanded', content.classList.contains('collapsed') ? 'false' : 'true');
    }
    return;
  }
  const mediaContainer = e.target.closest('.media-container');
  if (!mediaContainer) return;
  if (e.target.closest('.btn-download, .btn-share-whatsapp')) return;
  const loadingPlaceholder = mediaContainer.querySelector('.loading-placeholder');
  if (loadingPlaceholder && !loadingPlaceholder.classList.contains('hidden')) return;
  const video = mediaContainer.querySelector('.media-output');
  const src = video?.src || video?.getAttribute('src');
  if (!src || src === 'about:blank' || src.length < 10) return;
  const card = mediaContainer.closest('.output-result-card');
  const downloadBtn = card?.querySelector('.btn-download');
  const aspectRatio = card?.dataset?.aspectRatio || '9:16';
  const prompt = card?.dataset?.prompt || '';
  openVideoModalForResult(src, downloadBtn, null, aspectRatio, prompt);
});

// Ver mais / Ver menos — Seus vídeos
btnVerMais?.addEventListener('click', () => {
  historyShowingAll = !historyShowingAll;
  renderHistory();
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
    const userDropdown = document.getElementById('userMenuDropdown');
    const plans = document.getElementById('plansModal');
    const support = document.getElementById('supportModal');
    if (userDropdown && !userDropdown.classList.contains('hidden')) closeUserMenu();
    else if (support && !support.classList.contains('hidden')) closeSupportModal();
    else if (plans && !plans.classList.contains('hidden')) closePlansModal();
    else if (videoModal && !videoModal.classList.contains('hidden')) closeVideoModal();
    else if (creditsModal && !creditsModal.classList.contains('hidden')) closeCreditsModal();
  }
});

document.getElementById('creditsModalClose')?.addEventListener('click', closeCreditsModal);
document.querySelector('.credits-modal-backdrop')?.addEventListener('click', closeCreditsModal);

// Credits modal: CTA abre auth ou planos conforme o motivo
document.getElementById('creditsModalPlans')?.addEventListener('click', () => {
  closeCreditsModal();
  const reason = creditsModal?.getAttribute('data-credits-reason');
  if (reason === 'login') {
    const returnTo = encodeURIComponent(window.location.pathname || '/video/');
    if (typeof openAuthModal === 'function') {
      openAuthModal(window.location.pathname || '/video/');
    } else {
      window.location.href = `/auth.html?return=${returnTo}`;
    }
  } else {
    openPlansModal();
  }
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
  document.querySelectorAll('#headerCredits, #userMenuCredits').forEach(el => { if (el) el.textContent = txt; });
}

function animateCreditsDecrease(amount) {
  const wrap = document.querySelector('.header-credits-wrap');
  if (!wrap) return;
  const badge = document.createElement('span');
  badge.className = 'credits-deduct-badge';
  badge.textContent = `−${amount}`;
  wrap.appendChild(badge);
  wrap.classList.add('credits-just-decreased');
  setTimeout(() => {
    wrap.classList.remove('credits-just-decreased');
    badge.remove();
  }, 750);
}

async function refreshCreditsFromSupabase() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    if (!user) return;
    const userId = user.id;
    const userEmail = (user.email || '').trim().toLowerCase();
    if (!userId && !userEmail) return;
    let ok = false;
    // Usa API get-credits: retorna credits + plan e infere plano de contas antigas via payments
    const qs = userId ? 'userId=' + encodeURIComponent(userId) : 'email=' + encodeURIComponent(userEmail);
    const r = await fetch(window.location.origin + '/api/get-credits?' + qs);
    if (r.ok) {
      const data = await r.json();
      if (data.credits != null) user.credits = data.credits;
      if (data.plan != null) user.plan = data.plan;
      ok = true;
    } else if (window.varvosSupabase) {
      const { data } = userId
        ? await window.varvosSupabase.from('users').select('id, credits, plan').eq('id', userId).single()
        : await window.varvosSupabase.from('users').select('id, credits, plan').eq('email', userEmail).single();
      if (data) {
        if (data.credits != null) user.credits = data.credits;
        if (data.plan != null) user.plan = data.plan;
        if (data.id && !user.id) user.id = data.id;
        ok = true;
      }
    }
    if (ok) {
      localStorage.setItem(AUTH_STORAGE, JSON.stringify(user));
      updateCreditsDisplay();
      updateUserMenuPlan();
    }
  } catch (_) {}
}

function getPlanDisplay(planId) {
  const plans = window.VARVOS_PLANS?.mensais;
  if (!plans || !planId) return null;
  const p = plans[planId];
  return p ? { name: p.name, credits: p.credits, description: p.description } : null;
}

function updateUserMenuPlan() {
  const row = document.getElementById('userMenuPlanRow');
  const nameEl = document.getElementById('userMenuPlanName');
  if (!row || !nameEl) return;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    const planId = user?.plan;
    const plan = getPlanDisplay(planId);
    if (!plan) {
      row.classList.add('hidden');
      return;
    }
    row.classList.remove('hidden');
    nameEl.textContent = plan.name;
  } catch {
    row?.classList.add('hidden');
  }
}

let plansModalTimerInterval = null;

function startPlansModalTimer() {
  const el = document.getElementById('plansModalTimerCountdown');
  if (!el) return;
  const minutes = 15;
  let remaining = minutes * 60;
  const tick = () => {
    if (remaining <= 0) {
      if (plansModalTimerInterval) clearInterval(plansModalTimerInterval);
      plansModalTimerInterval = null;
      el.textContent = '0:00';
      return;
    }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    el.textContent = m + ':' + String(s).padStart(2, '0');
    remaining--;
  };
  tick();
  if (plansModalTimerInterval) clearInterval(plansModalTimerInterval);
  plansModalTimerInterval = setInterval(tick, 1000);
}

function openPlansModal() {
  const m = document.getElementById('plansModal');
  if (m) {
    startPlansModalTimer();
    updatePlansActiveSection();
    updatePlanCardsActiveState();
    m.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Se tem plano ativo, abre aba Planos Mensais para ver opções de upgrade
    try {
      const raw = localStorage.getItem(AUTH_STORAGE);
      const user = raw ? JSON.parse(raw) : null;
      if (user?.plan) {
        document.querySelectorAll('.plans-tab').forEach(t => t.classList.remove('active'));
        const mensaisTab = document.querySelector('.plans-tab[data-tab="mensais"]');
        if (mensaisTab) {
          mensaisTab.classList.add('active');
          document.getElementById('plansAvulsos')?.classList.add('hidden');
          document.getElementById('plansMensais')?.classList.remove('hidden');
        }
      }
    } catch (_) {}
  }
}

const PLAN_ORDER = ['start', 'pro', 'agency'];

function isPlanUpgrade(planId, activePlanId) {
  if (!activePlanId) return false;
  const a = PLAN_ORDER.indexOf(activePlanId);
  const b = PLAN_ORDER.indexOf(planId);
  return a >= 0 && b >= 0 && b > a;
}

function updatePlanCardsActiveState() {
  const container = document.getElementById('plansMensais');
  if (!container) return;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    const activePlanId = user?.plan;
    container.querySelectorAll('.plan-card[data-plan-id]').forEach(function (card) {
      const planId = card.dataset.planId;
      const ctaSlot = card.querySelector('.plan-cta, .plan-cta-active');
      let badge = card.querySelector('.plan-badge-ativo');
      const isActive = planId === activePlanId;
      if (isActive) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'plan-badge plan-badge-ativo';
          badge.textContent = 'ATIVO';
          card.insertBefore(badge, card.firstChild);
        }
        badge.classList.remove('hidden');
        if (ctaSlot && ctaSlot.tagName === 'A') {
          if (!card.dataset.originalCta) card.dataset.originalCta = ctaSlot.outerHTML;
          ctaSlot.outerHTML = '<span class="plan-cta plan-cta-active">PLANO ATIVO</span>';
        }
      } else {
        if (badge) badge.classList.add('hidden');
        const activeSpan = card.querySelector('.plan-cta-active');
        const ctaLink = card.querySelector('a.plan-cta');
        const showUpgrade = activePlanId && isPlanUpgrade(planId, activePlanId);
        if (activeSpan) {
          if (!card.dataset.originalCta) return;
          const orig = card.dataset.originalCta;
          const wrap = document.createElement('div');
          if (showUpgrade) {
            const hrefMatch = orig.match(/href="([^"]+)"/);
            const href = hrefMatch ? hrefMatch[1] : '/checkout?plano=' + planId;
            wrap.innerHTML = '<a href="' + href + '" class="plan-cta">Fazer upgrade</a>';
          } else {
            wrap.innerHTML = orig;
          }
          activeSpan.replaceWith(wrap.firstChild);
        } else if (ctaLink) {
          if (!card.dataset.originalCta) card.dataset.originalCta = ctaLink.outerHTML;
          if (!card.dataset.originalCtaText) card.dataset.originalCtaText = ctaLink.textContent;
          ctaLink.textContent = showUpgrade ? 'Fazer upgrade' : card.dataset.originalCtaText;
        }
      }
    });
  } catch (_) {}
}

function updatePlansActiveSection() {
  const section = document.getElementById('plansActiveSection');
  const nameEl = document.getElementById('plansActiveName');
  const descEl = document.getElementById('plansActiveDesc');
  const creditsEl = document.getElementById('plansActiveCredits');
  if (!section || !nameEl) return;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    const planId = user?.plan;
    const plan = getPlanDisplay(planId);
    if (!plan) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    nameEl.textContent = plan.name;
    descEl.textContent = plan.description || (plan.credits + ' créditos/mês');
    creditsEl.textContent = String(user?.credits ?? 0);
  } catch {
    section?.classList.add('hidden');
  }
}

function closePlansModal() {
  const m = document.getElementById('plansModal');
  if (m) {
    m.classList.add('hidden');
    document.body.style.overflow = '';
    if (plansModalTimerInterval) {
      clearInterval(plansModalTimerInterval);
      plansModalTimerInterval = null;
    }
  }
}

function updateUserMenu() {
  const wrap = document.getElementById('userMenuWrap');
  const avatarImg = document.getElementById('userAvatarImg');
  const avatarInitial = document.getElementById('userAvatarInitial');
  const userBlock = document.getElementById('userMenuUser');
  const nameEl = document.getElementById('userMenuName');
  const emailEl = document.getElementById('userMenuEmail');
  const menuAvatar = document.getElementById('userMenuAvatar');
  const menuInitial = document.getElementById('userMenuInitial');
  const logoutBtn = document.getElementById('userMenuLogout');
  const loginLink = document.getElementById('userMenuLogin');
  if (!wrap || !userBlock) return;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    if (!user || !user.email) {
      wrap.classList.remove('has-avatar', 'has-initial');
      userBlock.classList.add('hidden');
      if (logoutBtn) logoutBtn.classList.add('hidden');
      if (loginLink) loginLink.classList.remove('hidden');
      return;
    }
    const name = user.name || user.email?.split('@')[0] || 'Usuário';
    const email = user.email || '';
    userBlock.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (loginLink) loginLink.classList.add('hidden');
    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
    if (user.picture) {
      if (avatarImg) { avatarImg.src = user.picture; avatarImg.alt = name; }
      if (menuAvatar) { menuAvatar.src = user.picture; menuAvatar.alt = name; }
      wrap.classList.add('has-avatar');
      wrap.classList.remove('has-initial');
      userBlock.classList.add('has-img');
      if (avatarInitial) avatarInitial.textContent = '';
      if (menuInitial) menuInitial.textContent = '';
    } else {
      const letter = (name.charAt(0) || '?').toUpperCase();
      if (avatarInitial) avatarInitial.textContent = letter;
      if (menuInitial) menuInitial.textContent = letter;
      wrap.classList.add('has-initial');
      wrap.classList.remove('has-avatar');
      userBlock.classList.remove('has-img');
      if (avatarImg) avatarImg.removeAttribute('src');
      if (menuAvatar) menuAvatar.removeAttribute('src');
    }
  } catch {
    wrap.classList.remove('has-avatar', 'has-initial');
    userBlock.classList.add('hidden');
  }
}

function openUserMenu() {
  const dropdown = document.getElementById('userMenuDropdown');
  const btn = document.getElementById('userMenuBtn');
  updateUserMenu();
  updateUserMenuPlan();
  if (dropdown) dropdown.classList.remove('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeUserMenu() {
  const dropdown = document.getElementById('userMenuDropdown');
  const btn = document.getElementById('userMenuBtn');
  if (dropdown) dropdown.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

document.getElementById('btnAddCredits')?.addEventListener('click', () => { openPlansModal(); });
document.getElementById('userMenuBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdown = document.getElementById('userMenuDropdown');
  if (dropdown?.classList.contains('hidden')) openUserMenu();
  else closeUserMenu();
});

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('userMenuWrap');
  const dropdown = document.getElementById('userMenuDropdown');
  if (wrap && dropdown && !dropdown.classList.contains('hidden') && !wrap.contains(e.target)) {
    closeUserMenu();
  }
});

document.querySelectorAll('.user-menu-close').forEach(a => {
  a.addEventListener('click', () => { closeUserMenu(); });
});

document.getElementById('userMenuPlans')?.addEventListener('click', () => {
  closeUserMenu();
  openPlansModal();
});

function logout() {
  localStorage.removeItem(AUTH_STORAGE);
  updateUserMenu();
  updateUserMenuPlan();
  window.location.href = '/';
}

document.getElementById('userMenuLogout')?.addEventListener('click', () => {
  logout();
  closeUserMenu();
});

document.getElementById('userMenuSupport')?.addEventListener('click', () => {
  closeUserMenu();
  openSupportModal();
});

// Modal Suporte
function openSupportModal() {
  const m = document.getElementById('supportModal');
  if (!m) return;
  try {
    const user = JSON.parse(localStorage.getItem(AUTH_STORAGE) || '{}');
    const emailEl = document.getElementById('supportEmail');
    const nameEl = document.getElementById('supportName');
    if (emailEl && user?.email) emailEl.value = user.email;
    if (nameEl && user?.name) nameEl.value = user.name;
  } catch (_) {}
  m.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSupportModal() {
  const m = document.getElementById('supportModal');
  if (m) m.classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('supportModalClose')?.addEventListener('click', closeSupportModal);
document.querySelector('.support-modal-backdrop')?.addEventListener('click', closeSupportModal);

document.getElementById('supportForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('supportName')?.value || '';
  const email = document.getElementById('supportEmail')?.value || '';
  const msg = document.getElementById('supportMessage')?.value || '';
  const subject = encodeURIComponent('Suporte VARVOS');
  const body = encodeURIComponent(`Nome: ${name}\nE-mail: ${email}\n\nMensagem:\n${msg}`);
  window.location.href = `mailto:contato@varvos.com?subject=${subject}&body=${body}`;
  closeSupportModal();
});

// Plans modal: tabs e fechar
document.querySelectorAll('.plans-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const t = tab.dataset.tab;
    document.querySelectorAll('.plans-tab').forEach(x => x.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('plansAvulsos')?.classList.toggle('hidden', t !== 'avulsos');
    document.getElementById('plansMensais')?.classList.toggle('hidden', t !== 'mensais');
    const note = document.getElementById('plansModalCreditNote');
    if (note) note.classList.toggle('hidden', t !== 'avulsos');
    if (t === 'mensais') updatePlanCardsActiveState();
  });
});

document.getElementById('plansModalClose')?.addEventListener('click', closePlansModal);
document.querySelector('.plans-modal-backdrop')?.addEventListener('click', closePlansModal);

// Sync varvos_user a partir da sessão Supabase (ex.: logou por e-mail e varvos_user está incompleto)
async function syncUserFromSupabaseSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    let user = raw ? JSON.parse(raw) : null;
    if (user && user.id) return;
    const sb = window.varvosSupabase;
    if (!sb?.auth?.getSession) return;
    const { data } = await sb.auth.getSession();
    const authUser = data?.session?.user;
    if (!authUser) return;
    const sync = window.varvosAuthSupabase?.syncUserFromEmail;
    const merged = sync ? (await sync(authUser)) : { provider: 'email', email: authUser.email, id: authUser.id };
    const final = merged || { provider: 'email', email: authUser.email, id: authUser.id };
    localStorage.setItem(AUTH_STORAGE, JSON.stringify(final));
    updateCreditsDisplay();
    updateUserMenu();
  } catch (_) {}
}
syncUserFromSupabaseSession();

// Init créditos e menu do usuário
updateCreditsDisplay();
updateUserMenu();
updateUserMenuPlan();

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
  document.getElementById('videoFields')?.classList.toggle('hidden', currentMode !== 'video');
  document.getElementById('imageFields')?.classList.toggle('hidden', currentMode !== 'image');
  document.getElementById('motionFields')?.classList.toggle('hidden', currentMode !== 'motion');
  const configMain = document.getElementById('configMainOptions');
  if (configMain) configMain.classList.toggle('hidden', currentMode !== 'video');
  const configRef = document.getElementById('configRefWrap');
  if (configRef) configRef.classList.toggle('hidden', currentMode !== 'video');
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
      const motionMinRate = getCreditsPerSecondMotion(document.getElementById('motionResolution')?.value || '720p');
      if (cost <= motionMinRate && !motionRefVideoUrl) {
        cost = '—';
        hasValue = false;
      }
  } else if (currentMode === 'video') {
    const model = document.getElementById('videoModel')?.value || 'veo3.1-fast';
    if (model === 'grok-imagine/image-to-video') {
      const duration = document.getElementById('grokDuration')?.value || '6';
      const resolution = document.getElementById('grokResolution')?.value || '480p';
      cost = getCreditsCostForBody({ model, input: { duration, resolution } });
    } else {
      const resolution = document.getElementById('veoResolution')?.value || '720p';
      cost = getCreditsCostForBody({ model, input: { resolution } });
    }
  } else if (currentMode === 'image') {
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

// Impedir navegação quando há vídeo/imagem sendo gerado — manter quadro de progresso visível
document.querySelectorAll('.mode-segmented').forEach(seg => {
  seg.addEventListener('click', (e) => {
    const link = e.target?.closest?.('a.mode-seg-item');
    if (!link || !link.href || activeTasks.size === 0) return;
    const targetPath = new URL(link.href, window.location.origin).pathname;
    const currentPath = (window.location.pathname || '/').replace(/\/$/, '') || '/';
    const targetNorm = (targetPath || '/').replace(/\/$/, '') || '/';
    const wouldLeave = targetNorm !== currentPath;
    if (!wouldLeave) return;
    e.preventDefault();
    const n = activeTasks.size;
    const msg = n === 1 ? 'Seu vídeo está sendo gerado. Acompanhe o progresso abaixo.' : `${n} vídeos estão sendo gerados. Acompanhe o progresso abaixo.`;
    const toast = document.createElement('div');
    toast.className = 'generation-toast';
    toast.textContent = msg;
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
    document.getElementById('currentResultSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
    const { data } = await sb.from('user_creations').select('task_id, prompt, mode, files, created_at, aspect_ratio').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    const fromSupabase = (data || []).map(row => ({
      id: row.task_id + '-' + (row.created_at ? new Date(row.created_at).getTime() : Date.now()),
      task_id: row.task_id,
      created_time: row.created_at,
      prompt: row.prompt || '',
      mode: row.mode || 'video',
      files: row.files || [],
      aspect_ratio: row.aspect_ratio || '9:16'
    }));
    const supabaseTaskIds = new Set(fromSupabase.map(i => i.task_id));
    let localOnly = [];
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : [];
        localOnly = items.filter(i => i.task_id && !supabaseTaskIds.has(i.task_id) && i.files?.length);
        for (const entry of localOnly) {
          try {
            await sb.from('user_creations').insert({
              user_id: userId,
              task_id: entry.task_id,
              prompt: entry.prompt || '',
              mode: entry.mode || 'video',
              files: entry.files || [],
              aspect_ratio: entry.aspect_ratio || '9:16'
            });
            supabaseTaskIds.add(entry.task_id);
          } catch (_) {}
        }
      }
    } catch (_) {}
    const recovered = localOnly.filter(i => supabaseTaskIds.has(i.task_id));
    historyCache = [...recovered, ...fromSupabase]
      .filter((v, i, a) => a.findIndex(x => x.task_id === v.task_id) === i)
      .sort((a, b) => (new Date(b.created_time || 0)) - (new Date(a.created_time || 0)))
      .slice(0, 50);
    saveHistory(historyCache);
    renderHistory();
  } catch (e) {
    console.warn('loadHistoryFromSupabase:', e);
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      historyCache = raw ? JSON.parse(raw) : [];
    } catch (_) { historyCache = []; }
    renderHistory();
  }
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
  } catch (e) {
    console.warn('addToHistorySupabase:', e);
    const toast = document.createElement('div');
    toast.className = 'generation-toast';
    toast.textContent = 'Vídeo salvo localmente. Baixe agora para não perder — não foi possível sincronizar com sua conta.';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }
}

async function addToHistory(data, prompt, aspectRatio) {
  if (data.status !== 'finished' || !data.files?.length) return;
  const tid = data.task_id;
  if (historyCache.some(e => e.task_id === tid)) return;
  const ar = aspectRatio || document.getElementById('aspectRatio')?.value || '9:16';
  const entry = {
    id: tid + '-' + Date.now(),
    task_id: tid,
    created_time: data.created_time || new Date().toISOString(),
    prompt: prompt || '',
    mode: data.files[0].file_type === 'video' ? 'video' : 'image',
    files: data.files,
    aspect_ratio: ar
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
  document.querySelector('.history-download-hint')?.classList.toggle('hidden', !items.length);

  if (!items.length) {
    historyVerMaisWrap?.classList.add('hidden');
    return;
  }

  const limit = historyShowingAll ? items.length : 4;
  const toShow = items.slice(0, limit);
  const hasMore = items.length > 4;

  historyVerMaisWrap?.classList.toggle('hidden', !hasMore);
  if (btnVerMais) {
    btnVerMais.textContent = historyShowingAll ? 'Ver menos' : 'Ver mais';
  }

  historyList.innerHTML = toShow.map(item => {
    const mainFile = item.files[0];
    const thumb = mainFile.file_type === 'image'
      ? `<img src="${mainFile.file_url}" alt="" loading="lazy">`
      : `<video data-src="${mainFile.file_url}" muted loop playsinline preload="none"></video>`;
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
          <div class="meta">${item.mode === 'video' ? '🎬 Vídeo' : '🖼️ Imagem'}${date ? ' · ' + date : ''}</div>
        </div>
        <div class="creation-actions">${downloads}${shareLinks}</div>
      </div>
    `;
  }).join('');
  setupHistoryVideoLazyLoad();
}

function setupHistoryVideoLazyLoad() {
  const videos = historyList?.querySelectorAll('.creation-thumb video[data-src]');
  if (!videos?.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const v = entry.target;
      if (!entry.isIntersecting) {
        v.pause();
        return;
      }
      if (!v.src && v.dataset.src) {
        v.src = v.dataset.src;
      }
      v.play().catch(() => {});
    });
  }, { rootMargin: '50px', threshold: 0.1 });
  videos.forEach((v) => io.observe(v));
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

// File upload - Vidgo Base64 API (imagem e vídeo; retorna URL pública da API)
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

// Upload para Imitar Movimento: valida formato (KIE exige JPEG/PNG, MP4/MOV) e envia para Vidgo
async function uploadMotionFileToVidgo(file, bucket) {
  validateMotionFileType(file, bucket);
  return uploadFileToVidgo(file);
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
  if (btn && currentMode === 'video') {
    const model = document.getElementById('videoModel')?.value || 'veo3.1-fast';
    const grokNeedsImage = model === 'grok-imagine/image-to-video' && !refImageUrl;
    btn.disabled = refImageUploading || grokNeedsImage;
  }
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
setupFileUpload({
  inputId: 'imageRef2File',
  areaId: 'imageRef2Area',
  previewId: 'imageRef2Preview',
  imgId: 'imageRef2PreviewImg',
  removeId: 'imageRef2Remove',
  setUrl: (v) => { refImageUrl2 = v; updateRefImageReadyState(); },
  onUploadStart: () => { refImageUploading = true; updateRefImageReadyState(); },
  onUploadEnd: () => { refImageUploading = false; updateRefImageReadyState(); },
  progressElId: 'imageRef2Progress'
});
setupFileUpload({
  inputId: 'imageRef3File',
  areaId: 'imageRef3Area',
  previewId: 'imageRef3Preview',
  imgId: 'imageRef3PreviewImg',
  removeId: 'imageRef3Remove',
  setUrl: (v) => { refImageUrl3 = v; updateRefImageReadyState(); },
  onUploadStart: () => { refImageUploading = true; updateRefImageReadyState(); },
  onUploadEnd: () => { refImageUploading = false; updateRefImageReadyState(); },
  progressElId: 'imageRef3Progress'
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
setupFileUpload({ inputId: 'motionCharImageFile', areaId: 'motionCharImageArea', previewId: 'motionCharImagePreview', imgId: 'motionCharImagePreviewImg', removeId: 'motionCharImageRemove', setUrl: (v) => motionCharImageUrl = v, onReady: updateMotionReadyState, uploadFn: (f) => uploadMotionFileToVidgo(f, 'images'), uploadStatusLabel: 'image', setUploadStatus: updateMotionReadyState, progressElId: 'motionCharImageProgress', hideProgressUI: true });

const MOTION_REF_MAX_DURATION_SECONDS = 30;

function setupVideoUpload(config) {
  const { inputId, areaId, previewId, videoId, removeId, setUrl, maxMb = 50, maxDurationSeconds, onReady, uploadFn, onRemove, uploadStatusLabel, setUploadStatus, progressElId } = config;
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
    if (maxDurationSeconds && maxDurationSeconds > 0) {
      try {
        await new Promise((resolve, reject) => {
          const onLoaded = () => {
            previewVideo.removeEventListener('loadedmetadata', onLoaded);
            previewVideo.removeEventListener('error', onErr);
            const d = previewVideo.duration;
            if (typeof d === 'number' && !isNaN(d) && d > maxDurationSeconds) {
              reject(new Error(`Vídeo muito longo. O limite é ${maxDurationSeconds} segundos. Seu vídeo tem ${Math.ceil(d)}s. Use um trecho menor.`));
            } else {
              resolve();
            }
          };
          const onErr = () => {
            previewVideo.removeEventListener('loadedmetadata', onLoaded);
            previewVideo.removeEventListener('error', onErr);
            resolve();
          };
          if (previewVideo.readyState >= 1) onLoaded();
          else {
            previewVideo.addEventListener('loadedmetadata', onLoaded, { once: true });
            previewVideo.addEventListener('error', onErr, { once: true });
          }
        });
      } catch (err) {
        cancelProgress();
        preview.classList.add('hidden');
        area.classList.remove('hidden');
        previewVideo.src = '';
        setProgress(false);
        if (setUploadStatus) setUploadStatus({ error: err.message });
        else alert(err.message);
        return;
      }
    }
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

setupVideoUpload({ inputId: 'motionRefVideoFile', areaId: 'motionRefVideoArea', previewId: 'motionRefVideoPreview', videoId: 'motionRefVideoPreviewVid', removeId: 'motionRefVideoRemove', setUrl: (v) => motionRefVideoUrl = v, maxMb: 100, maxDurationSeconds: MOTION_REF_MAX_DURATION_SECONDS, onReady: updateMotionReadyState, uploadFn: (f) => uploadMotionFileToVidgo(f, 'videos'), uploadStatusLabel: 'video', setUploadStatus: updateMotionReadyState, progressElId: 'motionRefVideoProgress' });

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
    const motionMinRate = getCreditsPerSecondMotion(document.getElementById('motionResolution')?.value || '720p');
    if (cost <= motionMinRate && !motionRefVideoUrl) {
      cost = '—';
      hasValue = false;
    }
  } else if (currentMode === 'video') {
    const model = document.getElementById('videoModel')?.value || 'veo3.1-fast';
    if (model === 'grok-imagine/image-to-video') {
      const duration = document.getElementById('grokDuration')?.value || '6';
      const resolution = document.getElementById('grokResolution')?.value || '480p';
      cost = getCreditsCostForBody({ model, input: { duration, resolution } });
    } else {
      const resolution = document.getElementById('veoResolution')?.value || '720p';
      cost = getCreditsCostForBody({ model, input: { resolution } });
    }
  } else if (currentMode === 'image') {
    cost = CREDITS_COST_VIDEO;
  }
  btnText.textContent = hasValue ? `${labels[currentMode] || 'Gerar'} · ${cost} créditos` : labels[currentMode] || 'Gerar';
}
document.getElementById('motionRefVideoPreviewVid')?.addEventListener('loadedmetadata', updateMotionButtonCredits);

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
    const model = getEffectiveModel();
    const prompt = document.getElementById('prompt').value.trim();

    if (model === 'veo3.1-fast') {
      const aspectRatio = document.getElementById('aspectRatio').value;
      const resolution = document.getElementById('veoResolution')?.value || '720p';
      // Regra: vídeo sempre em português; sem legendas/texto na tela (Veo gera incorretamente)
      const promptPt = prompt + ' [IMPORTANTE: Todo o áudio e diálogos em português brasileiro. Não incluir legendas, texto, subtítulos ou captions na tela.]';
      const input = {
        prompt: promptPt,
        duration: 8,
        aspect_ratio: aspectRatio === '1:1' ? '9:16' : aspectRatio,
        resolution
      };
      const imageUrls = [refImageUrl, refImageUrl2, refImageUrl3].filter(Boolean);
      if (imageUrls.length > 0) {
        input.image_urls = imageUrls;
        // Doc: 2 imagens = frame (início→fim), 3 imagens = reference
        if (imageUrls.length === 2) {
          input.generation_type = 'frame';
          input.generate_type = 'frame';
        } else {
          input.generation_type = 'reference';
          input.generate_type = 'reference';
        }
      }
      return { model: 'veo3.1-fast', input };
    }

    if (model === 'grok-imagine/image-to-video') {
      const duration = document.getElementById('grokDuration')?.value || '6';
      const resolution = document.getElementById('grokResolution')?.value || '480p';
      const mode = document.getElementById('grokMode')?.value || 'normal';
      const input = {
        image_urls: refImageUrl ? [refImageUrl] : [],
        prompt: prompt || '',
        mode,
        duration,
        resolution
      };
      return { model: 'grok-imagine/image-to-video', input };
    }

    const duration = parseInt(document.getElementById('duration').value, 10);
    const aspectRatio = document.getElementById('aspectRatio').value;
    const style = document.getElementById('style')?.value;
    /* Sora 2 gera nativamente em 720p */
    const resolution = '720p';

    const promptPt = prompt + ' [IMPORTANTE: Áudio e diálogos em português brasileiro.]';
    const input = { prompt: promptPt, duration, aspect_ratio: aspectRatio, resolution };
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
  const isGrokImageToVideo = body?.model === 'grok-imagine/image-to-video';
  let apiKey = null;
  if (!isMotion && !isGrokImageToVideo) {
    apiKey = getApiKey();
    if (!apiKey) {
      alert('Configure sua chave API em config.js para começar.');
      return null;
    }
  }

  if (isMotion || isGrokImageToVideo) {
    const res = await fetch('/api/kie/create-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

async function getTaskStatus(taskId, isMotion = false, isGrokImageToVideo = false) {
  if (isMotion || isGrokImageToVideo) {
    const res = await fetch(`/api/kie/record-info?taskId=${encodeURIComponent(taskId)}`);
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

function startLoadingForCard(cardRefs, mode, opts = {}) {
  if (!cardRefs?.loadingPlaceholder) return;
  const mediaContainer = cardRefs.loadingPlaceholder.closest('.media-container');
  if (mediaContainer) mediaContainer.classList.add('is-loading');
  cardRefs.loadingPlaceholder.classList.remove('hidden');
  const imgUrl = opts.refImageUrl ?? (mode === 'motion' ? motionCharImageUrl : [refImageUrl, refImageUrl2, refImageUrl3].find(Boolean) || refImageUrl);
  const prompt = opts.prompt || lastPrompt || '';
  const bg = cardRefs.loadingPlaceholderBg;
  if (bg) {
    if (imgUrl) {
      bg.style.backgroundImage = `url(${imgUrl})`;
      bg.classList.add('has-image');
    } else {
      bg.style.backgroundImage = '';
      bg.classList.remove('has-image');
    }
  }
  const promptWrap = cardRefs.loadingPromptWrap;
  const promptText = cardRefs.loadingPromptText;
  if (promptWrap) {
    promptWrap.classList.toggle('hidden', !prompt);
    if (promptText) promptText.textContent = prompt;
    const content = promptWrap?.querySelector('.loading-prompt-content');
    if (content) content.classList.add('collapsed');
    const toggle = promptWrap?.querySelector('.loading-prompt-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  if (cardRefs.loadingProgressPct) cardRefs.loadingProgressPct.textContent = '0%';
  if (cardRefs.loadingProgressFill) cardRefs.loadingProgressFill.style.width = '0%';
  const phrases = LOADING_PHRASES[mode] || LOADING_PHRASES.video;
  let idx = 0;
  if (cardRefs.loadingTextEl) cardRefs.loadingTextEl.textContent = phrases[0];
  const tid = setInterval(() => {
    idx = (idx + 1) % phrases.length;
    if (cardRefs.loadingTextEl) cardRefs.loadingTextEl.textContent = phrases[idx];
  }, 5000);
  loadingIntervals.set(cardRefs.card, tid);
}

function stopLoadingForCard(cardRefs, opts = {}) {
  if (cardRefs?.loadingPlaceholder) {
    const mediaContainer = cardRefs.loadingPlaceholder.closest('.media-container');
    if (mediaContainer) {
      mediaContainer.classList.remove('is-loading');
      if (opts.keepCompact) mediaContainer.classList.add('keep-compact');
      else mediaContainer.classList.remove('keep-compact');
    }
    cardRefs.loadingPlaceholder.classList.add('hidden');
  }
  const tid = cardRefs?.card && loadingIntervals.get(cardRefs.card);
  if (tid) {
    clearInterval(tid);
    loadingIntervals.delete(cardRefs.card);
  }
}

async function userHasPurchased() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    const sb = window.varvosSupabase;
    if (!user || !sb) return false;
    let userId = user.id;
    if (!userId && (user.email || '').trim()) {
      const email = String(user.email).trim().toLowerCase();
      const { data: u } = await sb.from('users').select('id').eq('email', email).single();
      userId = u?.id;
    }
    if (!userId) return false;
    const { data } = await sb.from('payments').select('id').eq('user_id', userId).eq('status', 'completed').limit(1);
    return !!(data && data.length > 0);
  } catch (_) { return false; }
}

function openCreditsModal(opts = {}) {
  // Nunca esconder o quadro de resultados — manter sempre visível até terminar ou timeout 15 min
  if (creditsModal) {
    const titleEl = document.getElementById('creditsModalTitle');
    const descEl = document.getElementById('creditsModalDesc');
    const balanceEl = document.getElementById('creditsModalBalance');
    const missingEl = document.getElementById('creditsModalMissing');
    const noExpireEl = document.getElementById('creditsModalNoExpire');
    const btnEl = document.getElementById('creditsModalPlans');

    const showEl = (el, text, visible = true) => {
      if (!el) return;
      el.textContent = text || '';
      el.classList.toggle('hidden', !visible || !text);
    };

    if (opts.needsLogin && titleEl && descEl && btnEl) {
      creditsModal.setAttribute('data-credits-reason', 'login');
      titleEl.textContent = 'Entre para continuar';
      const cost = opts.cost != null ? opts.cost : null;
      descEl.textContent = cost != null
        ? `Para criar esse vídeo você precisa de ${cost} créditos. Faça login ou cadastre-se para continuar.`
        : 'Faça login ou cadastre-se para acessar seus créditos e começar a criar vídeos com IA.';
      if (balanceEl) balanceEl.classList.add('hidden');
      if (missingEl) missingEl.classList.add('hidden');
      if (noExpireEl) noExpireEl.classList.add('hidden');
      const triggerElLogin = document.getElementById('creditsModalTrigger');
      if (triggerElLogin) triggerElLogin.classList.add('hidden');
      const offerEl = document.getElementById('creditsModalOffer');
      if (offerEl) offerEl.classList.add('hidden');
      btnEl.textContent = 'Entrar ou cadastrar';
    } else if (titleEl && descEl && btnEl) {
      creditsModal.setAttribute('data-credits-reason', 'buy');
      const cost = opts.cost != null ? opts.cost : 0;
      const credits = opts.credits != null ? opts.credits : getCredits();
      const bal = credits != null ? credits : 0;
      const missing = Math.max(0, cost - bal);
      const duration = opts.duration;
      const creditsPerSec = opts.creditsPerSecond;
      const mode = opts.mode || currentMode;

      titleEl.textContent = 'Adicione créditos para gerar seu vídeo';

      descEl.textContent = 'Seu vídeo está pronto para gerar.';
      showEl(balanceEl, `Saldo atual: ${bal} créditos`, cost > 0);

      const missingNumEl = document.getElementById('creditsModalMissingNum');
      if (missingEl) missingEl.classList.toggle('hidden', !(cost > 0 && missing > 0));
      if (missingNumEl) missingNumEl.textContent = String(missing);
      if (noExpireEl) noExpireEl.classList.remove('hidden');
      const triggerEl = document.getElementById('creditsModalTrigger');
      if (triggerEl) triggerEl.classList.remove('hidden');
      const offerEl = document.getElementById('creditsModalOffer');
      if (offerEl) {
        offerEl.classList.add('hidden');
        userHasPurchased().then((hasPurchased) => {
          if (!hasPurchased) offerEl.classList.remove('hidden');
        });
      }
    }
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

const MSG_SERVER_ALTA_DEMANDA = 'O servidor está com alta demanda no momento. Tente novamente em alguns minutos.';

/** Traduz mensagens de erro da API para português. Retorna a mensagem original se já estiver em PT ou não houver mapeamento. */
function translateApiError(msg, model) {
  if (!msg || typeof msg !== 'string') return '';
  const s = msg.trim().toLowerCase();
  // Sora 2: erros de lentidão/servidor usam o aviso padrão
  if (model === 'sora-2' && /timeout|timed out|tempo esgotado|internal server error|500|erro interno|rate limit|too many requests|busy|overload|high load|server.*error/i.test(msg)) {
    return MSG_SERVER_ALTA_DEMANDA;
  }
  const map = [
    [/server exception|erro do servidor/i, 'Muitos vídeos estão sendo gerados no momento. Você pode tentar mais tarde ou tentar gerar em outro modelo de IA.'],
    [/inappropriate content|conteúdo inadequado|content.*not allowed/i, 'Conteúdo inadequado. Esse tipo de conteúdo não é permitido. Tente outro prompt.'],
    [/insufficient.*balance|saldo insuficiente/i, 'Créditos insuficientes. Adicione créditos para tentar novamente.'],
    [/rate limit|too many requests|muitas requisições/i, 'Muitas requisições. Aguarde um momento e tente novamente.'],
    [/invalid request|invalid parameter|parâmetro inválido/i, 'Requisição inválida. Verifique os dados e tente novamente.'],
    [/authentication failed|401|unauthorized/i, 'Falha na autenticação. Verifique sua conexão.'],
    [/internal server error|500|erro interno/i, 'Erro interno do servidor. Tente novamente em alguns minutos.'],
    [/timeout|timed out|tempo esgotado/i, 'O processamento demorou muito. Tente novamente.'],
    [/failed to fetch|network error|connection refused/i, 'Erro de conexão. Verifique sua internet e tente novamente.'],
    [/content policy|safety|blocked|bloqueado/i, 'O conteúdo foi bloqueado pelas políticas de segurança.'],
    [/invalid image|image.*not supported/i, 'Imagem inválida ou não suportada. Use PNG, JPG ou WEBP.'],
    [/task failed|generation failed|geração falhou/i, 'A geração falhou. Tente novamente.'],
    [/task not found|tarefa não encontrada|task.*not found/i, 'Tarefa não encontrada. A geração pode ter expirado ou a conexão foi interrompida. Tente gerar novamente.'],
  ];
  for (const [pattern, translated] of map) {
    if (pattern.test(msg)) return translated;
  }
  return msg;
}

function showGenerationErrorWithRetry(cardRefs, displayMsg, body) {
  if (!cardRefs?.statusMessage) return;
  cardRefs.statusMessage.textContent = displayMsg;
  cardRefs.statusMessage.className = 'status-message error';
  cardRefs.statusMessage.classList.remove('hidden');
  cardRefs.card.querySelector('.status-retry-wrap')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'status-retry-wrap';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-retry-generation';
  btn.textContent = 'Gerar novamente';
  wrap.appendChild(btn);
  cardRefs.statusMessage.insertAdjacentElement('afterend', wrap);
  try {
    cardRefs.card.dataset.retryBody = JSON.stringify(body);
  } catch (_) {
    cardRefs.card.removeAttribute('data-retry-body');
  }
}

function updateOutputUI(data, cardRefs, startTime) {
  if (!cardRefs) return;
  const { taskStatusEl, taskProgressEl, progressFill, loadingPlaceholder, loadingTextEl, loadingProgressPct, loadingProgressFill, videoPlayer, imageGallery, creationDisclaimer, statusMessage, downloadWarning, downloadBtn, resultPromptEl } = cardRefs;
  const status = data.status || '';
  if (taskStatusEl) {
    taskStatusEl.textContent = STATUS_PT[status] || status;
    taskStatusEl.className = 'status-badge ' + status;
  }
  const apiProgress = data.progress || 0;
  if (taskProgressEl) taskProgressEl.textContent = apiProgress + '%';
  if (progressFill) progressFill.style.width = apiProgress + '%';
  if (loadingProgressPct) loadingProgressPct.textContent = apiProgress + '%';
  if (loadingProgressFill) loadingProgressFill.style.width = apiProgress + '%';
  if (apiProgress >= 95 && loadingTextEl) {
    loadingTextEl.textContent = 'Preparando seu download…';
    const tid = cardRefs.card && loadingIntervals.get(cardRefs.card);
    if (tid) { clearInterval(tid); loadingIntervals.delete(cardRefs.card); }
  }

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
    if (resultPromptEl) {
      const textEl = resultPromptEl.querySelector('.result-prompt-text');
      const contentEl = resultPromptEl.querySelector('.result-prompt-content');
      const toggleBtn = resultPromptEl.querySelector('.result-prompt-toggle');
      if (textEl) textEl.textContent = prompt || '';
      if (contentEl) contentEl.classList.add('collapsed');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      resultPromptEl.classList.toggle('hidden', !prompt);
    }
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
        downloadBtn.classList.remove('hidden');
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
        downloadBtn.classList.remove('hidden');
        if (cardRefs.shareSection) cardRefs.shareSection.classList.remove('hidden');
      }
      if (downloadWarning) downloadWarning.classList.remove('hidden');
    }
    } else if (data.status === 'failed') {
    const taskMeta = activeTasks.get(data.task_id);
    const model = taskMeta?.model;
    activeTasks.delete(data.task_id);
    const errMsg = (data.error_message || '').toString().trim();
    if (isCreditsError(errMsg)) {
      stopLoadingForCard(cardRefs, { keepCompact: true });
      if (statusMessage) {
        statusMessage.textContent = 'Créditos insuficientes. Adicione créditos para tentar novamente.';
        statusMessage.className = 'status-message error';
      }
      try {
        const body = buildRequestBody();
        const cost = getCreditsCostForBody(body);
        const credits = getCredits();
        const isMotion = body?.model === 'kling-2.6/motion-control';
        const duration = isMotion ? getMotionRefVideoDuration() : (body?.input?.duration ?? 8);
        const resolution = body?.input?.mode || document.getElementById('motionResolution')?.value || '720p';
        const creditsPerSecond = isMotion ? getCreditsPerSecondMotion(resolution) : null;
        openCreditsModal({ needsLogin: false, cost, credits, duration, creditsPerSecond, mode: currentMode, keepResultsVisible: true });
      } catch (_) {
        openCreditsModal({ needsLogin: false, cost: null, credits: getCredits(), keepResultsVisible: true });
      }
      return;
    }
    stopLoadingForCard(cardRefs, { keepCompact: true });
    if (statusMessage) {
      statusMessage.textContent = (errMsg ? translateApiError(errMsg, model) : '') || MSG_SERVER_ALTA_DEMANDA;
      statusMessage.className = 'status-message error';
      statusMessage.classList.remove('hidden');
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

function getCurrentUserEmail() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    return (user && user.email) ? String(user.email).trim().toLowerCase() : null;
  } catch { return null; }
}

function getCurrentUserEmail() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    return (user && user.email) ? String(user.email).trim().toLowerCase() : null;
  } catch { return null; }
}

function getCurrentUserEmail() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    const email = (user && user.email) ? String(user.email).trim().toLowerCase() : '';
    return email || null;
  } catch { return null; }
}

function isLoggedIn() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    return !!(user && (user.email || user.id || user.sub));
  } catch { return false; }
}

async function saveActiveTask(taskId, startTime, prompt, cost, model) {
  const payload = {
    taskId,
    startTime: startTime || Date.now(),
    mode: currentMode,
    model: model || (currentMode === 'motion' ? 'kling-2.6/motion-control' : 'veo3.1-fast'),
    prompt: prompt || '',
    cost: cost
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
    try { localStorage.setItem(ACTIVE_TASK_STORAGE, JSON.stringify({ tasks })); } catch (_) {}
  } catch (e) {}
  const userId = getCurrentUserId();
  const sb = window.varvosSupabase;
  if (userId && sb) {
    try {
      await sb.from('user_active_task_items').upsert({
        user_id: userId,
        task_id: taskId,
        mode: currentMode,
        model: payload.model || null,
        prompt: prompt || '',
        cost: cost != null ? cost : null,
        started_at: new Date(payload.startTime).toISOString()
      }, { onConflict: 'user_id,task_id' });
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
        if (filtered.length === 0) {
          sessionStorage.removeItem(ACTIVE_TASK_STORAGE);
          try { localStorage.removeItem(ACTIVE_TASK_STORAGE); } catch (_) {}
        } else {
          sessionStorage.setItem(ACTIVE_TASK_STORAGE, JSON.stringify({ tasks: filtered }));
          try { localStorage.setItem(ACTIVE_TASK_STORAGE, JSON.stringify({ tasks: filtered })); } catch (_) {}
        }
      }
    } else {
      sessionStorage.removeItem(ACTIVE_TASK_STORAGE);
      try { localStorage.removeItem(ACTIVE_TASK_STORAGE); } catch (_) {}
    }
  } catch (e) {}
  const userId = getCurrentUserId();
  const sb = window.varvosSupabase;
  if (userId && sb) {
    try {
      let q = sb.from('user_active_task_items').delete().eq('user_id', userId);
      if (onlyIfTaskId) q = q.eq('task_id', onlyIfTaskId);
      await q;
    } catch (e) { console.warn('clearActiveTask Supabase:', e); }
  }
}

async function getStoredActiveTasks() {
  const userId = getCurrentUserId();
  const sb = window.varvosSupabase;
  const byId = new Map();

  // 1. Buscar do Supabase (se logado)
  if (userId && sb) {
    try {
      const { data } = await sb.from('user_active_task_items')
        .select('task_id, started_at, mode, model, prompt, cost')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(5);
      if (data && data.length > 0) {
        for (const row of data) {
          byId.set(row.task_id, {
            taskId: row.task_id,
            startTime: row.started_at ? new Date(row.started_at).getTime() : Date.now(),
            mode: row.mode || 'video',
            model: row.model,
            prompt: row.prompt || '',
            cost: row.cost != null ? row.cost : undefined
          });
        }
      }
    } catch (e) { console.warn('getStoredActiveTasks Supabase:', e); }
  }

  // 2. Mesclar sessionStorage + localStorage — nunca perder tarefa salva localmente
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const stored = storage.getItem(ACTIVE_TASK_STORAGE);
      if (stored) {
        const d = JSON.parse(stored);
        const tasks = Array.isArray(d.tasks) ? d.tasks : (d.taskId ? [{ taskId: d.taskId, startTime: d.startTime || Date.now(), mode: d.mode || 'video', prompt: d.prompt || '', cost: d.cost }] : []);
        for (const t of tasks) {
          const entry = { taskId: t.taskId, startTime: t.startTime || Date.now(), mode: t.mode || 'video', model: t.model, prompt: t.prompt || '', cost: t.cost != null ? t.cost : undefined };
          const existing = byId.get(t.taskId);
          if (!existing || entry.startTime > existing.startTime) byId.set(t.taskId, entry);
        }
      }
    } catch (e) {}
  }

  const list = Array.from(byId.values()).sort((a, b) => (b.startTime || 0) - (a.startTime || 0)).slice(0, 5);
  return list;
}

async function pollUntilComplete(taskId, cardRefs, startTime, isMotion = false, isGrokImageToVideo = false) {
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const data = await getTaskStatus(taskId, isMotion, isGrokImageToVideo);
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

        const elapsed = Date.now() - (startTime || Date.now());
        if (elapsed >= POLL_TIMEOUT_MS) {
          if (currentTaskId === taskId) currentTaskId = null;
          await clearActiveTask(taskId);
          if (btnVerify) btnVerify.classList.add('hidden');
          const err = new Error('O processamento demorou mais de 15 minutos e foi cancelado.');
          err.isTimeout = true;
          reject(err);
          return;
        }

        const tid = setTimeout(check, POLL_INTERVAL);
        pollTimeouts.set(taskId, tid);
      } catch (err) {
        if (currentTaskId === taskId) currentTaskId = null;
        clearActiveTask(taskId).catch(() => {});
        if (btnVerify) btnVerify.classList.add('hidden');
        const taskMeta = activeTasks.get(taskId);
        const model = taskMeta?.model;
        // Mostrar erro imediatamente — mensagem real da API traduzida quando disponível
        stopLoadingForCard(cardRefs, { keepCompact: true });
        if (cardRefs?.statusMessage) {
          const msg = err.isTimeout
            ? 'O processamento demorou mais de 15 minutos e foi cancelado.'
            : (err.message ? translateApiError(err.message, model) : '') || MSG_SERVER_ALTA_DEMANDA;
          cardRefs.statusMessage.textContent = msg;
          cardRefs.statusMessage.className = 'status-message error';
          cardRefs.statusMessage.classList.remove('hidden');
        }
        if (cardRefs?.taskStatusEl) {
          cardRefs.taskStatusEl.textContent = 'Falhou';
          cardRefs.taskStatusEl.className = 'status-badge failed';
        }
        reject(err);
      }
    };
    check();
  });
}

const MAX_CONCURRENT_CARDS = 3;

function getAvailableCardIndex() {
  for (let i = 0; i < MAX_CONCURRENT_CARDS; i++) {
    if (reservedCardIndices.has(i)) continue;
    const card = outputResultsList?.querySelector(`.output-result-card[data-card="${i}"]`);
    if (!card) continue;
    const inUse = Array.from(activeTasks.values()).some(m => m.cardRefs?.card === card);
    if (!inUse) return i;
  }
  return -1;
}

function getMotionRefVideoDuration() {
  const vid = document.getElementById('motionRefVideoPreviewVid');
  if (!vid || !vid.src) return 0;
  const d = vid.duration;
  return (typeof d === 'number' && !isNaN(d) && d > 0) ? d : 0;
}

function getCreditsPerSecondMotion(resolution) {
  return (resolution === '1080p') ? CREDITS_PER_SECOND_MOTION_1080 : CREDITS_PER_SECOND_MOTION_720;
}

// Grok Image-to-Video: 6s 480p=15, 6s 720p=30, 10s 480p=30, 10s 720p=45, 15s 480p=45, 15s 720p=60
const GROK_CREDITS = {
  '6_480p': 15, '6_720p': 30,
  '10_480p': 30, '10_720p': 45,
  '15_480p': 45, '15_720p': 60
};

function getCreditsCostForBody(body) {
  const isMotion = body?.model === 'kling-2.6/motion-control';
  const isGrok = body?.model === 'grok-imagine/image-to-video';
  if (isGrok) {
    const duration = String(body?.input?.duration || document.getElementById('grokDuration')?.value || '6');
    const resolution = (body?.input?.resolution || document.getElementById('grokResolution')?.value || '480p').replace('p', 'p');
    const key = `${duration}_${resolution}`;
    return GROK_CREDITS[key] ?? 60;
  }
  if (!isMotion) {
    // veo3.1-fast em 4K custa o dobro
    if (body?.model === 'veo3.1-fast' && (body?.input?.resolution === '4k' || body?.input?.resolution === '4K')) {
      return CREDITS_COST_VIDEO_4K;
    }
    return CREDITS_COST_VIDEO;
  }
  const resolution = body?.input?.mode || document.getElementById('motionResolution')?.value || '720p';
  const creditsPerSec = getCreditsPerSecondMotion(resolution);
  const duration = getMotionRefVideoDuration();
  const seconds = Math.ceil(duration);
  return Math.max(creditsPerSec, seconds * creditsPerSec);
}

function isLocalhost() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname || '';
  return h === 'localhost' || h === '127.0.0.1';
}

async function generateMedia(body) {
  const cost = getCreditsCostForBody(body);
  const userId = getCurrentUserId();
  const credits = getCredits();
  const skipAuthOnLocalhost = isLocalhost();

  if (!SKIP_CREDITS) {
    await syncUserFromSupabaseSession();
    if (!isLoggedIn() && !skipAuthOnLocalhost) {
      openPlansModal();
      return;
    }
    if (credits == null || credits < cost) {
      openPlansModal();
      return;
    }
  }

  btnGenerate.disabled = true;
  updateGenerateButtonLabel(false);
  const startTime = Date.now();
  const cardIndex = getAvailableCardIndex();
  const cardRefs = getCardByIndex(cardIndex);

  if (!cardRefs) {
    if (cardIndex === -1) {
      const inProgress = activeTasks.size + reservedCardIndices.size;
      const toast = document.createElement('div');
      toast.className = 'generation-toast';
      toast.textContent = inProgress >= 1
        ? `${inProgress} vídeo${inProgress > 1 ? 's' : ''} em geração. Aguarde um terminar para iniciar outro.`
        : `Aguarde uma geração terminar. Você pode gerar até ${MAX_CONCURRENT_CARDS} vídeos ao mesmo tempo.`;
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }
    updateGenerateButtonLabel(true);
    if (currentMode === 'video') updateRefImageReadyState(); else btnGenerate.disabled = false;
    return;
  }

  reservedCardIndices.add(cardIndex);
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
  cardRefs.card.querySelector('.status-retry-wrap')?.remove();
  cardRefs.card.removeAttribute('data-retry-body');
  if (cardRefs.resultPromptEl) cardRefs.resultPromptEl.classList.add('hidden');
  cardRefs.card?.querySelector('.media-container')?.classList?.remove('keep-compact');

  let taskId = null;
  let creditsDeducted = false;
  try {
    taskId = await submitTask(body);
    if (!taskId) throw new Error('Nenhum task_id retornado');

    if (!SKIP_CREDITS) {
      const uid = getCurrentUserId();
      const userRaw = localStorage.getItem(AUTH_STORAGE);
      const user = userRaw ? JSON.parse(userRaw) : null;
      const userEmail = (user?.email || '').trim().toLowerCase();
      const deductRes = await fetch('/api/deduct-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid || undefined, email: userEmail || undefined, amount: cost, taskId }),
      });
      if (deductRes.ok) {
        creditsDeducted = true;
        try {
          const data = await deductRes.json();
          if (data.credits != null && user) {
            user.credits = data.credits;
            if (data.userId && !user.id) user.id = data.userId;
            localStorage.setItem(AUTH_STORAGE, JSON.stringify(user));
            updateCreditsDisplay();
          }
        } catch (_) {}
        await refreshCreditsFromSupabase();
        animateCreditsDecrease(cost);
      } else {
        const errText = await deductRes.text();
        console.warn('[VARVOS] Deduct credits falhou:', errText);
        const msg = errText.includes('insuficientes') ? 'Créditos insuficientes.' : 'Não foi possível debitar os créditos. Faça login novamente e tente.';
        if (cardRefs?.statusMessage) {
          cardRefs.statusMessage.textContent = msg;
          cardRefs.statusMessage.className = 'status-message error';
          cardRefs.statusMessage.classList.remove('hidden');
        }
      }
    }

    outputPlaceholder.classList.add('hidden');
    outputResultsList.classList.remove('hidden');

    if (cardRefs.taskStatusEl) cardRefs.taskStatusEl.textContent = 'Enviando...';
    if (cardRefs.taskStatusEl) cardRefs.taskStatusEl.className = 'status-badge';
    if (cardRefs.taskProgressEl) cardRefs.taskProgressEl.textContent = '0%';
    if (cardRefs.progressFill) cardRefs.progressFill.style.width = '0%';
    if (cardRefs.statusMessage) cardRefs.statusMessage.textContent = '';

    const aspectRatio = (body?.model === 'grok-imagine/image-to-video')
      ? '9:16'
      : ((currentMode === 'motion' ? document.getElementById('motionFormat') : document.getElementById('aspectRatio'))?.value || '9:16');
    if (cardRefs.card) cardRefs.card.dataset.aspectRatio = aspectRatio;
    reservedCardIndices.delete(cardIndex);
    activeTasks.set(taskId, { cardRefs, startTime, prompt: lastPrompt, aspectRatio, isMotion: body?.model === 'kling-2.6/motion-control', model: body?.model });
    startLoadingForCard(cardRefs, currentMode, { refImageUrl: currentMode === 'motion' ? motionCharImageUrl : refImageUrl, prompt: lastPrompt });
    document.getElementById('currentResultSection')?.scrollIntoView({ behavior: 'smooth', block: 'end' });

    currentTaskId = taskId;
    saveActiveTask(taskId, startTime, lastPrompt, cost, body?.model);
    updateOutputUI({ status: 'not_started', progress: 0 }, cardRefs, startTime);

    updateGenerateButtonLabel(true);
    if (currentMode === 'video') updateRefImageReadyState(); else btnGenerate.disabled = false;

    const isMotion = body?.model === 'kling-2.6/motion-control';
    const isGrokImageToVideo = body?.model === 'grok-imagine/image-to-video';
    const result = await pollUntilComplete(taskId, cardRefs, startTime, isMotion, isGrokImageToVideo);
    const tid = pollTimeouts.get(taskId);
    if (tid) { clearTimeout(tid); pollTimeouts.delete(taskId); }
    if (result?.status === 'finished' && result?.files?.length) {
      const ar = result.files[0]?.file_type === 'video'
        ? ((currentMode === 'motion' ? document.getElementById('motionFormat') : document.getElementById('aspectRatio'))?.value || '9:16')
        : (document.getElementById('imgSize')?.value || '1:1');
      addToHistory(result, lastPrompt, ar);
    }
  } catch (err) {
    let amountToRefund = cost;
    // Fallback Sora 2 -> Grok 15s quando há imagem de referência (sem mostrar erro ao cliente)
    if (body?.model === 'sora-2' && refImageUrl && !err.isCredits && !err.isTimeout && currentMode === 'video') {
      const tid = pollTimeouts.get(taskId);
      if (tid) { clearTimeout(tid); pollTimeouts.delete(taskId); }
      try {
        if (creditsDeducted && userId && taskId) {
          const refundRes = await fetch('/api/refund-credits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount: amountToRefund, taskId }),
          });
          if (refundRes.ok) {
            creditsDeducted = false;
            await refreshCreditsFromSupabase();
          }
        }
        const grokBody = {
          model: 'grok-imagine/image-to-video',
          input: {
            image_urls: [refImageUrl],
            prompt: lastPrompt || document.getElementById('prompt')?.value?.trim() || '',
            mode: document.getElementById('grokMode')?.value || 'normal',
            duration: '15',
            resolution: document.getElementById('grokResolution')?.value || '480p'
          }
        };
        const grokCost = getCreditsCostForBody(grokBody);
        const creditsNow = getCredits();
        if (creditsNow == null || creditsNow < grokCost) throw new Error('Créditos insuficientes para tentar com outro modelo');

        if (cardRefs?.statusMessage) {
          cardRefs.statusMessage.textContent = '';
          cardRefs.statusMessage.classList.add('hidden');
        }
        if (cardRefs?.taskStatusEl) {
          cardRefs.taskStatusEl.textContent = 'Gerando...';
          cardRefs.taskStatusEl.className = 'status-badge';
        }
        cardRefs.card?.querySelector('.status-retry-wrap')?.remove();
        startLoadingForCard(cardRefs, 'video', { refImageUrl, prompt: lastPrompt });

        taskId = await submitTask(grokBody);
        if (!taskId) throw new Error('Falha ao iniciar geração alternativa');

        if (!SKIP_CREDITS) {
          const userRaw = localStorage.getItem(AUTH_STORAGE);
          const user = userRaw ? JSON.parse(userRaw) : null;
          const userEmail = (user?.email || '').trim().toLowerCase();
          const deductRes = await fetch('/api/deduct-credits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId || undefined, email: userEmail || undefined, amount: grokCost, taskId }),
          });
          if (!deductRes.ok) throw new Error('Não foi possível debitar créditos');
          creditsDeducted = true;
          amountToRefund = grokCost;
          try {
            const data = await deductRes.json();
            if (data.credits != null && user) {
              user.credits = data.credits;
              if (data.userId && !user.id) user.id = data.userId;
              localStorage.setItem(AUTH_STORAGE, JSON.stringify(user));
              updateCreditsDisplay();
            }
          } catch (_) {}
          await refreshCreditsFromSupabase();
          animateCreditsDecrease(grokCost);
          amountToRefund = grokCost;
        }

        const aspectRatio = '9:16';
        if (cardRefs.card) cardRefs.card.dataset.aspectRatio = aspectRatio;
        activeTasks.set(taskId, { cardRefs, startTime, prompt: lastPrompt, aspectRatio, isMotion: false, model: 'grok-imagine/image-to-video' });
        currentTaskId = taskId;
        saveActiveTask(taskId, startTime, lastPrompt, grokCost, 'grok-imagine/image-to-video');
        updateOutputUI({ status: 'not_started', progress: 0 }, cardRefs, startTime);

        const result = await pollUntilComplete(taskId, cardRefs, startTime, false, true);
        const tid2 = pollTimeouts.get(taskId);
        if (tid2) { clearTimeout(tid2); pollTimeouts.delete(taskId); }
        if (result?.status === 'finished' && result?.files?.length) {
          const ar = document.getElementById('aspectRatio')?.value || '9:16';
          addToHistory(result, lastPrompt, ar);
        }
        updateGenerateButtonLabel(true);
        if (currentMode === 'video') updateRefImageReadyState(); else btnGenerate.disabled = false;
        return;
      } catch (fallbackErr) {
        console.error('[VARVOS] Fallback Grok falhou:', fallbackErr);
        err = fallbackErr;
      }
    }

    reservedCardIndices.delete(cardIndex);
    if (taskId) activeTasks.delete(taskId);
    stopLoadingForCard(cardRefs, { keepCompact: true });
    console.error('[VARVOS] Erro na geração:', err);

    // Sempre mostrar a seção Resultado com o erro — nunca sumir sem avisar o cliente
    if (outputPlaceholder && outputResultsList) {
      outputPlaceholder.classList.add('hidden');
      outputResultsList.classList.remove('hidden');
      document.getElementById('currentResultSection')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    let refunded = false;
    if (creditsDeducted && userId && taskId) {
      try {
        const refundRes = await fetch('/api/refund-credits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount: amountToRefund, taskId }),
        });
        if (refundRes.ok) {
          refunded = true;
          await refreshCreditsFromSupabase();
        }
      } catch (e) { console.warn('[VARVOS] Refund falhou:', e); }
    }

    if (err.isCredits) {
      openPlansModal();
    } else if (cardRefs?.statusMessage) {
      let displayMsg = err.isTimeout
        ? 'O processamento demorou mais de 15 minutos e foi cancelado.'
        : (err.message ? translateApiError(err.message, body?.model) : '') || MSG_SERVER_ALTA_DEMANDA;
      if (refunded) {
        displayMsg += ' Seus créditos foram reembolsados. Você pode tentar novamente em alguns minutos.';
      } else if (!err.isTimeout && !err.message) {
        displayMsg += ' Tente novamente em alguns minutos.';
      }
      showGenerationErrorWithRetry(cardRefs, displayMsg, body);
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
    if (duration > MOTION_REF_MAX_DURATION_SECONDS) {
      alert(`O vídeo de referência tem ${Math.ceil(duration)} segundos. O limite é ${MOTION_REF_MAX_DURATION_SECONDS} segundos. Remova o vídeo e envie um mais curto.`);
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
    const previews = [
      { el: document.getElementById('imageRefPreview'), url: refImageUrl },
      { el: document.getElementById('imageRef2Preview'), url: refImageUrl2 },
      { el: document.getElementById('imageRef3Preview'), url: refImageUrl3 }
    ];
    for (const { el, url } of previews) {
      if (el && !el.classList.contains('hidden') && !url) {
        alert('Aguarde o upload da imagem terminar antes de gerar.');
        return;
      }
    }
    const model = getEffectiveModel();
    if (model === 'grok-imagine/image-to-video' && !refImageUrl) {
      alert('O Grok requer uma imagem de referência. Envie uma imagem.');
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

// Sincronizar tarefas que já terminaram enquanto o usuário estava fora — adiciona a "Seus vídeos"
async function syncCompletedTasks() {
  const tasks = await getStoredActiveTasks();
  if (tasks.length === 0) return;
  for (const data of tasks) {
    const taskId = data.taskId;
    const isMotion = data.mode === 'motion';
    const isGrokImageToVideo = data.model === 'grok-imagine/image-to-video';
    try {
      const result = await getTaskStatus(taskId, isMotion, isGrokImageToVideo);
      if (result?.status === 'finished' && result?.files?.length) {
        const ar = result.files[0]?.file_type === 'video'
          ? (document.getElementById('aspectRatio')?.value || document.getElementById('motionFormat')?.value || '9:16')
          : (document.getElementById('imgSize')?.value || '1:1');
        addToHistory(result, data.prompt || '', ar);
        await clearActiveTask(taskId);
      } else if (result?.status === 'failed') {
        await clearActiveTask(taskId);
      }
    } catch (_) {}
  }
}

// Restaura uma tarefa em um card específico (usado no load e no poll entre dispositivos)
function restoreTaskToCard(data, cardIndex) {
  const cardRefs = getCardByIndex(cardIndex);
  if (!cardRefs || !data?.taskId) return;

  cardRefs.card?.querySelector('.media-container')?.classList?.remove('keep-compact');
  const startTime = data.startTime || Date.now();
  if (cardRefs.videoPlayer) {
    cardRefs.videoPlayer.src = '';
    cardRefs.videoPlayer.style.display = 'none';
  }
  if (cardRefs.imageGallery) {
    cardRefs.imageGallery.classList.add('hidden');
    cardRefs.imageGallery.innerHTML = '';
  }

  cardRefs.card.classList.remove('hidden');
  activeTasks.set(data.taskId, { cardRefs, startTime, model: data.model });
  startLoadingForCard(cardRefs, data.mode || 'video', { refImageUrl: (data.mode === 'motion' ? motionCharImageUrl : refImageUrl), prompt: data.prompt || lastPrompt });

  if (cardRefs.taskStatusEl) cardRefs.taskStatusEl.textContent = 'Enviando...';
  if (cardRefs.taskProgressEl) cardRefs.taskProgressEl.textContent = '0%';
  if (cardRefs.progressFill) cardRefs.progressFill.style.width = '0%';

  const isMotion = data.mode === 'motion';
  const isGrokImageToVideo = data.model === 'grok-imagine/image-to-video';
  pollUntilComplete(data.taskId, cardRefs, startTime, isMotion, isGrokImageToVideo)
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
    .catch(async (err) => {
      const tid = pollTimeouts.get(data.taskId);
      if (tid) { clearTimeout(tid); pollTimeouts.delete(data.taskId); }
      activeTasks.delete(data.taskId);
      stopLoadingForCard(cardRefs, { keepCompact: true });
      let refunded = false;
      const restoreUserId = getCurrentUserId();
      const restoreCost = data.cost != null ? parseInt(data.cost, 10) : (data.mode === 'motion' ? null : 50);
      if (restoreUserId && data.taskId && restoreCost && restoreCost > 0) {
        try {
          const refundRes = await fetch('/api/refund-credits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: restoreUserId, amount: restoreCost, taskId: data.taskId }),
          });
          if (refundRes.ok) {
            refunded = true;
            await refreshCreditsFromSupabase();
          }
        } catch (_) {}
      }
      if (err.isCredits) {
        openPlansModal();
        if (cardRefs.statusMessage) {
          cardRefs.statusMessage.textContent = 'Créditos insuficientes. Adicione créditos para tentar novamente.';
          cardRefs.statusMessage.className = 'status-message error';
          cardRefs.statusMessage.classList.remove('hidden');
        }
      } else if (cardRefs.statusMessage) {
        let msg = err.isTimeout
          ? 'O processamento demorou mais de 15 minutos e foi cancelado.'
          : (err.message ? translateApiError(err.message, data.model) : '') || MSG_SERVER_ALTA_DEMANDA;
        if (refunded) msg += ' Seus créditos foram reembolsados. Você pode tentar novamente em alguns minutos.';
        else if (!err.isTimeout && !err.message) msg += ' Tente novamente em alguns minutos.';
        cardRefs.statusMessage.textContent = msg;
        cardRefs.statusMessage.className = 'status-message error';
        cardRefs.statusMessage.classList.remove('hidden');
      }
      if (cardRefs.taskStatusEl) {
        cardRefs.taskStatusEl.textContent = 'Falhou';
        cardRefs.taskStatusEl.className = 'status-badge failed';
      }
    })
    .finally(() => {
      updateGenerateButtonLabel(true);
      if (currentMode === 'video') updateRefImageReadyState(); else btnGenerate.disabled = false;
    });
}

// Restaurar tarefas em andamento após recarregar — sessão do vídeo em criação nunca deve sumir
async function restoreActiveTask() {
  if (!outputPlaceholder || !outputResultsList) return;
  const tasks = await getStoredActiveTasks();
  const toRestore = tasks.filter((t) => t?.taskId && !activeTasks.has(t.taskId));
  if (toRestore.length > 0) {
    outputPlaceholder.classList.add('hidden');
    outputResultsList.classList.remove('hidden');
    toRestore.forEach((data) => {
      const cardIndex = getAvailableCardIndex();
      if (cardIndex >= 0) restoreTaskToCard(data, cardIndex);
    });
    currentTaskId = toRestore[0].taskId;
    document.getElementById('currentResultSection')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
  syncCompletedTasks();
}

// Polling: buscar tarefas iniciadas em outro dispositivo (ex: celular) e exibir no computador
const ACTIVE_TASKS_POLL_INTERVAL_MS = 15 * 1000; // 15 segundos para sincronização mais rápida
function pollActiveTasksFromOtherDevices() {
  if (!getCurrentUserId() || !outputPlaceholder || !outputResultsList) return;
  getStoredActiveTasks().then((tasks) => {
    const currentTaskIds = new Set(activeTasks.keys());
    const newTasks = tasks.filter((t) => t?.taskId && !currentTaskIds.has(t.taskId));
    if (newTasks.length === 0) return;
    outputPlaceholder.classList.add('hidden');
    outputResultsList.classList.remove('hidden');
    for (const data of newTasks) {
      const cardIndex = getAvailableCardIndex();
      if (cardIndex < 0) break;
      restoreTaskToCard(data, cardIndex);
    }
    if (newTasks.length > 0) document.getElementById('currentResultSection')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
}
setInterval(pollActiveTasksFromOtherDevices, ACTIVE_TASKS_POLL_INTERVAL_MS);
// Poll imediatamente quando o usuário volta à aba (ex: estava em outra aba e gerou no celular)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && getCurrentUserId()) pollActiveTasksFromOtherDevices();
});

function runRestoreActiveTask() {
  restoreActiveTask().then(() => {
    // Retry após 600ms se não restauramos nada — cobre race com Supabase/auth
    if (activeTasks.size === 0) setTimeout(restoreActiveTask, 600);
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runRestoreActiveTask);
} else {
  runRestoreActiveTask();
}

