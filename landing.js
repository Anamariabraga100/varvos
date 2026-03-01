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

document.addEventListener('DOMContentLoaded', () => {
  updateLandingAuthUI();
  initLandingLogout();

  const carousel = document.getElementById('videoCarousel');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');

  // Scroll carousel
  if (prevBtn && carousel) {
    prevBtn.addEventListener('click', () => {
      carousel.scrollBy({ left: -216, behavior: 'smooth' });
    });
  }
  if (nextBtn && carousel) {
    nextBtn.addEventListener('click', () => {
      carousel.scrollBy({ left: 216, behavior: 'smooth' });
    });
  }

  // Mute/unmute buttons
  document.querySelectorAll('.mute-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.video-card');
      const video = card?.querySelector('video');
      if (video) {
        video.muted = !video.muted;
        btn.classList.toggle('unmuted', !video.muted);
        btn.textContent = video.muted ? '🔇' : '🔊';
      }
    });
  });

  // Play videos when in view
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target.querySelector('video');
      if (video) {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.video-card').forEach(card => {
    observer.observe(card);
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

  document.querySelectorAll('.feature-media').forEach(block => {
    featureObserver.observe(block);
  });
});
