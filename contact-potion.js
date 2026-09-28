import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

const clamp = THREE.MathUtils.clamp;

// Immediate linear launch; only the end of the ascent decelerates. Flip in
// place during the hang, then use quartic easing to seat the cork again.
export function corkPose(time) {
  const quart = t => t < .5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
  if (time < 0 || time >= 1.12) return {lift:0, turn:0};
  let lift;
  if (time < .07) lift = .5 * time / .07;
  else if (time < .23) lift = .5 + .38 * (1 - (1 - (time - .07) / .16) ** 3);
  else if (time < .72) lift = .88;
  else lift = .88 * (1 - quart((time - .72) / .4));
  const flip = clamp((time - .29) / .35, 0, 1);
  return {lift, turn:-Math.PI * 2 * quart(flip)};
}

export function potionFrustum(width, height, flightSpace) {
  // Add headroom without shrinking or shifting the resting bottle sideways.
  const unitsPerPixel = 3.36 / Math.max(1, height - flightSpace);
  return {left:-width * unitsPerPixel / 2, right:width * unitsPerPixel / 2,
    top:1.68 + flightSpace * unitsPerPixel, bottom:-1.68};
}
// The same inside profile as the Blender flask, with clearance from the glass.
const PROFILE = [[.16,.35],[.22,.48],[.38,.67],[.61,.81],[.85,.85],[1.05,.83],[1.25,.75],[1.44,.59],[1.60,.38]];
function radiusAt(height) {
  for (let i = 1; i < PROFILE.length; i++) {
    if (height <= PROFILE[i][0]) {
      const [a, r] = PROFILE[i - 1], [b, s] = PROFILE[i];
      return THREE.MathUtils.lerp(r, s, clamp((height - a) / (b - a), 0, 1));
    }
  }
  return PROFILE.at(-1)[1];
}

