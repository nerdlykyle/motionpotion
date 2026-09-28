import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { createPainterlyPass } from './painterly.js';
import { createBlinkController, createGazeController, createQuiffController } from './character-motion.js';

// Preserve Blender's bind transforms, including bone roll and eye origins.
function poseControl(node) {
  const parentWorld = node.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
  const inverseParent = parentWorld.clone().invert();
  const baseQuaternion = node.quaternion.clone();
  const basePosition = node.position.clone();
  const liftAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(inverseParent);
  const worldDelta = new THREE.Quaternion(), localDelta = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  return {
    rotate(pitch = 0, yaw = 0, roll = 0) {
      worldDelta.setFromEuler(euler.set(pitch, yaw, roll));
      localDelta.copy(inverseParent).multiply(worldDelta).multiply(parentWorld);
      node.quaternion.copy(localDelta).multiply(baseQuaternion);
    },
    lift(amount = 0) { node.position.copy(basePosition).addScaledVector(liftAxis, amount); },
  };
}

function lidControl(root) {
  const meshes = [];
  root.traverse(node => {
    const blink = node.morphTargetDictionary?.Blink;
    const arc = node.morphTargetDictionary?.BlinkArc;
    if (blink !== undefined && arc !== undefined) meshes.push({ node, blink, arc });
  });
  if (!meshes.length) throw new Error(`Missing eyelid morphs: ${root.name}`);
  return closure => {
    const t = THREE.MathUtils.clamp(closure, 0, 1);
    for (const { node, blink, arc } of meshes) {
      node.morphTargetInfluences[blink] = t;
      node.morphTargetInfluences[arc] = 4 * t * (1 - t);
    }
  };
}

