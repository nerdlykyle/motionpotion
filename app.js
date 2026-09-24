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

// Decorative feedback never changes the form fields or submits a demo message.
import('./contact-potion.js').then(({ mountContactPotion }) => {
  mountContactPotion(document.querySelector('#contact-potion'), contactForm, { sent: contactWasSent });
}).catch(error => console.warn('Keeping the static potion illustration.', error));

// Load the silent five-second vignette only when its card enters view.
const editingLoop = document.querySelector('#about-editing-loop');
let editingInView = false;
function updateEditingLoop() {
  if (!editingLoop) return;
  if (reducedMotion.matches || document.hidden || !editingInView) {
    editingLoop.pause();
    if (reducedMotion.matches) editingLoop.classList.remove('is-playing');
    return;
  }
  if (!editingLoop.getAttribute('src')) editingLoop.src = editingLoop.dataset.src;
  editingLoop.play().catch(() => { /* Keep the poster if autoplay is unavailable. */ });
}
if (editingLoop) {
  editingLoop.addEventListener('playing', () => editingLoop.classList.add('is-playing'));
  editingLoop.addEventListener('error', () => editingLoop.classList.remove('is-playing'));
  new IntersectionObserver(([entry]) => {
    editingInView = entry.isIntersecting;
    updateEditingLoop();
  }, { threshold: 0.1 }).observe(editingLoop);
  reducedMotion.addEventListener('change', updateEditingLoop);
  document.addEventListener('visibilitychange', updateEditingLoop);
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