// One watertight mesh: sides and gold surface share their perimeter. No
// overlapping animated caps, transparency sorting, or baked shape-key blending.
function makeLiquid() {
  const N = 64, SIDE = 18, DISK = 8;
  const ringCount = SIDE + DISK;
  const positions = new Float32Array((ringCount * N + 2) * 3);
  const indices = [];
  for (let row = 0; row < SIDE; row++) {
    for (let j = 0; j < N; j++) {
      const a = row * N + j, b = row * N + (j + 1) % N;
      indices.push(a, a + N, b, b, a + N, b + N);
    }
  }
  const bottom = ringCount * N, center = bottom + 1;
  for (let j = 0; j < N; j++) indices.push(bottom, j, (j + 1) % N);
  const sideCount = indices.length;
  for (let row = SIDE; row < ringCount - 1; row++) {
    for (let j = 0; j < N; j++) {
      const a = row * N + j, b = row * N + (j + 1) % N;
      indices.push(a, a + N, b, b, a + N, b + N);
    }
  }
  for (let j = 0; j < N; j++) {
    const a = (ringCount - 1) * N + j, b = (ringCount - 1) * N + (j + 1) % N;
    indices.push(a, center, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  geometry.addGroup(0, sideCount, 0);
  geometry.addGroup(sideCount, indices.length - sideCount, 1);
  const mesh = new THREE.Mesh(geometry, [
    new THREE.MeshStandardMaterial({color: '#282823', roughness: .48, side: THREE.DoubleSide}),
    new THREE.MeshStandardMaterial({color: '#f2c83f', roughness: .4, side: THREE.DoubleSide})
  ]);
  mesh.frustumCulled = false;
  const put = (index, x, y, z) => { positions[index * 3] = x; positions[index * 3 + 1] = y - .95; positions[index * 3 + 2] = z; };
  function update(amount, wave, time) {
    const level = .175 + amount * 1.19;
    const surface = (x, z) => level + wave * x + Math.abs(wave) * .2 * Math.sin(x * 5 + z * 3 - time * 3);
    for (let j = 0; j < N; j++) {
      const angle = j * Math.PI * 2 / N, c = Math.cos(angle), s = Math.sin(angle);
      let edgeHeight = level;
      for (let k = 0; k < 12; k++) edgeHeight = surface(radiusAt(edgeHeight) * c, radiusAt(edgeHeight) * .7 * s);
      const edgeRadius = radiusAt(edgeHeight);
      for (let row = 0; row <= SIDE; row++) {
        const h = THREE.MathUtils.lerp(.16, edgeHeight, row / SIDE), r = radiusAt(h);
        put(row * N + j, r * c, h, r * .7 * s);
      }
      for (let row = 1; row < DISK; row++) {
        const r = edgeRadius * (1 - row / DISK), x = r * c, z = r * .7 * s;
        put((SIDE + row) * N + j, x, surface(x, z), z);
      }
    }
    put(bottom, 0, .16, 0); put(center, 0, surface(0, 0), 0);
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    mesh.visible = amount > .012;
    return level;
  }
  update(0, 0, 0);
  return {mesh, update};
}

async function createBottle(stage) {
  const renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true, powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.25 : 1.6));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  let gltf;
  try { gltf = await new GLTFLoader().loadAsync(new URL('./assets/models/potion-form.glb', import.meta.url).href); }
  catch (error) { renderer.dispose(); throw error; }
  const scene = new THREE.Scene(), group = new THREE.Group(), stopper = new THREE.Group();
  const camera = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, .1, 30);
  camera.position.set(2.3, 2.4, 8); camera.lookAt(0, .25, 0);
  scene.add(group, new THREE.HemisphereLight('#fff9e9', '#9b8263', 2.5));
  const key = new THREE.DirectionalLight('#fff7e6', 3.2); key.position.set(-3, 5, 5); scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', 1.3); fill.position.set(4, 2, -2); scene.add(fill);
  group.add(gltf.scene, stopper);
  // Keep the original Blender geometry and its golden stopper, with a light
  // illustrated shell so visitors can clearly see the changing liquid level.
  gltf.scene.updateMatrixWorld(true);
  const corkParts = [];
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    if (object.name.startsWith('Stopper')) corkParts.push(object);
    if (object.name.includes('hollow_glass') || object.name.includes('hollow glass')) {
      object.material = new THREE.ShaderMaterial({
        transparent:true, depthWrite:false, side:THREE.FrontSide,
        vertexShader:`varying vec3 vN; varying vec3 vView;
          void main(){ vec4 p=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vView=-p.xyz; gl_Position=projectionMatrix*p; }`,
        fragmentShader:`varying vec3 vN; varying vec3 vView;
          void main(){ float edge=pow(1.-abs(dot(normalize(vN),normalize(vView))),2.4);
            vec3 color=mix(vec3(.97,.95,.86),vec3(.22,.21,.16),smoothstep(.38,1.,edge));
            gl_FragColor=vec4(color,.055+edge*.68);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`
      });
      object.renderOrder = 3;
    } else if (object.material) object.material.roughness = .42;
  });
  // Put the pivot inside the cork, not at the flask's origin. A full flip
  // must spin the stopper in place instead of orbiting around the bottle.
  const corkBounds = new THREE.Box3();
  corkParts.forEach(object => corkBounds.expandByObject(object));
  const corkRest = corkBounds.getCenter(new THREE.Vector3());
  stopper.position.copy(corkRest);
  stopper.updateMatrixWorld(true);
  corkParts.forEach(object => stopper.attach(object));
  const liquid = makeLiquid(); group.add(liquid.mesh);
  const bubbles = [];
  const sphere = new THREE.SphereGeometry(1, 16, 10);
  const gold = new THREE.MeshStandardMaterial({color:'#f2c83f',roughness:.36});
  const cream = new THREE.MeshStandardMaterial({color:'#fff8de',roughness:.4});
  for (let i = 0; i < 9; i++) {
    const mesh = new THREE.Mesh(sphere, i % 3 ? cream : gold);
    group.add(mesh); bubbles.push(mesh);
  }
  const pops = [];
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(sphere, i % 2 ? gold : cream);
    group.add(mesh); pops.push(mesh);
  }
  stage.append(renderer.domElement);
  let needsFrameCheck = true, frameVisible = false;
  function resize() {
    const {width, height} = stage.getBoundingClientRect();
    if (!width || !height) return;
    const flightSpace = parseFloat(getComputedStyle(stage).getPropertyValue('--potion-flight-space')) || 0;
    Object.assign(camera, potionFrustum(width, height, flightSpace));
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    needsFrameCheck = true;
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage); resize();
  function draw({amount, wave, time, kick, celebration, reduced}) {
    const idle = reduced ? 0 : Math.sin(time * 1.6) * .018;
    group.rotation.z = reduced ? 0 : idle - wave * .15;
    group.scale.set(1 + kick * .018, 1 - kick * .024, 1 + kick * .018);
    const level = liquid.update(amount, reduced ? 0 : wave, time);
    bubbles.forEach((bubble, i) => {
      const phase = reduced ? (i + 1) / 10 : (time * (.17 + i * .009) + i * .137) % 1;
      const h = .20 + phase * Math.max(.02, level - .24);
      const r = radiusAt(h);
      const x = Math.sin(i * 2.4 + (reduced ? 0 : time * 1.8) + phase) * r * .64;
      // These are intentionally graphic beads sitting against the front wall,
      // like the original logo, so opaque charcoal liquid cannot hide them.
      bubble.position.set(x, h - .95, Math.sqrt(Math.max(0, r*r - x*x)) * .7 + .022);
      const envelope = Math.sin(phase * Math.PI);
      const size = (.024 + (i % 3) * .013) * Math.max(0, envelope);
      bubble.scale.set(size * (1 + .18 * Math.sin(phase * Math.PI * 2)), size * (1 - .12 * Math.sin(phase * Math.PI * 2)), size);
      bubble.visible = amount > .06 && phase < .96 && i < Math.ceil(amount * 9);
    });
    const celebrating = celebration >= 0 && celebration < 2.5;
    const cork = reduced ? {lift:0, turn:0} : corkPose(celebration);
    stopper.position.copy(corkRest);
    stopper.position.y += cork.lift;
    stopper.rotation.z = cork.turn;
    pops.forEach((bubble, i) => {
      const t = celebration - i * .07;
      bubble.visible = !reduced && celebrating && t > 0 && t < 1.5;
      bubble.position.set(Math.sin(i * 2.4) * t * .52, 1.12 + t * 1.25 - t*t*.6, .12 + Math.cos(i * 2.4) * t * .22);
      const size = (.04 + i % 3 * .013) * Math.max(0, 1 - t / 1.5);
      bubble.scale.set(size * (1 + t * .3), size * (1 - Math.min(.4, t*.2)), size);
    });
    renderer.render(scene, camera);
    // A successful render() call does not prove a mobile GPU drew the model.
    // Verify once after setup/resize/restoration, never on every animation frame.
    if (needsFrameCheck) {
      const gl = renderer.getContext();
      if (gl.isContextLost()) return false;
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      frameVisible = pixels.some((value, i) => i % 4 === 3 && value > 32);
      needsFrameCheck = false;
    }
    return frameVisible;
  }
  return {draw, resize, canvas:renderer.domElement};
}

