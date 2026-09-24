const stage = document.querySelector('#character-stage');
const viewport = document.querySelector('#character-viewport');
const waveButton = document.querySelector('#wave-button');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;
let character;
function updateMotionPreference() {
  character?.setPaused(paused);
}
// The contact link works even while the portrait loads or WebGL is unavailable.
// Greet on hover/focus too, so the nod is visible before the page scrolls.
for (const event of ['pointerenter', 'focus', 'click']) {
  waveButton.addEventListener(event, () => character?.greet());
}
updateMotionPreference();
reducedMotion.addEventListener('change', event => { paused = event.matches; updateMotionPreference(); });

const contactForm = document.querySelector('#contact-form');
const contactStatus = document.querySelector('#contact-status');
const contactWasSent = new URLSearchParams(window.location.search).get('contact') === 'sent';
const returnUrl = new URL(window.location.href);
returnUrl.hash = 'contact';
returnUrl.searchParams.set('contact', 'sent');
const returnField = document.createElement('input');
returnField.type = 'hidden';
returnField.name = '_next';
returnField.setAttribute('value', returnUrl.href);
contactForm.append(returnField);
if (contactWasSent) {
  contactStatus.textContent = 'Thanks for reaching out. Your note was submitted!';
  contactStatus.dataset.state = 'success';
  contactStatus.hidden = false;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('contact');
  window.history.replaceState(null, '', cleanUrl);
}
contactForm.addEventListener('submit', event => {
  if (contactForm.querySelector('[name="_honey"]').value) event.preventDefault();
});

// Position the illustration before importing the 3D code so the fallback also
// sits beside Submit on a slow connection or when WebGL cannot load.
const contactPotion = document.querySelector('#contact-potion');
const potionDesktopHome = document.querySelector('.contact-brew');
const potionMobileHome = contactForm.querySelector('.contact-potion-slot');
const potionMobile = matchMedia('(max-width: 760px)');
function placeContactPotion() {
  (potionMobile.matches ? potionMobileHome : potionDesktopHome).append(contactPotion);
  potionDesktopHome.hidden = potionMobile.matches;
}
potionMobile.addEventListener('change', placeContactPotion);
placeContactPotion();

// Decorative feedback never changes the form fields or submits a demo message.
import('./contact-potion.js?v=form-flow-3').then(({ mountContactPotion }) => {
  mountContactPotion(document.querySelector('#contact-potion'), contactForm, { sent: contactWasSent });
}).catch(error => console.warn('Keeping the static potion illustration.', error));

// Load the silent vignette near its card. A blocked autoplay attempt must
// leave an explicit, user-activated way to play on mobile.
const editingLoop = document.querySelector('#about-editing-loop');
const editingControl = document.querySelector('#editing-playback');
let editingInView = false, editingOptIn = false, editingPaused = false, editingPending = false;
function editingShouldPlay() {
  return editingInView && !document.hidden && !editingPaused && (!reducedMotion.matches || editingOptIn);
}
function showEditingControl(label = 'Play animation') {
  editingControl.textContent = label;
  editingControl.hidden = false;
}
function updateEditingLoop() {
  if (!editingLoop) return;
  if (!editingShouldPlay()) {
    editingLoop.pause();
    if (reducedMotion.matches && !editingOptIn) {
      editingLoop.classList.remove('is-playing');
      showEditingControl();
    }
    return;
  }
  if (editingPending || !editingLoop.paused && editingLoop.readyState >= 3) return;
  // Set the properties as well as the HTML attributes before assigning src.
  editingLoop.muted = true;
  editingLoop.defaultMuted = true;
  editingLoop.playsInline = true;
  editingLoop.preload = 'auto';
  if (!editingLoop.getAttribute('src')) editingLoop.src = editingLoop.dataset.src;
  editingPending = true;
  editingLoop.play().catch(error => {
    if (editingShouldPlay()) {
      editingLoop.dataset.playback = error.name === 'NotAllowedError' ? 'blocked' : 'retry';
      showEditingControl(editingLoop.error ? 'Retry animation' : 'Play animation');
    }
  }).finally(() => { editingPending = false; });
}
if (editingLoop) {
  editingLoop.addEventListener('playing', () => {
    if (!editingShouldPlay()) { editingLoop.pause(); return; }
    editingLoop.classList.add('is-playing');
    editingLoop.dataset.playback = 'playing';
    if (editingOptIn) showEditingControl('Pause animation');
    else editingControl.hidden = true;
  });
  editingLoop.addEventListener('pause', () => {
    if (editingInView && !document.hidden && !editingPending) showEditingControl();
  });
  editingLoop.addEventListener('error', () => {
    editingLoop.classList.remove('is-playing');
    editingLoop.dataset.playback = 'error';
    showEditingControl('Retry animation');
  });
  editingControl.addEventListener('click', () => {
    if (!editingLoop.paused && editingLoop.classList.contains('is-playing')) {
      editingPaused = true;
      editingLoop.pause();
      showEditingControl();
    } else {
      editingOptIn = true;
      editingPaused = false;
      if (editingLoop.error) editingLoop.load();
      // Call play synchronously from the tap to retain browser user activation.
      updateEditingLoop();
    }
  });
  new IntersectionObserver(([entry]) => {
    editingInView = entry.isIntersecting;
    updateEditingLoop();
  }, { threshold: 0.1 }).observe(editingLoop.parentElement);
  reducedMotion.addEventListener('change', () => {
    editingOptIn = false; editingPaused = false; updateEditingLoop();
  });
  document.addEventListener('visibilitychange', updateEditingLoop);
  window.addEventListener('pageshow', updateEditingLoop);
  updateEditingLoop();
}

