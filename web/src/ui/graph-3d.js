import * as THREE from 'three';

const PALETTE = {
  you: 0xc2492d,
  youGlow: '#e87352',
  company: 0xdce5cc,
  companyExpanded: 0xfaf5eb,
  companyIntro: 0xf1ab8a,
  circle: 0xf1ab8a,
  secondCompany: 0x8fa880,
  person: 0xf2dfc8,
  personIntro: 0xf1ab8a,
  edgeBase: 0x6f7f67,
  edgeActive: 0xf4b190,
  edgeCircle: 0xe39672,
  pulse: 0xffd7bd,
};

function makeGlowTexture(hexColor, innerAlpha = 0.85) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, hexColor);
  g.addColorStop(0.28, hexColor);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = innerAlpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// Compute balanced 3D positions from the abstract graph model (Fibonacci / orbital shells)
function compute3DPositions(model) {
  const coords = new Map();
  coords.set('you', new THREE.Vector3(0, 0, 0));

  const circles = model.nodes.filter((n) => n.kind === 'circle');
  const companies = model.nodes.filter((n) => n.kind === 'company');
  const secondCos = model.nodes.filter((n) => n.kind === 'second-company');
  const people = model.nodes.filter((n) => n.kind === 'person');

  // 1. Place Ref Circle friends in a prominent front-upper-left 3D arc
  circles.forEach((n, i) => {
    const t = circles.length > 1 ? (i / (circles.length - 1)) - 0.5 : 0;
    const angle = -Math.PI * 0.35 + t * 1.15;
    const r = 4.6;
    coords.set(n.id, new THREE.Vector3(
      Math.cos(angle) * r,
      1.35 + Math.sin(i * 1.9) * 0.9,
      Math.sin(angle) * r + 1.1,
    ));
  });

  // 2. Place 2nd-degree companies branching outwards in 3D from their Ref Circle friend
  const byFriend = new Map();
  for (const sc of secondCos) {
    const parentId = `circle:${sc.viaFriend.uid}`;
    if (!byFriend.has(parentId)) byFriend.set(parentId, []);
    byFriend.get(parentId).push(sc);
  }
  for (const [parentId, list] of byFriend.entries()) {
    const parentPos = coords.get(parentId) || new THREE.Vector3(0, 1.5, 3);
    const outDir = parentPos.clone().normalize();
    const right = new THREE.Vector3().crossVectors(outDir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, outDir).normalize();
    list.forEach((sc, idx) => {
      const spread = list.length > 1 ? (idx - (list.length - 1) / 2) : 0;
      const pos = parentPos.clone()
        .addScaledVector(outDir, 3.1)
        .addScaledVector(right, spread * 2.15)
        .addScaledVector(up, (idx % 2 === 0 ? 0.85 : -0.75));
      coords.set(sc.id, pos);
    });
  }

  // 3. Place Company Hubs across a lush 3D golden-angle Fibonacci shell
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  companies.forEach((co, i) => {
    const total = Math.max(companies.length, 1);
    const yNorm = total === 1 ? 0 : 1 - ((i + 0.5) / total) * 1.75; // keep slightly flatter vertically for widescreen elegance
    const y = THREE.MathUtils.clamp(yNorm * 0.72, -0.72, 0.72);
    const ringR = Math.sqrt(Math.max(0.15, 1 - y * y));
    const theta = goldenAngle * i + 0.65;
    const shell = i < 10 ? 4.8 + (i % 3) * 0.45 : 7.1 + (i % 3) * 0.55;
    coords.set(co.id, new THREE.Vector3(
      Math.cos(theta) * ringR * shell,
      y * shell * 0.82,
      Math.sin(theta) * ringR * shell,
    ));
  });

  // 4. Place People: if attached to an expanded company hub, orbit them cleanly around that hub; otherwise Fibonacci shell
  const edgeParent = new Map();
  for (const e of model.edges) {
    if (e.to.startsWith('person:')) edgeParent.set(e.to, e.from);
  }
  const byHub = new Map();
  const directPeople = [];
  for (const p of people) {
    const parent = edgeParent.get(p.id);
    if (parent && parent.startsWith('company:') && coords.has(parent)) {
      if (!byHub.has(parent)) byHub.set(parent, []);
      byHub.get(parent).push(p);
    } else {
      directPeople.push(p);
    }
  }

  for (const [hubId, list] of byHub.entries()) {
    const center = coords.get(hubId);
    const out = center.clone().normalize();
    const tangent = new THREE.Vector3().crossVectors(out, new THREE.Vector3(0, 1, 0));
    if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0);
    tangent.normalize();
    const bitangent = new THREE.Vector3().crossVectors(out, tangent).normalize();
    list.forEach((p, idx) => {
      const a = (idx / list.length) * Math.PI * 2 + 0.3;
      const orbitR = 2.15 + (idx % 2) * 0.55;
      const pos = center.clone()
        .addScaledVector(out, 1.35)
        .addScaledVector(tangent, Math.cos(a) * orbitR)
        .addScaledVector(bitangent, Math.sin(a) * orbitR);
      coords.set(p.id, pos);
    });
  }

  directPeople.forEach((p, i) => {
    const total = Math.max(directPeople.length, 1);
    const yNorm = total === 1 ? 0 : 1 - ((i + 0.5) / total) * 1.7;
    const y = THREE.MathUtils.clamp(yNorm * 0.68, -0.68, 0.68);
    const ringR = Math.sqrt(Math.max(0.15, 1 - y * y));
    const theta = goldenAngle * i + 1.2;
    const shell = i < 14 ? 4.4 + (i % 3) * 0.4 : 6.8 + (i % 4) * 0.45;
    coords.set(p.id, new THREE.Vector3(
      Math.cos(theta) * ringR * shell,
      y * shell * 0.78,
      Math.sin(theta) * ringR * shell,
    ));
  });

  // 5. Quick 3D repulsion pass so NO two nodes ever overlap in 3D space
  const keys = Array.from(coords.keys()).filter((k) => k !== 'you');
  const minSep = 1.85;
  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < keys.length; i++) {
      const a = coords.get(keys[i]);
      for (let j = i + 1; j < keys.length; j++) {
        const b = coords.get(keys[j]);
        const diff = a.clone().sub(b);
        const dist = diff.length();
        if (dist > 0.001 && dist < minSep) {
          const push = (minSep - dist) * 0.35;
          diff.normalize();
          a.addScaledVector(diff, push);
          b.addScaledVector(diff, -push);
        }
      }
      // Keep clear of center "You"
      if (a.length() < 2.8) a.setLength(2.8);
    }
  }

  return coords;
}