export function mountContactPotion(container, form, {sent = false} = {}) {
  if (!container) return;
  const stage = container.querySelector('.potion-stage');
  const caption = container.querySelector('.potion-caption');
  const demoButton = container.querySelector('.potion-trigger');
  const fallbackLiquid = container.querySelector('.potion-fallback-liquid');
  const fields = ['name','email','message'].map(name => form.elements.namedItem(name));
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const captions = ['A little idea. A little alchemy.', 'First ingredient, in.', 'Something good is brewing.', 'Your potion is ready to send.'];
  let bottle, loading = false, inView = false, raf = 0, last = 0, contextLost = false, emptyFrame = false;
  container.dataset.renderState = 'loading';
  let target = 0, amount = 0, velocity = 0, impulse = 0, changedAt = 0, celebrationAt = -Infinity;
  let demoTimers = [], demoActive = false;
  function wake() { if (!raf && !contextLost && !emptyFrame && inView && !document.hidden) raf = requestAnimationFrame(frame); }
  function setIngredients(complete, success = false, demo = false) {
    const count = complete.filter(Boolean).length;
    const next = count / 3;
    if (next !== target) { impulse = next > target ? 1 : -.65; changedAt = performance.now() / 1000; }
    target = next;
    container.dataset.fill = String(count);
    container.dataset.state = success ? 'success' : demo ? 'demo' : 'editing';
    const message = success ? (demo ? 'Just like that. A little magic.' : 'Your idea is brewing. Thank you!') : captions[count];
    if (caption.textContent !== message) caption.textContent = message;
    if (success) celebrationAt = performance.now() / 1000;
    const y = 49 - next * 22;
    fallbackLiquid.setAttribute('d', `M7 ${y} Q16 ${y-2} 24 ${y} T41 ${y} V54 H7Z`);
    fallbackLiquid.style.visibility = count ? 'visible' : 'hidden';
    wake();
  }
  function sync() { setIngredients(sent ? [true,true,true] : fields.map(field => !!field.value.trim() && field.validity.valid), sent); }
  function stopDemo() {
    demoTimers.forEach(clearTimeout); demoTimers = []; demoActive = false;
    demoButton.setAttribute('aria-label', 'Preview the potion animation'); celebrationAt = -Infinity; sync();
  }
  function demo() {
    if (demoActive) { stopDemo(); return; }
    demoActive = true; demoButton.setAttribute('aria-label', 'Stop potion preview'); celebrationAt = -Infinity;
    setIngredients([false,false,false], false, true);
    const step = (delay, callback) => demoTimers.push(setTimeout(callback, delay));
    step(600, () => setIngredients([true,false,false], false, true));
    step(1600, () => setIngredients([true,true,false], false, true));
    step(2700, () => setIngredients([true,true,true], false, true));
    step(4000, () => setIngredients([true,true,true], true, true));
    step(7000, stopDemo);
  }
  function frame(now) {
    raf = 0;
    if (contextLost || !inView || document.hidden) return;
    const dt = Math.min((now - (last || now)) / 1000, .04); last = now;
    const time = now / 1000, elapsed = time - changedAt;
    if (preference.matches) { amount = target; velocity = 0; }
    else {
      velocity += ((target - amount) * 55 - velocity * 11) * dt;
      amount = clamp(amount + velocity * dt, 0, 1.04);
    }
    const kick = preference.matches ? 0 : impulse * Math.exp(-elapsed * 2.0) * Math.sin(elapsed * 9);
    const wave = preference.matches ? 0 : clamp(kick * .23 + Math.sin(time * 2.3) * .038, -.2, .2) * Math.min(amount * 5, 1);
    if (bottle) {
      const drawn = bottle.draw({amount, wave, time, kick, celebration:time-celebrationAt, reduced:preference.matches});
      emptyFrame = !drawn;
      container.classList.toggle('is-ready', drawn && !contextLost);
      container.dataset.renderState = drawn ? 'ready' : 'fallback';
    }
    // Reduced motion renders on input/resize only. Offscreen/hidden scenes stop.
    if (bottle && !preference.matches) wake();
  }
  async function load() {
    if (loading || bottle) return;
    loading = true;
    try {
      bottle = await createBottle(stage);
      contextLost = bottle.canvas.getContext('webgl2').isContextLost();
      if (sent) { target = amount = 1; velocity = 0; celebrationAt = performance.now()/1000; }
      bottle.canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault(); contextLost = true;
        container.classList.remove('is-ready'); container.dataset.renderState = 'recovering'; cancelAnimationFrame(raf); raf = 0;
      });
      bottle.canvas.addEventListener('webglcontextrestored', () => {
        contextLost = false; emptyFrame = false; last = 0; bottle.resize(); wake();
      });
      wake();
    } catch (error) { container.dataset.renderState = 'fallback'; console.warn('Interactive potion uses the SVG fallback.', error); }
    finally { loading = false; }
  }
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) { last = 0; emptyFrame = false; bottle?.resize(); load(); wake(); }
    else { cancelAnimationFrame(raf); raf = 0; }
  }, {threshold:.01});
  observer.observe(container);
  new ResizeObserver(() => { emptyFrame = false; wake(); }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) {cancelAnimationFrame(raf); raf=0;} else {last=0; emptyFrame=false; bottle?.resize(); wake();} });
  preference.addEventListener('change', wake);
  for (const field of fields) {
    for (const event of ['input','change']) field.addEventListener(event, () => { sent = false; if (demoActive) stopDemo(); else sync(); });
  }
  form.addEventListener('reset', () => { sent = false; setTimeout(stopDemo, 0); });
  demoButton.addEventListener('click', demo);
  window.addEventListener('pageshow', () => { emptyFrame = false; bottle?.resize(); sync(); wake(); });
  sync();
  if (sent) setIngredients([true,true,true], true);
}