stage.dataset.renderState = 'loading';
viewport.setAttribute('aria-busy', 'true');
import('./character.js').then(async ({ createCharacter }) => {
  character = await createCharacter(viewport, { paused });
  character.setPaused(paused);
  // The renderer marks readiness only after it has drawn a frame.
  viewport.setAttribute('aria-busy', 'false');
}).catch(error => {
  console.warn('The 3D portrait is unavailable; showing the cleaned sculpt portrait.', error);
  stage.dataset.renderState = 'fallback';
  viewport.setAttribute('aria-busy', 'false');
  viewport.querySelector('canvas')?.remove();
});

const projects = {
  filth: { title: 'Bread & Butter — Introducing Filth', category: 'PRODUCT FILM', description: 'A product introduction for Bread & Butter Pickleball’s Filth paddle.', poster: './assets/filth.jpg', video: './assets/videos/filth.mp4' },
  go: { title: 'GO! Curriculum', category: 'ANIMATED EXPLAINER', description: 'An animated introduction to GO! Curriculum for youth programs.', poster: './assets/go-curriculum.jpg', video: './assets/videos/go.mp4' },
  urjanet: { title: 'Urjanet', category: 'BRAND STORY / EXPLAINER', description: 'A provider engagement explainer for Urjanet.', poster: './assets/urjanet.jpg', video: './assets/videos/urjanet.mp4' },
  loco: { title: 'Bread & Butter — Loco', category: 'LOGO ANIMATION', description: 'A logo tease for Bread & Butter’s Loco paddle.', poster: './assets/loco.png', video: './assets/videos/loco.mp4' },
  riot: { title: 'RIOT', category: 'LOGO ANIMATION', description: 'Riot Games logo animation.', poster: './assets/riot.jpg', video: './assets/videos/riot.mp4', loop: true },
  crossing: { title: 'The Crossing', category: 'ANIMATED STORY', description: 'A local church’s animated history.', poster: './assets/crossing.jpg', video: './assets/videos/crossing.mp4' },
  'royal-canin': { title: 'Royal Canin', category: 'EVENT PROMO', description: 'A promotional film for Royal Canin.', poster: './assets/royal-canin.jpg', video: './assets/videos/royal-canin.mp4' },
  securibly: { title: 'Securibly', category: 'PROMO', description: 'Promotional animation for Securibly.', poster: './assets/securibly.jpg', video: './assets/videos/securibly.mp4' },
  'barre-harmony': { title: 'Barre Harmony', category: 'SOCIAL AD', description: 'A social advertisement for Barre Harmony.', poster: './assets/barre-harmony.jpg', video: './assets/videos/barre-harmony.mp4' },
  jumbo: { title: 'Jumbo Privacy', category: 'LOGO ANIMATION', description: 'Jumbo Privacy logo animation.', poster: './assets/jumbo.jpg', video: './assets/videos/jumbo.mp4', loop: true }
};
const dialog = document.querySelector('#project-dialog');
const video = document.querySelector('#project-video');
let lastProject;
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => {
  const project = projects[button.dataset.project];
  lastProject = button;
  document.querySelector('#dialog-title').textContent = project.title;
  document.querySelector('#dialog-category').textContent = project.category;
  document.querySelector('#dialog-description').textContent = project.description;
  document.querySelector('.video-error').hidden = true;
  video.poster = project.poster;
  video.loop = Boolean(project.loop);
  video.src = project.video;
  dialog.showModal();
  document.body.classList.add('modal-open');
  video.play().catch(() => { /* Native controls remain available if autoplay is blocked. */ });
}));
video.addEventListener('error', () => { document.querySelector('.video-error').hidden = false; });
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});
dialog.addEventListener('close', () => {
  video.pause(); video.removeAttribute('src'); video.load();
  document.body.classList.remove('modal-open');
  lastProject?.focus({ preventScroll: true });
});
