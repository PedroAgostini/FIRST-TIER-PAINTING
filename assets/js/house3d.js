// Repaint section: a New England colonial that goes from weathered to finished as you scroll.
const section = document.querySelector('[data-repaint]');
const canvas = document.querySelector('[data-house]');
const stageItems = [...document.querySelectorAll('[data-stages] li')];
const stageBar = document.querySelector('[data-stage-bar]');
const swatchBtns = [...document.querySelectorAll('[data-swatches] button')];
const swatchName = document.querySelector('[data-swatch-name]');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = { target: reduce ? 1 : 0, p: reduce ? 1 : 0, color: '#3363AC', api: null };
let trigger = null;

function setStageUI(p) {
  const idx = p < 0.2 ? 0 : p < 0.45 ? 1 : p < 0.7 ? 2 : 3;
  stageItems.forEach((li, i) => {
    li.classList.toggle('is-on', i <= idx);
    li.toggleAttribute('aria-current', i === idx);
  });
  if (stageBar) stageBar.style.width = `${(p * 100).toFixed(1)}%`;
}

/* Swatches */
swatchBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    swatchBtns.forEach((b) => { b.setAttribute('aria-checked', String(b === btn)); b.tabIndex = b === btn ? 0 : -1; });
    swatchName.textContent = btn.dataset.name;
    state.color = btn.dataset.color;
    if (state.api) state.api.setColor(state.color);
    // Take the visitor to the finished coat so the color is visible
    if (trigger && state.target < 0.97) {
      window.scrollTo({ top: trigger.end - 4, behavior: reduce ? 'auto' : 'smooth' });
    }
  });
  btn.addEventListener('keydown', (e) => {
    const i = swatchBtns.indexOf(btn);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const b = swatchBtns[(i + step + swatchBtns.length) % swatchBtns.length];
    b.focus();
    b.click();
  });
  btn.tabIndex = btn.getAttribute('aria-checked') === 'true' ? 0 : -1;
});

/* Scroll driving */
function setupScroll() {
  const { gsap, ScrollTrigger } = window;
  if (!gsap || !ScrollTrigger || reduce) return;
  gsap.registerPlugin(ScrollTrigger);
  const mobile = window.matchMedia('(max-width: 640px)').matches;
  trigger = ScrollTrigger.create({
    trigger: section,
    pin: '[data-repaint-pin]',
    start: () => `top top+=${document.querySelector('[data-header]').offsetHeight}`,
    end: mobile ? '+=170%' : '+=230%',
    invalidateOnRefresh: true,
    refreshPriority: 1, // measure the pin first so triggers below it get the added scroll space
    onUpdate: (self) => { state.target = self.progress; }
  });
}
setupScroll();
if (window.ScrollTrigger) { window.ScrollTrigger.sort(); window.ScrollTrigger.refresh(); }
setStageUI(state.p);
// Re-measure once fonts and images settle the layout
const refresh = () => window.ScrollTrigger && window.ScrollTrigger.refresh();
if (document.readyState === 'complete') refresh(); else window.addEventListener('load', refresh, { once: true });
if (document.fonts) document.fonts.ready.then(refresh);

/* 3D scene, loaded only when the section comes near */
const io = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) {
    io.disconnect();
    import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js')
      .then((THREE) => { state.api = buildScene(THREE); })
      .catch(() => showFallback());
  }
}, { rootMargin: '800px 0px' });
io.observe(section);

function showFallback() {
  const img = document.createElement('img');
  img.src = 'assets/img/project-02.webp';
  img.alt = 'Freshly painted colonial house';
  img.style.cssText = 'width:100%;height:clamp(320px,52vh,560px);object-fit:cover;';
  canvas.replaceWith(img);
  const tick = () => { state.p += (state.target - state.p) * 0.12; setStageUI(state.p); requestAnimationFrame(tick); };
  tick();
}

