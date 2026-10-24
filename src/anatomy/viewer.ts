import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './anatomy.css';
import { AnatomyWorm } from './model';
import { LabelLayer } from './labels';
import { buildPanel } from './panel';
import { Selection } from './select';
import { viewById, type View } from './views';
import { BristleScene } from './bristles/scene';
import { BristleOverlay } from './bristles/overlay';
import { ZoomBar } from './zoom';

/**
 * The anatomy viewer (`?anatomy=1`): the full nightcrawler model in a clean studio, like a
 * medical atlas. `&view=<id>` opens a preset (views.ts). Sets data-anatomy-ready on <body> once
 * the first frame is drawn (screenshots, tests).
 */
/** Starts the viewer. Its controls (Views, Layers, Parts) come back to go in the page's slide-out menu. */
export function startAnatomyViewer(app: HTMLElement, search: string): { controls: HTMLElement | null } {
  const params = new URLSearchParams(search);
  const root = document.createElement('div');
  root.className = 'anatomy';
  root.style.cssText = 'position:fixed;inset:0;background:#e4e8ec;';
  app.appendChild(root);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = studioBackdrop();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.16).texture;
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xfff4ea, 2.1);
  key.position.set(-30, 60, 50);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  fill.position.set(50, 10, 40);
  const rim = new THREE.DirectionalLight(0xffffff, 1.4);
  rim.position.set(10, 30, -60);
  // A soft bounce from below, so the pale belly reads pale when the worm is turned over.
  const under = new THREE.DirectionalLight(0xfff1e6, 0.55);
  under.position.set(10, -50, 30);
  scene.add(key, fill, rim, under, new THREE.HemisphereLight(0xffffff, 0xd6c6bc, 0.45));

  // `&detail=game` shows the light outside-only worm the game uses.
  const worm = new AnatomyWorm(params.get('detail') === 'game' ? 'game' : 'full');
  scene.add(worm.group);
  const shadow = contactShadow();
  scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.5, 2000);
  // Studio quality: ambient occlusion (soft contact shadows) and 4x multisampling. `&ao=0` turns
  // it off for slow computers.
  const composer = params.get('ao') === '0' ? null : studioComposer(renderer, scene, camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // Labels and buttons (`&ui=0` hides both, for clean pictures).
  const ui = params.get('ui') !== '0';
  let selection: Selection | null = null;
  const labels = new LabelLayer(worm, camera, (id) => selection?.select(id));
  if (ui) root.appendChild(labels.root);
  let dirty = true;
  const redraw = () => { dirty = true; };
  selection = new Selection(worm, labels, camera, controls);
  let current: View = viewById(params.get('view'));

  // The bristle close-up and crawl (src/anatomy/bristles/), built the first time one is opened.
  let bristles: BristleScene | null = null;
  const bristleUi = new BristleOverlay(() => { dirty = true; });
  if (ui) root.appendChild(bristleUi.root);
  // The zoom bar is made just after `show`, which resets it to each new view.
  let zoom: ZoomBar | undefined;
  const show = (view: View): void => {
    if (view.bristles && !bristles) {
      bristles = new BristleScene();
      scene.add(bristles.group);
      renderer.compile(scene, camera);
    }
    worm.group.visible = shadow.visible = !view.bristles;
    if (bristles) bristles.group.visible = !!view.bristles;
    if (view.bristles) bristles?.setMode(view.bristles);
    bristleUi.show(view.bristles ?? null);
    labels.set(view.labels);
    worm.pose(view.pose);
    worm.setWall(view.wall);
    current = view;
    selection?.clear();
    for (const s of ['skin', 'muscles', 'gut', 'blood', 'nerves', 'repro', 'nephridia'] as const) {
      worm.setFade(s, view.systems.includes(s) ? 1 : 0);
    }
    camera.position.set(...view.camera);
    controls.target.set(...view.target);
    // The views are framed for a wide screen; a tall, narrow one (a phone) steps back to fit.
    if (!view.fit && camera.aspect < 1.3) {
      camera.position.sub(controls.target).multiplyScalar(Math.min(2.6, 1.3 / camera.aspect)).add(controls.target);
    }
    if (view.fit) {
      const box = new THREE.Box3().setFromObject(worm.group);
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const dir = camera.position.clone().sub(controls.target).normalize();
      const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      // Fit the body's length across the screen's width, with a margin.
      const dist = Math.max(size.x / 2 / (half * camera.aspect), size.z / 2 / half) * 1.12 + size.y;
      controls.target.copy(centre);
      camera.position.copy(centre).addScaledVector(dir, dist);
    }
    // The soft shadow sits just under the posed body.
    if (view.bristles) {
      controls.update();
      zoom?.reset();
      return;
    }
    const box = new THREE.Box3().setFromObject(worm.group);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    shadow.position.set(c.x, box.min.y - 0.6, c.z);
    shadow.scale.set(size.x * 1.15 + 8, size.z * 1.6 + 10, 1);
    controls.update();
    zoom?.reset();
  };
  zoom = new ZoomBar(camera, controls, () => { dirty = true; });
  if (ui) root.appendChild(zoom.el);
  show(current);
  const built = ui ? buildPanel(worm, {
    pick: show,
    select: (id) => selection.select(id, undefined, true),
    reset: () => {
      for (const s of ['skin', 'muscles', 'gut', 'blood', 'nerves', 'repro', 'nephridia'] as const) worm.setFade(s, current.systems.includes(s) ? 1 : 0);
    },
    changed: redraw,
    labels,
  }) : null;
  // The controls live in the slide-out menu (Matt, 2026-10-24: so they can be hidden); pageMenu.ts places them.
  const panel = built?.el ?? null;
  const narrow = (): boolean => window.innerWidth <= 700;
  /** How far right the open menu reaches (0 when it is shut, or on a phone, where it covers the worm). */
  const menuRight = (): number => {
    const r = panel?.getBoundingClientRect();
    return r && r.width > 0 && !narrow() ? r.right : 0;
  };
  selection.changed = () => { built?.sync(); frame(); };
  // A tap (not a drag) on the worm selects the part under the finger.
  let down: { x: number; y: number } | null = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (ui && down && !bristles?.group.visible && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) selection.tap(e.clientX, e.clientY, renderer.domElement);
    down = null;
  });
  // On a wide screen the buttons sit on the left: centre the worm in the space beside them.
  const panelSide = menuRight;
  /** On a phone: where the sheet along the bottom (a part's card) starts. */
  const sheetTop = (): number => {
    if (!narrow()) return window.innerHeight;
    let top = window.innerHeight;
    for (const e of root.querySelectorAll<HTMLElement>('.anatomy-card')) {
      const r = e.getBoundingClientRect();
      if (r.height > 0) top = Math.min(top, r.top);
    }
    // The bristle views' box sits along the bottom too, and the picture fits above it.
    const box = bristleUi.root.hidden ? null : bristleUi.root.querySelector('.bristle-box');
    if (box) top = Math.min(top, box.getBoundingClientRect().top);
    return top;
  };
  const frame = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const right = menuRight();
    const side = right ? right + 32 : 0;
    const below = h - sheetTop();
    // Shift the picture and shrink it to fit the space beside the buttons (or above the sheet).
    camera.zoom = side ? (w - side) / w : below > 0 ? (h - below) / h : 1;
    if (side) camera.setViewOffset(w, h, -side / 2, 0, w, h);
    else if (below > 0) camera.setViewOffset(w, h, 0, below / 2, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    redraw();
  };
  frame();
  // The menu opening, closing or changing page moves the picture.
  if (panel) new ResizeObserver(() => frame()).observe(panel);
  panel?.addEventListener('click', () => requestAnimationFrame(frame));
  // &cam=x,y,z&at=x,y,z: any camera (review screenshots).
  const vec = (k: string) => params.get(k)?.split(',').map(Number);
  const cam = vec('cam');
  const at = vec('at');
  if (cam?.length === 3 && at?.length === 3) {
    camera.position.set(cam[0], cam[1], cam[2]);
    controls.target.set(at[0], at[1], at[2]);
    controls.update();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setSize(window.innerWidth, window.innerHeight);
    frame();
  });
  // Draws only when something moved: the model is heavy, and a still view costs nothing.
  controls.addEventListener('change', () => { dirty = true; });
  window.addEventListener('resize', () => { dirty = true; });
  let frames = 0;
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    if (selection.tick(dt)) dirty = true;
    last = now;
    if (bristles?.group.visible && bristleUi.playing) {
      bristles.update(dt * bristleUi.speed);
      dirty = true;
    }
    controls.update();
    if (!dirty) return;
    dirty = false;
    if (composer) composer.render();
    else renderer.render(scene, camera);
    if (ui) labels.update(window.innerWidth, window.innerHeight, panelSide(), sheetTop());
    if (ui && bristles?.group.visible) bristleUi.update(bristles, camera, window.innerWidth, window.innerHeight);
    if (++frames === 1) {
      // Every see-through and glowing variant compiles now, so sliders never stall later.
      if (worm.detail === 'full') worm.precompile(renderer, scene, camera);
      document.body.dataset.anatomyReady = '1';
      (window as unknown as { anatomyStats: unknown }).anatomyStats = worm.stats();
    }
  });
  return { controls: panel };
}

