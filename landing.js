const AUTH_STORAGE = 'varvos_user';

function updateLandingAuthUI() {
  const authTrigger = document.getElementById('authTrigger');
  const navLogged = document.getElementById('navLogged');
  const navUserName = document.getElementById('navUserName');
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    if (user && user.email) {
      if (authTrigger) authTrigger.classList.add('hidden');
      if (navLogged) navLogged.classList.remove('hidden');
      const name = user.name || user.email?.split('@')[0] || 'Usuário';
      if (navUserName) navUserName.textContent = name.split(' ')[0] || name;
    } else {
      if (authTrigger) authTrigger.classList.remove('hidden');
      if (navLogged) navLogged.classList.add('hidden');
    }
  } catch {
    if (authTrigger) authTrigger.classList.remove('hidden');
    if (navLogged) navLogged.classList.add('hidden');
  }
}

function initLandingLogout() {
  document.getElementById('navLogout')?.addEventListener('click', () => {
    localStorage.removeItem(AUTH_STORAGE);
    updateLandingAuthUI();
  });
}

function initLanding() {
  updateLandingAuthUI();
  initLandingLogout();

  const carousel = document.getElementById('videoCarousel');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');

  if (prevBtn && carousel) {
    prevBtn.addEventListener('click', () => carousel.scrollBy({ left: -192, behavior: 'smooth' }));
  }
  if (nextBtn && carousel) {
    nextBtn.addEventListener('click', () => carousel.scrollBy({ left: 192, behavior: 'smooth' }));
  }

  // Modal de vídeo: lógica no index.html (script inline) para garantir execução antes de auth/supabase
  // Carrossel scroll e toggleMute ficam no landing.js; abertura do modal no inline

  // Click-to-toggle mute em vídeos da seção de features
  document.querySelectorAll('.feature-card-media video').forEach(video => {
    const media = video.closest('.feature-card-media');
    if (media) {
      media.addEventListener('click', (e) => {
        e.preventDefault();
        video.muted = !video.muted;
      });
    }
  });

  // Play videos when carousel section is in view
  const carouselSection = document.querySelector('.carousel-section');
  const carouselObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const videos = entry.target.querySelectorAll('.video-card video');
      videos.forEach(video => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    });
  }, { threshold: 0.05, rootMargin: '100px' });

  if (carouselSection) carouselObserver.observe(carouselSection);

  // Iniciar reprodução quando o vídeo estiver pronto
  document.querySelectorAll('.video-card video').forEach(video => {
    video.playsInline = true; // necessário em alguns iOS
    const tryPlay = () => video.play().catch(() => {});
    video.addEventListener('loadeddata', tryPlay);
    video.addEventListener('canplay', tryPlay);
    tryPlay();
  });

  // Feature section videos
  const featureObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target.tagName === 'VIDEO' ? entry.target : entry.target.querySelector('video');
      if (video) {
        if (entry.isIntersecting) {
          video.muted = true;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.feature-card-media').forEach(block => {
    featureObserver.observe(block);
  });
}

function runInit() {
  try {
    initLanding();
  } catch (err) {
    console.error('Landing init:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runInit);
} else {
  runInit();
}
