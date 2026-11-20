export function createNetworkGraph({ stage, controls, instructions }) {
  let data;
  let selection;
  let view;
  let loading = false;
  const buttons = () => stage.querySelectorAll('[data-node]');

  function updateMenu(active) {
    controls.hidden = !active;
    instructions.textContent = active ? 'Drag to rotate. Select a point.' : 'Select a point to see how it connects.';
    if (active) stage.tabIndex = 0;
    else stage.removeAttribute('tabindex');
  }

  function mountScene(THREE, canvas, context) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 40);
    const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;

    const fill = new THREE.HemisphereLight(0xfff4e7, 0x7d8b72, 2.5);
    const key = new THREE.DirectionalLight(0xffecd6, 2.7);
    key.position.set(-3, 5, 6);
    scene.add(fill, key);

    const sphere = new THREE.SphereGeometry(1, 32, 20);
    const smallSphere = new THREE.SphereGeometry(1, 12, 8);
    const backgroundNode = new THREE.MeshBasicMaterial({ color: '#9caa85', transparent: true, opacity: 0.65 });
    const backgroundEdge = new THREE.LineBasicMaterial({ color: '#d4d4ad', transparent: true, opacity: 0.24 });
    const highlighted = new THREE.MeshBasicMaterial({ color: '#f1ab8a' });
    const secondary = new THREE.MeshBasicMaterial({ color: '#92a084', transparent: true, opacity: 0.63 });
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.018, 8, 68),
      new THREE.MeshBasicMaterial({ color: '#f1ab8a', transparent: true, opacity: 0.89 }),
    );
    const group = new THREE.Group();
    const positions = new Map();
    let connectors = [];
    scene.add(group, halo);

    let yaw = -0.12;
    let pitch = 0.08;
    let zoom = 1;
    let drag;
    let frame;
    const projected = new THREE.Vector3();
    const limit = THREE.MathUtils.clamp;

    function paint() {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (!width || !height) return;
      const radius = Math.max(8.9, 13.8 / camera.aspect) * zoom;
      camera.position.set(
        radius * Math.sin(yaw) * Math.cos(pitch),
        radius * Math.sin(pitch),
        radius * Math.cos(yaw) * Math.cos(pitch),
      );
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const active = positions.get(selection?.node);
      const edges = selection?.edges ?? [];
      for (const { id, edge } of connectors) edge.material = edges.includes(id) ? highlighted : secondary;
      halo.visible = Boolean(active);
      if (active) {
        halo.position.copy(active);
        halo.quaternion.copy(camera.quaternion);
        halo.scale.setScalar(data.nodes[selection.node].radius + 0.12);
      }
      renderer.render(scene, camera);
      for (const button of buttons()) {
        const position = positions.get(button.dataset.node);
        if (!position) continue;
        projected.copy(position).project(camera);
        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (0.5 - projected.y * 0.5) * height;
        button.style.left = Math.round(limit(x, 46, width - 46)) + 'px';
        button.style.top = Math.round(limit(y, 22, height - 57)) + 'px';
      }
    }

    function draw() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        paint();
      });
    }
    function rebuild() {
      for (const piece of group.children) {
        if (piece.geometry !== sphere && piece.geometry !== smallSphere) piece.geometry.dispose();
        if (piece.geometry === sphere) piece.material.dispose();
      }
      group.clear();
      positions.clear();
      for (const [id, node] of Object.entries(data.nodes)) {
        const mesh = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color: node.colour, roughness: 0.52 }));
        mesh.position.set(...node.position);
        mesh.scale.setScalar(node.radius);
        group.add(mesh);
        positions.set(id, mesh.position);
      }
      for (const [index, [coordinates, parent]] of (data.nearby ?? []).entries()) {
        const dot = new THREE.Mesh(smallSphere, backgroundNode);
        dot.position.set(...coordinates);
        dot.scale.setScalar(index % 3 === 0 ? 0.089 : 0.053);
        group.add(dot, new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([positions.get(parent), dot.position]), backgroundEdge,
        ));
      }
      connectors = data.edges.map(([start, end]) => {
        const a = positions.get(start);
        const b = positions.get(end);
        const direction = b.clone().sub(a);
        const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, direction.length(), 8), secondary);
        edge.position.copy(a).lerp(b, 0.5);
        edge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        group.add(edge);
        return { id: edgeId(start, end), edge };
      });
      draw();
    }

    const resizeObserver = new ResizeObserver(() => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      draw();
    });
    resizeObserver.observe(stage);

    function adjust(action) {
      if (action === 'reset') {
        yaw = -0.12;
        pitch = 0.08;
        zoom = 1;
      } else {
        zoom = limit(zoom * (action === 'zoom-in' ? 0.9 : 1.1), 0.84, 1.42);
      }
      draw();
    }
    stage.addEventListener('pointerdown', (event) => {
      if (!view || event.button !== 0 || event.target.closest('button')) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch };
      stage.setPointerCapture(event.pointerId);
      stage.dataset.dragging = '';
    });
    stage.addEventListener('pointermove', (event) => {
      if (event.pointerId !== drag?.id) return;
      yaw = limit(drag.yaw - (event.clientX - drag.x) * 0.007, -0.96, 0.96);
      pitch = limit(drag.pitch + (event.clientY - drag.y) * 0.006, -0.55, 0.55);
      draw();
    });
    stage.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId !== drag?.id) return;
      drag = null;
      delete stage.dataset.dragging;
    });
    stage.addEventListener('keydown', (event) => {
      if (!view || event.target !== stage) return;
      const steps = { ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, -0.13], ArrowDown: [0, 0.13] };
      const step = steps[event.key];
      if (step) {
        event.preventDefault();
        yaw = limit(yaw + step[0], -0.96, 0.96);
        pitch = limit(pitch + step[1], -0.55, 0.55);
        draw();
      } else if (['+', '=', '-', 'Home'].includes(event.key)) {
        event.preventDefault();
        adjust(event.key === 'Home' ? 'reset' : event.key === '-' ? 'zoom-out' : 'zoom-in');
      }
    });
    canvas.addEventListener('webglcontextlost', () => {
      resizeObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
      drag = null;
      delete stage.dataset.dragging;
      canvas.remove();
      view = null;
      delete stage.dataset.view;
      for (const button of buttons()) {
        button.style.removeProperty('left');
        button.style.removeProperty('top');
      }
      updateMenu(false);
    });

    canvas.className = 'graph-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    stage.prepend(canvas);
    stage.dataset.view = 'three';
    updateMenu(true);
    rebuild();
    return { draw, adjust, rebuild };
  }

  async function loadScene() {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
      if (!context) return;
      const THREE = await import('/vendor/three.module.min.js');
      view = mountScene(THREE, canvas, context);
    } catch {
      // The diagram and node details work when Three.js or WebGL is unavailable.
    }
  }

  controls.addEventListener('click', (event) => {
    const action = event.target.closest('[data-view-action]')?.dataset.viewAction;
    if (action) view?.adjust(action);
  });
  return {
    setData(nextData) {
      data = nextData;
      if (view) view.rebuild();
      else if (!loading) {
        loading = true;
        loadScene();
      }
    },
    select(node, edges) {
      selection = { node, edges: edges.map(([start, end]) => edgeId(start, end)) };
      view?.draw();
    },
  };
}

const edgeId = (start, end) => start + ':' + end;