export async function createCharacter(container, { paused = false } = {}) {
  const touch = matchMedia('(pointer: coarse)');
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:!touch.matches, powerPreference:'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch.matches ? 1.25 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-.32, .32, .32, -.32, .01, 10);
  camera.position.set(0, .218, 2);
  camera.lookAt(0, .218, 0);
  // Match the lighting and paint settings approved in the character review.
  scene.add(new THREE.HemisphereLight(0xfff8ed, 0x697a70, 2.1));
  const key = new THREE.DirectionalLight(0xffebd4, 3);
  key.position.set(-1.2, 1.8, 2.2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdce8ff, 1.1);
  fill.position.set(1.5, .45, 1); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff7e4, 1.7);
  rim.position.set(.3, 1.2, -1.2); scene.add(rim);

  function releaseScene() {
    const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    scene.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.skeleton) skeletons.add(node.skeleton);
      for (const material of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    geometries.forEach(geometry => geometry.dispose());
    skeletons.forEach(skeleton => skeleton.dispose());
    textures.forEach(texture => { texture.source?.data?.close?.(); texture.dispose(); });
    renderer.dispose(); renderer.domElement.remove();
  }

  let head, quiff, eyes, brows, lids, painterly;
  try {
    const gltf = await new GLTFLoader().loadAsync(new URL('./assets/models/kyle-prism-v2-web.glb', import.meta.url).href);
    const normalizer = new THREE.Group(); normalizer.rotation.y = -Math.PI / 2;
    scene.add(normalizer); normalizer.add(gltf.scene);
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      node.frustumCulled = false;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material?.map) material.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      }
    });
    scene.updateMatrixWorld(true);
    const find = name => {
      const node = gltf.scene.getObjectByName(name);
      if (!node) throw new Error(`Missing Prism v2 control: ${name}`);
      return node;
    };
    head = poseControl(find('Head')); quiff = poseControl(find('Quiff'));
    eyes = [poseControl(find('Eye_L')), poseControl(find('Eye_R'))];
    brows = [poseControl(find('Brow_L')), poseControl(find('Brow_R'))];
    lids = {
      upperLeft:lidControl(find('UpperLid_L')), upperRight:lidControl(find('UpperLid_R')),
      lowerLeft:lidControl(find('LowerLid_L')), lowerRight:lidControl(find('LowerLid_R')),
    };
    painterly = createPainterlyPass(renderer, scene, camera, { strength:1, brushScale:1.4 });
  } catch (error) { releaseScene(); throw error; }
  container.append(renderer.domElement);
  container.dataset.model = 'prism-v2-approved';
  container.dataset.painterly = painterly.mode;
  const blink = createBlinkController(), gaze = createGazeController(), hair = createQuiffController();
  const pointer = new THREE.Vector2();
  let visible = true, alive = true, frameId, lastFrame = 0, time = 0, greeting = -10;
  let pitch = 0, yaw = 0, quiffPeak = 0, lastPoseWrite = 0;
  let contextLost = renderer.getContext().isContextLost();
  let lastScrollY = window.scrollY, scrollDrive = 0;

  function followScroll() {
    const y = Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - innerHeight));
    const distance = y - lastScrollY; lastScrollY = y;
    if ((!touch.matches && innerWidth > 760) || paused || !visible) return;
    if (Math.abs(distance) > .1) scrollDrive = THREE.MathUtils.clamp(scrollDrive + distance * .0035, -.27, .31);
  }
  function setPointer(event) {
    if (paused || touch.matches || event.pointerType === 'touch') return;
    const rect = container.getBoundingClientRect();
    pointer.set(
      THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1),
      THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1)
    );
  }
  const resetPointer = () => pointer.set(0, 0);
  window.addEventListener('scroll', followScroll, { passive:true });
  window.addEventListener('pointermove', setPointer, { passive:true });
  window.addEventListener('pointerdown', setPointer, { passive:true });
  document.documentElement.addEventListener('pointerleave', resetPointer);
  window.addEventListener('blur', resetPointer);

  function render() {
    if (contextLost || renderer.getContext().isContextLost()) return;
    painterly.render();
    container.classList.add('is-ready');
    if (container.parentElement) container.parentElement.dataset.renderState = 'ready';
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height;
    const span = Math.max(.64, .43 / aspect);
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
    camera.top = span / 2; camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); painterly.resize(width, height); render();
  }
  function stop() {
    if (frameId !== undefined) cancelAnimationFrame(frameId);
    frameId = undefined;
    hair.reset(); gaze.reset({pitch, yaw}); blink.reset(); quiff.rotate();
    for (const lid of Object.values(lids)) lid(0);
    brows.forEach(brow => brow.lift(0));
    eyes.forEach(eye => eye.rotate());
    scrollDrive = 0; greeting = -10;
  }
  function start() {
    if (alive && !contextLost && !paused && visible && !document.hidden && frameId === undefined) {
      lastFrame = performance.now(); frameId = requestAnimationFrame(draw);
    }
  }
  function draw(now) {
    frameId = undefined;
    if (!alive || contextLost || paused || !visible || document.hidden) return;
    if (touch.matches && now - lastFrame < 1000 / 30) { frameId = requestAnimationFrame(draw); return; }
    const dt = THREE.MathUtils.clamp((now - lastFrame) / 1000, .001, .05);
    lastFrame = now; time += dt;
    scrollDrive *= Math.exp(-2.2 * dt);
    const pose = gaze.update(THREE.MathUtils.clamp(pointer.y * .21 + scrollDrive, -.33, .4), pointer.x * .35, dt);
    const hello = time - greeting;
    const nod = hello >= 0 && hello < 1.5 ? Math.sin(hello * Math.PI * 4) * .055 * (1 - hello / 1.5) : 0;
    const nextPitch = pose.pitch + nod;
    const hairPose = hair.update((nextPitch - pitch) / dt, (pose.yaw - yaw) / dt, dt);
    pitch = nextPitch; yaw = pose.yaw;
    head.rotate(pitch, yaw, -yaw * .06);
    quiff.rotate(hairPose.pitch, hairPose.yaw, hairPose.roll);
    eyes.forEach(eye => eye.rotate(pose.eyePitch, pose.eyeYaw));
    const closure = blink.update(dt);
    for (const [name, lid] of Object.entries(lids)) lid(closure[name]);
    brows[0].lift(-closure.browLeft * .00075); brows[1].lift(-closure.browRight * .00075);
    quiffPeak = Math.max(quiffPeak, Math.abs(hairPose.pitch), Math.abs(hairPose.yaw), Math.abs(hairPose.roll));
    if (now - lastPoseWrite > 100) {
      container.dataset.headPose = `${pitch.toFixed(3)},${yaw.toFixed(3)}`;
      container.dataset.eyePose = `${pose.eyePitch.toFixed(3)},${pose.eyeYaw.toFixed(3)}`;
      container.dataset.blink = closure.upperLeft.toFixed(3);
      container.dataset.quiffPose = [hairPose.pitch,hairPose.yaw,hairPose.roll].map(angle => angle.toFixed(4)).join(',');
      container.dataset.quiffPeak = quiffPeak.toFixed(4); lastPoseWrite = now;
    }
    render(); frameId = requestAnimationFrame(draw);
  }
  function onContextLost(event) {
    event.preventDefault(); contextLost = true; stop();
    container.classList.remove('is-ready');
    container.parentElement.dataset.renderState = 'recovering';
  }
  function onContextRestored() { contextLost = false; resize(); start(); }
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
  const visibilityObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { lastScrollY = window.scrollY; render(); start(); } else stop();
  }, { threshold:.05 });
  visibilityObserver.observe(container);
  const onVisibility = () => { if (document.hidden) stop(); else { resize(); start(); } };
  window.addEventListener('pageshow', onVisibility);
  document.addEventListener('visibilitychange', onVisibility);
  resize(); start();
  return {
    setPaused(value) { paused = value; if (paused) { stop(); render(); } else start(); },
    greet() { if (!paused) { greeting = time; } },
    // Used by the local authoring page to export a matching transparent fallback.
    capturePoster() { render(); return new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/png')); },
    dispose() {
      alive = false; stop(); resizeObserver.disconnect(); visibilityObserver.disconnect();
      window.removeEventListener('scroll', followScroll); window.removeEventListener('pageshow', onVisibility);
      window.removeEventListener('pointermove', setPointer); window.removeEventListener('pointerdown', setPointer);
      document.documentElement.removeEventListener('pointerleave', resetPointer); window.removeEventListener('blur', resetPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      painterly.dispose(); releaseScene();
    }
  };
}
