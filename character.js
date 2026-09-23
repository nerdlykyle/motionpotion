import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { createPainterlyPass } from './painterly.js';
import { quiffWeight, createQuiffMotion } from './quiff.js';

// The website uses a lighter copy of Kyle's original sculpt. This small preview
// skeleton is created in memory; it does not change the editable source model.
export async function createCharacter(container, { paused = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.setAttribute('aria-hidden', 'true');

  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(new URL('./assets/models/kyle-original-web.glb', import.meta.url).href);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-.32, .32, .32, -.32, .01, 10);
  camera.position.set(0, .218, 2);
  camera.lookAt(0, .218, 0);
  scene.add(new THREE.HemisphereLight(0xfff7ed, 0x778279, 2.3));
  const key = new THREE.DirectionalLight(0xfff5e9, 2.5);
  key.position.set(-.7, 1.3, 2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xe6e8ff, .9);
  fill.position.set(1.5, .5, 1); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe6aa, 1.1);
  rim.position.set(-1, 1.5, -1); scene.add(rim);

  // Reflections give the rebuilt eyes a real catchlight instead of a painted dot.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#777d76');
  function softbox(position, width, height, color) {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    box.position.set(...position); box.lookAt(0, 0, 0); studio.add(box);
  }
  softbox([-1.5, 2, 4], 1.2, 1.6, 0xffffff);
  softbox([3, 1, 2], 1, 3, 0xc9cbd4);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, .035, .1, 10);
  scene.environment = environment.texture;
  pmrem.dispose();
  studio.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });

  const portrait = new THREE.Group(); scene.add(portrait);
  const bodyBone = new THREE.Bone(); bodyBone.name = 'PreviewBody';
  const headBone = new THREE.Bone(); headBone.name = 'PreviewHead';
  headBone.position.set(0, .155, 0); bodyBone.add(headBone);
  const quiffBone = new THREE.Bone(); quiffBone.name = 'PreviewQuiff';
  quiffBone.position.set(0, .390 - .155, .025);
  quiffBone.rotation.order = 'YXZ'; headBone.add(quiffBone);
  const normalize = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  gltf.scene.updateMatrixWorld(true);
  const eyeGroups = new Map();
  for (const name of ['Eye_L', 'Eye_R']) {
    const source = gltf.scene.getObjectByName(name);
    const center = source ? source.getWorldPosition(new THREE.Vector3()).applyMatrix4(normalize)
      : new THREE.Vector3(name === 'Eye_L' ? .0437 : -.0437, .3056, .0638);
    const group = source ? new THREE.Group() : new THREE.Bone();
    group.name = `${name}_Gaze`; group.position.copy(center).sub(headBone.position);
    headBone.add(group); eyeGroups.set(name, { group, center });
  }
  let skinnedBody;
  const previewBones = [bodyBone, headBone, ...[...eyeGroups.values()].map(e => e.group).filter(g => g.isBone), quiffBone];
  const quiffIndex = previewBones.indexOf(quiffBone);
  gltf.scene.traverse(source => {
    if (!source.isMesh) return;
    const geometry = source.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, source.matrixWorld));
    const material = source.material;
    for (const m of Array.isArray(material) ? material : [material]) {
      m.envMapIntensity = source.name.startsWith('Eye') ? .75 : .25;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
        if (m[key]) m[key].anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      }
    }
    let ancestor = source, eyeName;
    while (ancestor) {
      if (eyeGroups.has(ancestor.name)) { eyeName = ancestor.name; break; }
      ancestor = ancestor.parent;
    }
    if (eyeName) {
      const { group, center } = eyeGroups.get(eyeName);
      geometry.translate(-center.x, -center.y, -center.z);
      group.add(new THREE.Mesh(geometry, material));
    } else if (source.name.startsWith('Kyle_Body')) {
      const position = geometry.attributes.position;
      const indices = new Uint16Array(position.count * 4);
      const weights = new Float32Array(position.count * 4);
      for (let i = 0; i < position.count; i++) {
        const headWeight = THREE.MathUtils.smoothstep(position.getY(i), .145, .205);
        indices[i * 4 + 1] = 1;
        weights[i * 4] = 1 - headWeight;
        weights[i * 4 + 1] = headWeight;
        // The original sculpt has fused eyes. Local preview bones turn these
        // regions gently; the source GLB and Blender mesh stay unrigged.
        let boneIndex = 2;
        for (const {group, center} of eyeGroups.values()) {
          if (group.isBone) {
            const q = ((position.getX(i)-center.x)/.0274)**2 + ((position.getY(i)-center.y)/.026)**2;
            const eyeWeight = (1-THREE.MathUtils.smoothstep(q,.6,1.12)) * THREE.MathUtils.smoothstep(position.getZ(i),.058,.083) * headWeight;
            indices[i*4+boneIndex]=boneIndex;
            weights[i*4+boneIndex]=eyeWeight;
            weights[i*4+1]-=eyeWeight;
          }
          boneIndex++;
        }
        const hairWeight = quiffWeight(position.getX(i), position.getY(i), position.getZ(i));
        if (hairWeight > 0) {
          // Hair is above the eyes, so its spare influence slot is unoccupied.
          indices[i * 4 + 2] = quiffIndex;
          weights[i * 4 + 2] = hairWeight;
          weights[i * 4 + 1] -= hairWeight;
        }
      }
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
      skinnedBody = new THREE.SkinnedMesh(geometry, material);
      skinnedBody.add(bodyBone); portrait.add(skinnedBody);
      skinnedBody.bind(new THREE.Skeleton(previewBones));
      // Head movement can extend beyond the static geometry bounds.
      skinnedBody.frustumCulled = false;
    } else {
      portrait.add(new THREE.Mesh(geometry, material));
    }
    source.geometry.dispose();
  });
  if (!skinnedBody) throw new Error('The original body could not be found.');
  const painterly = createPainterlyPass(renderer, scene, camera);
  container.dataset.painterly = 'position-tracked-render-filter';
  const quiffMotion = createQuiffMotion();
  let quiffPeak = 0;

  const pointer = new THREE.Vector2();
  let visible = true, alive = true, frameId, lastFrame = 0, time = 0, greeting = -10;
  let lastPoseWrite = 0;
  function setPointer(event) {
    if (paused) return;
    if (event.pointerType === 'touch' && !container.contains(event.target)) return;
    const rect = container.getBoundingClientRect();
    pointer.set(
      THREE.MathUtils.clamp((event.clientX - rect.left - rect.width * .5) / (rect.width * .85), -1, 1),
      THREE.MathUtils.clamp((event.clientY - rect.top - rect.height * .34) / (rect.height * .8), -1, 1)
    );
  }
  const resetPointer = () => pointer.set(0, 0);
  window.addEventListener('pointermove', setPointer, { passive: true });
  window.addEventListener('pointerdown', setPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', resetPointer);
  window.addEventListener('blur', resetPointer);
  function render() { painterly.render(); }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height;
    const span = Math.max(.64, .43 / aspect);
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
    camera.top = span / 2; camera.bottom = -span / 2;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false); painterly.resize(width,height); render();
  }
  function stop() {
    if (frameId !== undefined) cancelAnimationFrame(frameId);
    frameId = undefined; quiffMotion.reset(); quiffBone.rotation.set(0, 0, 0);
  }
  function start() {
    if (alive && !paused && visible && !document.hidden && frameId === undefined) {
      lastFrame = performance.now(); frameId = requestAnimationFrame(draw);
    }
  }
  function draw(now) {
    frameId = undefined;
    if (!alive || paused || !visible || document.hidden) return;
    const delta = Math.min((now - lastFrame) / 1000, .05); lastFrame = now; time += delta;
    const ease = 1 - Math.exp(-delta * 7);
    const hello = time - greeting;
    const nod = hello < 1.5 ? Math.sin(hello * Math.PI * 4) * .055 * (1 - hello / 1.5) : 0;
    const previousPitch = headBone.rotation.x, previousYaw = headBone.rotation.y;
    headBone.rotation.order = 'YXZ';
    headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, pointer.x * .22, ease);
    headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, pointer.y * .14 + nod, ease);
    headBone.rotation.z = THREE.MathUtils.lerp(headBone.rotation.z, -pointer.x * .022 + Math.sin(time * .65) * .006, ease);
    const hair = quiffMotion.update(
      (headBone.rotation.x - previousPitch) / Math.max(delta, .001),
      (headBone.rotation.y - previousYaw) / Math.max(delta, .001), delta);
    quiffBone.rotation.set(hair[0].angle, hair[1].angle, hair[2].angle);
    quiffPeak = Math.max(quiffPeak, ...hair.map(axis => Math.abs(axis.angle)));
    for (const { group } of eyeGroups.values()) {
      group.rotation.order = 'YXZ';
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, pointer.x * .15, ease);
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, pointer.y * .105, ease);
    }
    if (now - lastPoseWrite > 200) {
      container.dataset.headPose = `${headBone.rotation.x.toFixed(3)},${headBone.rotation.y.toFixed(3)}`;
      const eye = eyeGroups.get('Eye_L').group;
      container.dataset.eyePose = `${eye.rotation.x.toFixed(3)},${eye.rotation.y.toFixed(3)}`;
      container.dataset.quiffPose = hair.map(axis => axis.angle.toFixed(4)).join(',');
      container.dataset.quiffPeak = quiffPeak.toFixed(4);
      lastPoseWrite = now;
    }
    render(); frameId = requestAnimationFrame(draw);
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
  const visibilityObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting; if (visible) start(); else stop();
  }, { threshold: .05 });
  visibilityObserver.observe(container);
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVisibility);
  resize(); start();
  return {
    setPaused(value) { paused = value; if (paused) { stop(); render(); } else start(); },
    greet() {
      if (paused) return;
      greeting = time;
    },
    dispose() {
      alive = false; stop(); resizeObserver.disconnect(); visibilityObserver.disconnect();
      window.removeEventListener('pointermove', setPointer); window.removeEventListener('pointerdown', setPointer);
      document.documentElement.removeEventListener('pointerleave', resetPointer); window.removeEventListener('blur', resetPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      const materials = new Set(), textures = new Set();
      scene.traverse(o => {
        o.geometry?.dispose();
        for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) materials.add(m);
      });
      for (const m of materials) { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); m.dispose(); }
      for (const texture of textures) { texture.source?.data?.close?.(); texture.dispose(); }
      painterly.dispose(); skinnedBody.skeleton.dispose(); environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    }
  };
}