function truncate(s, max = 18) {
  const str = String(s || '');
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

export function create3DGraph(container, { onSelect, onHover, autoRotate = true, initialDistance = 15.2 } = {}) {
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';

  const canvas = document.createElement('canvas');
  canvas.className = 'ref-3d-canvas';
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;touch-action:none;';
  container.appendChild(canvas);

  const labelLayer = document.createElement('div');
  labelLayer.className = 'ref-3d-labels';
  labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  container.appendChild(labelLayer);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x161b14, 0.022);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  // Cinematic 3-point + core lighting
  const hemi = new THREE.HemisphereLight(0xfff5e6, 0x263322, 1.35);
  const keyLight = new THREE.DirectionalLight(0xffe9cf, 2.2);
  keyLight.position.set(8, 12, 10);
  const rimLight = new THREE.DirectionalLight(0xa3c293, 1.3);
  rimLight.position.set(-10, -5, -8);
  const coreLight = new THREE.PointLight(0xf18a62, 3.2, 14, 1.6);
  coreLight.position.set(0, 0, 0);
  scene.add(hemi, keyLight, rimLight, coreLight);

  // Ambient 3D floating starfield / dust particles for realistic atmospheric depth
  const particleCount = 240;
  const pGeo = new THREE.BufferGeometry();
  const pPositions = new Float32Array(particleCount * 3);
  const pColors = new Float32Array(particleCount * 3);
  const cIvory = new THREE.Color(0xe5ead9);
  const cApricot = new THREE.Color(0xf1ab8a);
  for (let i = 0; i < particleCount; i++) {
    const r = 6.5 + Math.random() * 14;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pPositions[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pPositions[i * 3 + 1] = r * Math.cos(ph) * 0.72;
    pPositions[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const col = Math.random() < 0.28 ? cApricot : cIvory;
    pColors[i * 3] = col.r;
    pColors[i * 3 + 1] = col.g;
    pColors[i * 3 + 2] = col.b;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
  const dust = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({ size: 0.085, vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  scene.add(dust);

  // Subtle translucent orbital guide rings around center
  const orbitGroup = new THREE.Group();
  for (const [rad, rotX, rotZ, op] of [
    [4.9, Math.PI / 2.15, 0.14, 0.11],
    [7.4, Math.PI / 1.85, -0.18, 0.075],
  ]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(rad, 0.012, 8, 128),
      new THREE.MeshBasicMaterial({ color: 0xd9e1ca, transparent: true, opacity: op }),
    );
    ring.rotation.set(rotX, 0, rotZ);
    orbitGroup.add(ring);
  }
  scene.add(orbitGroup);

  // Reusable shared geometries & glow textures
  const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
  const pulseGeo = new THREE.SphereGeometry(0.068, 12, 10);
  const pulseMat = new THREE.MeshBasicMaterial({ color: PALETTE.pulse });
  const glowWarmTex = makeGlowTexture('#f19b72', 0.75);
  const glowSageTex = makeGlowTexture('#d4e0bf', 0.55);

  const selectionHalo = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.045, 12, 64),
    new THREE.MeshBasicMaterial({ color: 0xf4b190, transparent: true, opacity: 0.95 }),
  );
  selectionHalo.visible = false;
  scene.add(selectionHalo);

  const graphGroup = new THREE.Group();
  scene.add(graphGroup);

  let model = { nodes: [], edges: [] };
  let nodeEntries = new Map(); // id -> { node, mesh, glow, basePos, radius, phase, labelEl }
  let edgeEntries = []; // { from, to, kind, mesh, curve, pulseMesh, speed, offset }
  let pickables = [];

  let selectedId = null;
  let hoveredId = null;

  // Damped Spherical Camera Controller
  const cam = {
    yaw: 0.25,
    pitch: 0.22,
    dist: initialDistance,
    targetYaw: 0.25,
    targetPitch: 0.22,
    targetDist: initialDistance,
    lookAt: new THREE.Vector3(0, 0, 0),
    targetLookAt: new THREE.Vector3(0, 0, 0),
  };

  let isDragging = false;
  let dragMoved = false;
  let dragStart = { x: 0, y: 0, yaw: 0, pitch: 0 };
  let lastInteractTime = 0;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tempVec = new THREE.Vector3();

  let width = 640;
  let height = 420;
  let destroyed = false;
  let rafId = null;
  const clock = new THREE.Clock();

  function resize() {
    const rect = container.getBoundingClientRect();
    width = Math.max(260, Math.floor(rect.width));
    height = Math.max(240, Math.floor(rect.height));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  function getActiveChain(focusId) {
    if (!focusId) return null;
    const activeNodes = new Set([focusId, 'you']);
    const activeEdges = new Set();
    let frontier = [focusId];
    for (let step = 0; step < 3; step++) {
      const next = [];
      for (const e of model.edges) {
        if (frontier.includes(e.to)) {
          activeNodes.add(e.from);
          activeEdges.add(`${e.from}->${e.to}`);
          next.push(e.from);
        }
        if (e.from === focusId) {
          activeNodes.add(e.to);
          activeEdges.add(`${e.from}->${e.to}`);
        }
      }
      frontier = next;
    }
    return { activeNodes, activeEdges };
  }

  function clearSceneGraph() {
    for (const child of [...graphGroup.children]) {
      graphGroup.remove(child);
      if (child.geometry && child.geometry !== sphereGeo && child.geometry !== pulseGeo) {
        child.geometry.dispose();
      }
      if (child.material && child.material !== pulseMat) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
    labelLayer.innerHTML = '';
    nodeEntries.clear();
    edgeEntries = [];
    pickables = [];
  }

  function buildSceneGraph() {
    clearSceneGraph();
    if (!model.nodes.length) return;

    const coords = compute3DPositions(model);

    // 1. Create Node Meshes + Glow Sprites + HTML Label Pills
    model.nodes.forEach((node, idx) => {
      const basePos = coords.get(node.id) || new THREE.Vector3();
      let color = PALETTE.person;
      let radius = 0.34;
      let emissive = 0x1a1510;
      let emissiveIntensity = 0.25;
      let metalness = 0.15;
      let roughness = 0.32;

      if (node.kind === 'you') {
        color = PALETTE.you;
        radius = 0.72;
        emissive = 0x8c2d17;
        emissiveIntensity = 0.65;
        metalness = 0.25;
        roughness = 0.24;
      } else if (node.kind === 'company') {
        color = node.expanded ? PALETTE.companyExpanded : (node.introCount > 0 ? PALETTE.companyIntro : PALETTE.company);
        radius = Math.min(0.64, 0.34 + Math.log2((node.count || 1) + 1) * 0.11);
        emissive = node.expanded ? 0x5c3624 : 0x222c1d;
        emissiveIntensity = node.expanded ? 0.55 : 0.22;
        metalness = 0.22;
        roughness = 0.28;
      } else if (node.kind === 'circle') {
        color = PALETTE.circle;
        radius = 0.48;
        emissive = 0x7d3d22;
        emissiveIntensity = 0.48;
        metalness = 0.18;
        roughness = 0.25;
      } else if (node.kind === 'second-company') {
        color = PALETTE.secondCompany;
        radius = 0.36;
        emissive = 0x2e4028;
        emissiveIntensity = 0.32;
      } else if (node.data?.canIntroduce) {
        color = PALETTE.personIntro;
        radius = 0.34;
        emissive = 0x69341d;
        emissiveIntensity = 0.38;
      }

      const mat = new THREE.MeshPhysicalMaterial({
        color,
        emissive,
        emissiveIntensity,
        roughness,
        metalness,
        clearcoat: 0.72,
        clearcoatRoughness: 0.22,
        transparent: true,
        opacity: 1,
      });

      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(basePos);
      mesh.scale.setScalar(radius);
      mesh.userData.nodeId = node.id;
      graphGroup.add(mesh);
      pickables.push(mesh);

      // Soft volumetric halo sprite
      const spriteMat = new THREE.SpriteMaterial({
        map: (node.kind === 'you' || node.kind === 'circle' || node.introCount > 0 || node.data?.canIntroduce)
          ? glowWarmTex : glowSageTex,
        transparent: true,
        opacity: node.kind === 'you' ? 0.72 : node.kind === 'circle' ? 0.48 : 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(spriteMat);
      glow.position.copy(basePos);
      glow.scale.setScalar(radius * (node.kind === 'you' ? 4.4 : 3.2));
      graphGroup.add(glow);

      // Glass outer shell ring for "You"
      if (node.kind === 'you') {
        const gyro1 = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 1.48, 0.018, 10, 64),
          new THREE.MeshBasicMaterial({ color: 0xf4b190, transparent: true, opacity: 0.55 }),
        );
        gyro1.rotation.set(0.85, 0.3, 0);
        gyro1.userData.gyro = 1;
        graphGroup.add(gyro1);

        const gyro2 = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 1.85, 0.013, 10, 64),
          new THREE.MeshBasicMaterial({ color: 0xe5ead9, transparent: true, opacity: 0.3 }),
        );
        gyro2.rotation.set(-0.6, 0.9, 0.4);
        gyro2.userData.gyro = 2;
        graphGroup.add(gyro2);
      }

      // Projected HTML label pill (textContent only — zero XSS from untrusted contact/company names)
      const el = document.createElement('div');
      el.className = `g3d-label g3d-${node.kind}`;
      const titleSpan = document.createElement('span');
      titleSpan.className = 'g3d-title';
      titleSpan.textContent = truncate(node.label, 18);
      el.appendChild(titleSpan);
      if (node.kind === 'company') {
        const countSpan = document.createElement('span');
        countSpan.className = 'g3d-count';
        countSpan.textContent = String(node.count);
        el.appendChild(countSpan);
      } else if (node.kind === 'second-company') {
        const subSpan = document.createElement('span');
        subSpan.className = 'g3d-sub';
        subSpan.textContent = `via ${truncate(node.viaFriend.name.split(' ')[0], 10)}`;
        el.appendChild(subSpan);
      } else if (node.kind === 'circle') {
        const subSpan = document.createElement('span');
        subSpan.className = 'g3d-sub';
        subSpan.textContent = 'Circle';
        el.appendChild(subSpan);
      }
      el.style.opacity = '0';
      labelLayer.appendChild(el);

      nodeEntries.set(node.id, {
        node,
        mesh,
        glow,
        basePos: basePos.clone(),
        radius,
        phase: idx * 0.73,
        labelEl: el,
      });
    });

    // 2. Create Curved 3D Spline Arcs + Animated Travelling Light Pulses
    model.edges.forEach((edge, idx) => {
      const aEntry = nodeEntries.get(edge.from);
      const bEntry = nodeEntries.get(edge.to);
      if (!aEntry || !bEntry) return;

      const a = aEntry.basePos;
      const b = bEntry.basePos;
      const mid = a.clone().lerp(b, 0.5);
      // Bow the arc gently outward/upward in 3D for organic elegance
      const lift = Math.min(1.4, a.distanceTo(b) * 0.16);
      mid.y += lift * (idx % 2 === 0 ? 1 : -0.45);
      mid.multiplyScalar(1.06);

      const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
      const isWarm = edge.kind === 'circle' || edge.kind === 'intro' || edge.kind === 'second';
      const tubeGeo = new THREE.TubeGeometry(curve, 24, isWarm ? 0.022 : 0.014, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: isWarm ? PALETTE.edgeCircle : PALETTE.edgeBase,
        transparent: true,
        opacity: isWarm ? 0.56 : 0.28,
        depthWrite: false,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      graphGroup.add(tubeMesh);

      // Luminous travelling pulse bead along important / active edges
      let pulseMesh = null;
      if (isWarm || idx % 2 === 0) {
        pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
        pulseMesh.scale.setScalar(isWarm ? 1.05 : 0.72);
        graphGroup.add(pulseMesh);
      }

      edgeEntries.push({
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        mesh: tubeMesh,
        curve,
        pulseMesh,
        speed: 0.18 + (idx % 5) * 0.035,
        offset: (idx * 0.29) % 1,
      });
    });
  }

  function setData(nextModel, { keepCamera = false } = {}) {
    model = nextModel || { nodes: [], edges: [] };
    buildSceneGraph();
    if (!keepCamera) {
      fitToView();
    }
    // Paint immediately so WebGL & projected labels never wait for a throttled rAF
    renderStep(clock.getElapsedTime());
  }

  function setSelected(nodeId) {
    selectedId = nodeId;
  }

  function fitToView() {
    cam.targetLookAt.set(0, 0, 0);
    cam.targetDist = model.nodes.length > 20 ? initialDistance + 2.4 : initialDistance;
    cam.targetPitch = 0.22;
  }

  function zoomBy(factor) {
    // factor > 1 zooms IN (smaller distance)
    cam.targetDist = THREE.MathUtils.clamp(cam.targetDist / factor, 6.2, 28);
    lastInteractTime = performance.now();
  }

  function focusNode(nodeId) {
    const entry = nodeEntries.get(nodeId);
    if (!entry) return;
    selectedId = nodeId;
    const p = entry.basePos;
    cam.targetLookAt.copy(p).multiplyScalar(0.55);
    if (p.length() > 0.5) {
      cam.targetYaw = Math.atan2(p.x, p.z);
      cam.targetPitch = THREE.MathUtils.clamp(Math.atan2(p.y, Math.hypot(p.x, p.z)) + 0.14, -0.75, 0.75);
    }
    cam.targetDist = nodeId === 'you' ? initialDistance : Math.min(cam.targetDist, 11.4);
    lastInteractTime = performance.now();
  }

  function updateRay(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.nodeId : null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    dragMoved = false;
    lastInteractTime = performance.now();
    dragStart = { x: e.clientX, y: e.clientY, yaw: cam.targetYaw, pitch: cam.targetPitch };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (e) => {
    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.hypot(dx, dy) > 4) dragMoved = true;
      cam.targetYaw = dragStart.yaw - dx * 0.0065;
      cam.targetPitch = THREE.MathUtils.clamp(dragStart.pitch + dy * 0.0055, -1.05, 1.05);
      lastInteractTime = performance.now();
      return;
    }
    const hitId = updateRay(e);
    if (hitId !== hoveredId) {
      hoveredId = hitId;
      canvas.style.cursor = hitId ? 'pointer' : 'grab';
      const entry = hitId ? nodeEntries.get(hitId) : null;
      onHover?.(entry?.node || null);
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    lastInteractTime = performance.now();
    canvas.style.cursor = hoveredId ? 'pointer' : 'grab';
    if (!dragMoved) {
      const hitId = updateRay(e);
      if (hitId) {
        const entry = nodeEntries.get(hitId);
        if (entry) {
          selectedId = hitId;
          focusNode(hitId);
          onSelect?.(entry.node);
        }
      }
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = e.deltaY < 0 ? 1.12 : 0.89;
    zoomBy(step);
  }, { passive: false });

  function renderStep(t) {
    const idleFor = performance.now() - lastInteractTime;

    // Gentle living ambient 3D orbit when user isn't dragging/hovering
    if (autoRotate && !isDragging && !hoveredId && idleFor > 2200) {
      cam.targetYaw += 0.0018;
    }

    // Damped spherical camera interpolation
    cam.yaw += (cam.targetYaw - cam.yaw) * 0.085;
    cam.pitch += (cam.targetPitch - cam.pitch) * 0.085;
    cam.dist += (cam.targetDist - cam.dist) * 0.085;
    cam.lookAt.lerp(cam.targetLookAt, 0.085);

    camera.position.set(
      cam.lookAt.x + cam.dist * Math.sin(cam.yaw) * Math.cos(cam.pitch),
      cam.lookAt.y + cam.dist * Math.sin(cam.pitch),
      cam.lookAt.z + cam.dist * Math.cos(cam.yaw) * Math.cos(cam.pitch),
    );
    camera.lookAt(cam.lookAt);

    // Subtle atmospheric drift for dust & orbit rings
    dust.rotation.y = t * 0.018;
    orbitGroup.rotation.y = -t * 0.025;

    for (const child of graphGroup.children) {
      if (child.userData.gyro === 1) child.rotation.z = t * 0.45;
      if (child.userData.gyro === 2) child.rotation.y = -t * 0.32;
    }

    const focusId = hoveredId || selectedId;
    const chain = getActiveChain(focusId);

    // Update node floating animation + highlight / dim styling
    for (const [id, entry] of nodeEntries.entries()) {
      const floatY = id === 'you' ? 0 : Math.sin(t * 1.15 + entry.phase) * 0.09;
      entry.mesh.position.set(entry.basePos.x, entry.basePos.y + floatY, entry.basePos.z);
      entry.glow.position.copy(entry.mesh.position);

      const isFocus = id === hoveredId || id === selectedId;
      const inChain = !chain || chain.activeNodes.has(id);
      const targetScale = entry.radius * (isFocus ? 1.24 : 1);
      entry.mesh.scale.lerp(tempVec.set(targetScale, targetScale, targetScale), 0.16);
      entry.mesh.material.opacity = inChain ? 1 : 0.24;
      entry.glow.material.opacity = isFocus ? 0.88 : inChain ? (id === 'you' ? 0.7 : 0.32) : 0.05;
    }

    // Selection halo follows focused node facing camera
    const haloTarget = focusId ? nodeEntries.get(focusId) : null;
    if (haloTarget) {
      selectionHalo.visible = true;
      selectionHalo.position.copy(haloTarget.mesh.position);
      selectionHalo.quaternion.copy(camera.quaternion);
      const pulse = 1.32 + Math.sin(t * 3.5) * 0.06;
      selectionHalo.scale.setScalar(haloTarget.radius * pulse);
    } else {
      selectionHalo.visible = false;
    }

    // Update 3D spline edges & travelling light pulses
    for (const edge of edgeEntries) {
      const edgeKey = `${edge.from}->${edge.to}`;
      const isChain = chain ? chain.activeEdges.has(edgeKey) : false;
      const isWarm = edge.kind === 'circle' || edge.kind === 'intro' || edge.kind === 'second';

      if (isChain) {
        edge.mesh.material.color.setHex(PALETTE.edgeActive);
        edge.mesh.material.opacity = 0.92;
      } else if (chain) {
        edge.mesh.material.color.setHex(PALETTE.edgeBase);
        edge.mesh.material.opacity = 0.08;
      } else {
        edge.mesh.material.color.setHex(isWarm ? PALETTE.edgeCircle : PALETTE.edgeBase);
        edge.mesh.material.opacity = isWarm ? 0.56 : 0.28;
      }

      if (edge.pulseMesh) {
        const showPulse = isChain || (!chain && isWarm) || !chain;
        edge.pulseMesh.visible = showPulse;
        if (showPulse) {
          const speed = isChain ? edge.speed * 2.1 : edge.speed;
          const u = (t * speed + edge.offset) % 1;
          edge.curve.getPoint(u, edge.pulseMesh.position);
          edge.pulseMesh.scale.setScalar(isChain ? 1.3 : 0.72);
        }
      }
    }

    renderer.render(scene, camera);

    // Smart Depth-Sorted, ZERO-OVERLAP 2D Label Projection
    const candidates = [];
    for (const [id, entry] of nodeEntries.entries()) {
      tempVec.copy(entry.mesh.position).project(camera);
      // Behind camera or way off-screen
      if (tempVec.z > 1 || tempVec.z < -1) {
        entry.labelEl.style.opacity = '0';
        continue;
      }
      const sx = (tempVec.x * 0.5 + 0.5) * width;
      const sy = (0.5 - tempVec.y * 0.5) * height;
      const distToCam = camera.position.distanceTo(entry.mesh.position);
      const isFocus = id === hoveredId || id === selectedId;
      const inChain = !chain || chain.activeNodes.has(id);

      let priority = 10;
      if (isFocus) priority = 100;
      else if (chain && inChain) priority = 85;
      else if (id === 'you') priority = 80;
      else if (entry.node.kind === 'circle') priority = 65;
      else if (entry.node.kind === 'company' && entry.node.expanded) priority = 75;
      else if (entry.node.kind === 'company') priority = 40 + Math.min(18, entry.node.count || 0);
      else if (entry.node.kind === 'second-company') priority = 35;

      // Closer nodes win ties
      priority -= distToCam * 0.7;

      candidates.push({ id, entry, sx, sy, distToCam, isFocus, inChain, priority });
    }

    candidates.sort((a, b) => b.priority - a.priority);

    const placedBoxes = [];
    const padX = 12;
    const padY = 8;

    for (const item of candidates) {
      const { entry, sx, sy, distToCam, isFocus, inChain } = item;
      const el = entry.labelEl;

      if (sx < 36 || sx > width - 36 || sy < 24 || sy > height - 28) {
        el.style.opacity = '0';
        continue;
      }

      // Approximate screen bounding box for collision culling
      const estW = Math.min(165, Math.max(66, entry.node.label.length * 7.4 + 34));
      const estH = 26;
      const yOffset = Math.max(16, (entry.radius / Math.max(4, distToCam)) * height * 0.75 + 10);
      const bx = sx - estW / 2;
      const by = sy + yOffset;

      const collides = !isFocus && placedBoxes.some(
        (box) => bx < box.r + padX && bx + estW > box.l - padX && by < box.b + padY && by + estH > box.t - padY,
      );

      if (collides) {
        el.style.opacity = '0';
        continue;
      }

      placedBoxes.push({ l: bx, r: bx + estW, t: by, b: by + estH });

      const depthAlpha = THREE.MathUtils.clamp(1.32 - distToCam / 26, 0.42, 1);
      const finalOpacity = isFocus ? 1 : (chain && !inChain ? 0.18 : depthAlpha);
      const scale = isFocus ? 1.04 : THREE.MathUtils.clamp(1.12 - distToCam / 48, 0.84, 1);

      el.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(by)}px, 0) translate(-50%, 0) scale(${scale.toFixed(3)})`;
      el.style.opacity = finalOpacity.toFixed(2);
      el.style.zIndex = isFocus ? '30' : String(Math.max(1, Math.round(25 - distToCam)));
      el.classList.toggle('is-active', Boolean(isFocus || (chain && inChain)));
    }
  }

  function animate() {
    if (destroyed) return;
    rafId = requestAnimationFrame(animate);
    renderStep(clock.getElapsedTime());
  }

  resize();
  animate();

  return {
    setData,
    setSelected,
    fitToView,
    zoomBy,
    focusNode,
    destroy() {
      destroyed = true;
      ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      clearSceneGraph();
      sphereGeo.dispose();
      pulseGeo.dispose();
      pulseMat.dispose();
      pGeo.dispose();
      glowWarmTex.dispose();
      glowSageTex.dispose();
      renderer.dispose();
    },
  };
}