function buildScene(THREE) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    showFallback();
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const C = (hex) => new THREE.Color(hex);

  /* Light */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaab6c8, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(7, 11, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  const house = new THREE.Group();
  scene.add(house);

  /* Siding shader: clapboards, grime, peeling and a coat line that rolls top to bottom */
  const siding = {
    uOld: { value: C('#8F9BA8') },
    uNew: { value: C('#8F9BA8') },
    uLine: { value: 9 },
    uWash: { value: 9 },
    uPeel: { value: 1 },
    uDirt: { value: 1 },
    uRot: { value: 0 }
  };
  const sidingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  sidingMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, siding);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uRot;\nvarying vec3 vHP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float cr = cos(-uRot), sr = sin(-uRot);
        vHP = vec3(cr * wp0.x + sr * wp0.z, wp0.y, -sr * wp0.x + cr * wp0.z);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uOld; uniform vec3 uNew; uniform float uLine; uniform float uWash; uniform float uPeel; uniform float uDirt;
        varying vec3 vHP;
        float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
        float fbm(vec3 p){ return 0.55 * n3(p) + 0.3 * n3(p * 2.1) + 0.15 * n3(p * 4.3); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float y = vHP.y;
        float coat = smoothstep(uLine - 0.05, uLine + 0.05, y);
        vec3 c = mix(uOld, uNew, coat);
        float washed = smoothstep(uWash - 0.12, uWash + 0.12, y);
        float peel = smoothstep(0.6, 0.66, fbm(vHP * vec3(1.7, 2.6, 1.7))) * uPeel * (1.0 - coat);
        c = mix(c, vec3(0.62, 0.52, 0.40), peel);
        float streak = fbm(vHP * vec3(3.5, 0.45, 3.5)) * uDirt * (1.0 - washed) * (1.0 - coat);
        c *= 1.0 - streak * 0.32;
        float moss = fbm(vHP * 2.3 + 7.0) * (1.0 - smoothstep(0.3, 2.0, y)) * uDirt * (1.0 - washed) * (1.0 - coat);
        c = mix(c, vec3(0.20, 0.27, 0.14), clamp(moss * 1.1, 0.0, 0.75));
        float board = fract((y - 0.4) / 0.17);
        c *= 0.8 + 0.2 * smoothstep(0.0, 0.22, board);
        diffuseColor.rgb = c;`);
  };

  const mat = (hex, rough = 0.8) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough });
  const trimMat = mat('#CFC6B0', 0.7);
  const roofMat = mat('#E4E9EF', 0.9);
  const doorMat = mat('#5E4B3C', 0.6);
  const shutterMat = mat('#4A5246', 0.7);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#2A3A52', roughness: 0.15, metalness: 0.2 });
  const groundMat = mat('#EEF2F7', 1);
  const brickMat = mat('#8A4B3C', 0.9);
  const stoneMat = mat('#9AA1AA', 0.95);
  const treeMat = mat('#DCE4EB', 0.9);
  const trunkMat = mat('#5A4636', 1);

  const add = (geo, m, x, y, z, parent = house) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  const W = 6.2, D = 4.2, base = 0.4, H = 3.7, top = base + H, rise = 1.75;

  // Ground and walk
  const ground = add(new THREE.CylinderGeometry(10, 10, 0.3, 72), groundMat, 0, -0.15, 0.6, scene);
  ground.castShadow = false;
  add(box(1.3, 0.04, 3.6), stoneMat, 0, 0.02, 4.2);

  // Foundation and walls
  add(box(W + 0.12, base, D + 0.12), stoneMat, 0, base / 2, 0);
  add(box(W, H, D), sidingMat, 0, base + H / 2, 0);

  // Gables
  const tri = new THREE.Shape();
  tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, rise); tri.closePath();
  const gableGeo = new THREE.ShapeGeometry(tri);
  const g1 = add(gableGeo, sidingMat, W / 2, top, 0); g1.rotation.y = Math.PI / 2;
  const g2 = add(gableGeo, sidingMat, -W / 2, top, 0); g2.rotation.y = -Math.PI / 2;

  // Roof
  const over = 0.4;
  const run = D / 2 + over, drop = over * (rise / (D / 2));
  const slabLen = Math.hypot(run, rise + drop);
  const ang = Math.atan2(rise + drop, run);
  const midY = top - drop + (rise + drop) / 2 + 0.08;
  const r1 = add(box(W + 0.7, 0.16, slabLen), roofMat, 0, midY, run / 2); r1.rotation.x = ang;
  const r2 = add(box(W + 0.7, 0.16, slabLen), roofMat, 0, midY, -run / 2); r2.rotation.x = -ang;

  // Chimney
  add(box(0.7, 2.6, 0.7), brickMat, 2.0, top + 0.6, -0.6);

  // Trim: corners and fascia
  [[-1, 1], [1, 1], [1, -1], [-1, -1]].forEach(([sx, sz]) => add(box(0.18, H, 0.18), trimMat, sx * (W / 2), base + H / 2, sz * (D / 2)));
  add(box(W + 0.1, 0.22, 0.12), trimMat, 0, top - 0.11, D / 2 + 0.03);
  add(box(0.12, 0.22, D + 0.1), trimMat, W / 2 + 0.03, top - 0.11, 0);

  // Windows with trim and shutters
  const windowAt = (x, y, side) => {
    const g = new THREE.Group();
    add(box(1.0, 1.4, 0.1), trimMat, 0, 0, 0, g);
    add(box(0.8, 1.2, 0.08), glassMat, 0, 0, 0.03, g);
    add(box(0.8, 0.05, 0.1), trimMat, 0, 0, 0.05, g);
    add(box(0.05, 1.2, 0.1), trimMat, 0, 0, 0.05, g);
    add(box(1.15, 0.08, 0.2), trimMat, 0, -0.72, 0.06, g);
    add(box(0.36, 1.4, 0.06), shutterMat, -0.72, 0, 0.02, g);
    add(box(0.36, 1.4, 0.06), shutterMat, 0.72, 0, 0.02, g);
    if (side) { g.rotation.y = Math.PI / 2; g.position.set(W / 2 + 0.05, y, x); }
    else g.position.set(x, y, D / 2 + 0.05);
    house.add(g);
  };
  [-2.0, 0, 2.0].forEach((x) => windowAt(x, base + 2.75, false));
  [-2.0, 2.0].forEach((x) => windowAt(x, base + 1.05, false));
  [-0.9, 0.9].forEach((z) => { windowAt(z, base + 2.75, true); windowAt(z, base + 1.05, true); });

  // Door and porch
  add(box(1.3, 2.2, 0.1), trimMat, 0, base + 1.05, D / 2 + 0.05);
  add(box(1.0, 1.95, 0.1), doorMat, 0, base + 0.97, D / 2 + 0.08);
  add(box(0.08, 0.08, 0.14), mat('#C8A35A', 0.3), 0.35, base + 0.95, D / 2 + 0.16);
  add(box(2.4, 0.14, 1.3), trimMat, 0, base + 2.42, D / 2 + 0.65);
  [-1.05, 1.05].forEach((x) => add(new THREE.CylinderGeometry(0.08, 0.08, 2.05, 16), trimMat, x, base + 1.33, D / 2 + 1.2));
  add(box(2.6, 0.2, 1.5), stoneMat, 0, base - 0.1, D / 2 + 0.75);
  add(box(2.2, 0.2, 0.5), stoneMat, 0, base - 0.3, D / 2 + 1.7);

  // Trees and shrubs
  const tree = (x, z, s) => {
    add(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.8 * s, 8), trunkMat, x, 0.4 * s, z, scene);
    add(new THREE.ConeGeometry(1.0 * s, 2.0 * s, 9), treeMat, x, 1.6 * s, z, scene);
    add(new THREE.ConeGeometry(0.75 * s, 1.6 * s, 9), treeMat, x, 2.5 * s, z, scene);
  };
  tree(-5.6, -1.4, 1.35); tree(-4.6, 1.6, 0.95); tree(5.6, -2.8, 1.2);
  [-2.6, -1.4, 1.4, 2.6].forEach((x) => add(new THREE.IcosahedronGeometry(0.42, 0), treeMat, x, 0.38, D / 2 + 0.45));

  /* Rollers that ride the coat line */
  const rollerMat = mat('#3363AC', 0.6);
  const rollerF = add(new THREE.CylinderGeometry(0.09, 0.09, W + 0.2, 20), rollerMat, 0, 0, D / 2 + 0.22);
  rollerF.rotation.z = Math.PI / 2;
  const rollerS = add(new THREE.CylinderGeometry(0.09, 0.09, D + 0.2, 20), rollerMat, W / 2 + 0.22, 0, 0);
  rollerS.rotation.x = Math.PI / 2;

  /* Snow and wash spray */
  const makePoints = (n, color, size) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 1, depthWrite: false }));
  };
  const SNOW = 700;
  const snow = makePoints(SNOW, 0xffffff, 0.075);
  const sp = snow.geometry.attributes.position.array;
  for (let i = 0; i < SNOW; i++) { sp[i * 3] = (Math.random() - 0.5) * 22; sp[i * 3 + 1] = Math.random() * 11; sp[i * 3 + 2] = (Math.random() - 0.5) * 16; }
  scene.add(snow);
  const SPRAY = 260;
  const spray = makePoints(SPRAY, 0xd9ecff, 0.06);
  const wp = spray.geometry.attributes.position.array;
  house.add(spray);
  const resetDrop = (i, line) => {
    if (Math.random() < 0.6) { wp[i * 3] = (Math.random() - 0.5) * W; wp[i * 3 + 2] = D / 2 + 0.12 + Math.random() * 0.25; }
    else { wp[i * 3] = W / 2 + 0.12 + Math.random() * 0.25; wp[i * 3 + 2] = (Math.random() - 0.5) * D; }
    wp[i * 3 + 1] = line - Math.random() * 0.5;
  };
  for (let i = 0; i < SPRAY; i++) resetDrop(i, top);

  /* Palette by state */
  const P = {
    faded: C('#8F9BA8'), clean: C('#A3AEBA'), primer: C('#F1F0EA'),
    trimOld: C('#CFC6B0'), trimNew: C('#FBFBF8'),
    roofSnow: C('#E4E9EF'), roofSlate: C('#2F3746'),
    groundSnow: C('#EEF2F7'), groundLawn: C('#9DB384'),
    treeSnow: C('#DCE4EB'), treeGreen: C('#3E5B45'),
    doorOld: C('#5E4B3C'), shutterOld: C('#4A5246'), ink: C('#121E30'), tier: C('#3363AC'), white: C('#FBFBF8')
  };
  const finish = C(state.color);
  const finishTarget = C(state.color);

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const span = (p, a, b) => clamp01((p - a) / (b - a));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const yTop = top + rise + 0.2, yBot = base - 0.05;
  const lerp = THREE.MathUtils.lerp;

  function apply(p, dt, time) {
    const wash = span(p, 0.2, 0.43);
    const prime = span(p, 0.45, 0.68);
    const fin = span(p, 0.72, 0.95);
    const winter = 1 - span(p, 0.12, 0.42);
    const spring = span(p, 0.45, 0.92);

    finish.lerp(finishTarget, Math.min(1, dt * 6));

    siding.uWash.value = wash <= 0 ? yTop + 1 : wash >= 1 ? yBot - 1 : lerp(yTop, yBot, ease(wash));
    if (fin > 0) {
      siding.uOld.value.copy(P.primer);
      siding.uNew.value.copy(finish);
      siding.uLine.value = fin >= 1 ? yBot - 1 : lerp(yTop, yBot, ease(fin));
      siding.uPeel.value = 0;
    } else if (prime > 0) {
      siding.uOld.value.copy(P.clean);
      siding.uNew.value.copy(P.primer);
      siding.uLine.value = prime >= 1 ? yBot - 1 : lerp(yTop, yBot, ease(prime));
      siding.uPeel.value = 1;
    } else {
      siding.uOld.value.lerpColors(P.faded, P.clean, wash);
      siding.uNew.value.copy(siding.uOld.value);
      siding.uLine.value = yTop + 1;
      siding.uPeel.value = 1;
    }
    siding.uRot.value = house.rotation.y;

    trimMat.color.lerpColors(P.trimOld, P.trimNew, prime);
    roofMat.color.lerpColors(P.roofSnow, P.roofSlate, 1 - winter);
    groundMat.color.lerpColors(P.groundSnow, P.groundLawn, spring);
    treeMat.color.lerpColors(P.treeSnow, P.treeGreen, 1 - winter * 0.85);
    const dark = finish.r + finish.g + finish.b < 0.15;
    doorMat.color.lerpColors(P.doorOld, dark ? P.tier : P.ink, fin);
    shutterMat.color.lerpColors(P.shutterOld, dark ? P.white : P.ink, fin);

    // Rollers
    const rolling = (prime > 0 && prime < 1) || (fin > 0 && fin < 1);
    rollerF.visible = rollerS.visible = rolling;
    if (rolling) {
      rollerF.position.y = rollerS.position.y = Math.min(siding.uLine.value, top - 0.1);
      rollerMat.color.copy(fin > 0 ? finish : P.primer);
    }

    // Snow
    snow.material.opacity = winter;
    snow.visible = winter > 0.01;
    if (snow.visible) {
      for (let i = 0; i < SNOW; i++) {
        sp[i * 3 + 1] -= dt * (0.9 + (i % 7) * 0.08);
        sp[i * 3] += Math.sin(time + i) * dt * 0.15;
        if (sp[i * 3 + 1] < 0) sp[i * 3 + 1] = 11;
      }
      snow.geometry.attributes.position.needsUpdate = true;
    }

    // Spray follows the wash line
    spray.visible = wash > 0.01 && wash < 0.99;
    if (spray.visible) {
      const line = Math.min(siding.uWash.value, top);
      for (let i = 0; i < SPRAY; i++) {
        wp[i * 3 + 1] -= dt * (2.5 + (i % 5) * 0.5);
        if (wp[i * 3 + 1] < base || wp[i * 3 + 1] > line + 0.1) resetDrop(i, line);
      }
      spray.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* Camera framing */
  const look = new THREE.Vector3(0, 2.7, 0.6);
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = 15.5 * Math.max(1, 1.45 / camera.aspect);
    camera.position.set(dist * 0.55, 5.6 + dist * 0.06, dist * 0.82);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  /* Pointer tilt on desktop */
  let tilt = 0, tiltTarget = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    tiltTarget = ((e.clientX - r.left) / r.width - 0.5) * 0.25;
  });
  canvas.addEventListener('pointerleave', () => { tiltTarget = 0; });

  /* Loop, only while visible */
  let visible = false, last = performance.now(), raf = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    state.p += (state.target - state.p) * Math.min(1, dt * 7);
    tilt += (tiltTarget - tilt) * Math.min(1, dt * 4);
    house.rotation.y = -0.62 + state.p * 0.95 + tilt + (reduce ? 0 : Math.sin(now / 2600) * 0.02);
    apply(state.p, dt, now / 1000);
    setStageUI(state.p);
    renderer.render(scene, camera);
    raf = visible ? requestAnimationFrame(loop) : 0;
  };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }).observe(canvas);

  return { setColor(hex) { finishTarget.set(hex); } };
}