/** A soft, blurred shadow under the worm (a texture on a flat card: no shadow maps, no extra pass). */
function contactShadow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 32, 4, 128, 32, 128);
  grad.addColorStop(0, 'rgba(40,30,30,0.38)');
  grad.addColorStop(0.5, 'rgba(40,30,30,0.16)');
  grad.addColorStop(1, 'rgba(40,30,30,0)');
  g.setTransform(1, 0, 0, 0.25, 0, 24);
  g.fillStyle = grad;
  g.fillRect(0, -96, 256, 256);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -1;
  return m;
}

/** A soft light-grey studio backdrop, brighter behind the model. */
function studioBackdrop(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#d5dbe1');
  grad.addColorStop(0.45, '#eef1f4');
  grad.addColorStop(1, '#c4ccd4');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function studioComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): EffectComposer {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, w, h);
  ao.updateGtaoMaterial({ radius: 2.0, distanceExponent: 1.4, thickness: 2.0, scale: 1.25, samples: 16 });
  ao.updatePdMaterial({ radius: 6, rings: 2, samples: 16 });
  ao.blendIntensity = 1;
  // See-through layers (the ghost skin, septa, sacs) cast no occlusion.
  const hide = ao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
  const base = hide._overrideVisibility.bind(ao);
  hide._overrideVisibility = () => {
    base();
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (o.visible && m && !Array.isArray(m) && m.transparent) {
        o.visible = false;
        hide._visibilityCache.push(o);
      }
    });
  };
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return composer;
}
