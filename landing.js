const AUTH_STORAGE = 'varvos_user';

function populateLandingHamburgerUser(user) {
  const nameEl = document.getElementById('landingHamburgerUserName');
  const avatarEl = document.getElementById('landingHamburgerAvatar');
  const initialEl = document.getElementById('landingHamburgerInitial');
  const wrap = document.querySelector('.landing-hamburger-avatar-wrap');
  if (!nameEl) return;
  const name = user?.name || user?.email?.split('@')[0] || 'Usuário';
  nameEl.textContent = name;
  if (user?.picture && avatarEl && wrap) {
    avatarEl.src = user.picture;
    avatarEl.alt = name;
    wrap.classList.add('has-img');
  } else if (initialEl && wrap) {
    initialEl.textContent = (name.charAt(0) || '?').toUpperCase();
    wrap.classList.remove('has-img');
  }
}

function updateLandingAuthUI() {
  const authTrigger = document.getElementById('navBtnEntrar') || document.getElementById('authTrigger');
  const navLogged = document.getElementById('navLogged');
  if (!authTrigger || !navLogged) return;
  function applyUI(user) {
    const isLoggedIn = !!(user && (user.email || user.sub || user.id));
    if (isLoggedIn) {
      authTrigger.classList.add('hidden');
      navLogged.classList.remove('hidden');
      populateLandingHamburgerUser(user);
    } else {
      authTrigger.classList.remove('hidden');
      navLogged.classList.add('hidden');
    }
  }
  try {
    const raw = localStorage.getItem(AUTH_STORAGE);
    let user = raw ? JSON.parse(raw) : null;
    if (user && (user.email || user.sub || user.id)) {
      applyUI(user);
      return;
    }
    // Fallback: Supabase session (usuário logou por e-mail mas varvos_user não foi persistido)
    const sb = window.varvosSupabase;
    if (sb && sb.auth && sb.auth.getSession) {
      sb.auth.getSession().then(function(res) {
        var session = (res && res.data) ? res.data.session : null;
        var authUser = session && session.user;
        if (!authUser) { applyUI(null); return; }
        var sync = window.varvosAuthSupabase && window.varvosAuthSupabase.syncUserFromEmail;
        if (sync) {
          sync(authUser).then(function(u) {
            var final = u || { provider: 'email', email: authUser.email, id: authUser.id };
            try { localStorage.setItem(AUTH_STORAGE, JSON.stringify(final)); } catch (_) {}
            applyUI(final);
          }).catch(function() { applyUI({ email: authUser.email, id: authUser.id }); });
        } else {
          applyUI({ email: authUser.email, id: authUser.id });
        }
      }).catch(function() { applyUI(null); });
    } else {
      applyUI(null);
    }
  } catch {
    applyUI(null);
  }
}

function toggleLandingHamburger(open) {
  const overlay = document.getElementById('landingHamburgerOverlay');
  const btn = document.getElementById('landingHamburgerBtn');
  if (!overlay || !btn) return;
  const isOpen = open ?? !overlay.classList.contains('open');
  overlay.classList.toggle('open', isOpen);
  overlay.setAttribute('aria-hidden', String(!isOpen));
  btn.setAttribute('aria-expanded', String(isOpen));
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

function initLandingHamburger() {
  const btn = document.getElementById('landingHamburgerBtn');
  const overlay = document.getElementById('landingHamburgerOverlay');
  const logoutBtn = document.getElementById('landingHamburgerLogout');
  btn?.addEventListener('click', () => toggleLandingHamburger());
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) toggleLandingHamburger(false);
  });
  overlay?.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => toggleLandingHamburger(false));
  });
  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem(AUTH_STORAGE);
    toggleLandingHamburger(false);
    updateLandingAuthUI();
    window.location.href = '/';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay?.classList.contains('open')) {
      toggleLandingHamburger(false);
    }
  });
}

function initLanding() {
  updateLandingAuthUI();
  initLandingHamburger();

  // Atualizar UI ao carregar, voltar (bfcache), trocar de aba ou quando localStorage muda em outra aba
  window.addEventListener('load', updateLandingAuthUI);
  window.addEventListener('pageshow', () => updateLandingAuthUI());
  window.addEventListener('storage', () => updateLandingAuthUI());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateLandingAuthUI();
  });

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

  // Lazy-load vídeos do carrossel: carrega src quando o card entra na viewport
  document.querySelectorAll('.video-card video[data-lazy]').forEach(video => {
    const card = video.closest('.video-card');
    if (!card?.dataset.videoSrc) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !video.src) {
          video.src = card.dataset.videoSrc;
          observer.disconnect();
        }
      });
    }, { threshold: 0, rootMargin: '50px' });
    observer.observe(card);
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

  // Spotlight section: play videos when in view
  const spotlightSection = document.querySelector('.spotlight-section');
  if (spotlightSection) {
    const spotlightObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target.querySelector('video');
        if (video) {
          if (entry.isIntersecting) {
            video.muted = true;
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      });
    }, { threshold: 0.2 });
    spotlightSection.querySelectorAll('.spotlight-media').forEach(block => spotlightObserver.observe(block));
  }
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
