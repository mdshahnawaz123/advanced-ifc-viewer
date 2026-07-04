import * as THREE from 'three';

/**
 * Interactive View Cube — 3D orientation indicator that syncs with main camera.
 * Click on faces for quick view changes.
 */
export class ViewCube {
  constructor(container, mainCamera, mainControls) {
    this.container = container;
    this.mainCamera = mainCamera;
    this.mainControls = mainControls;
    this.onViewSelected = null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 0, 4);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(120, 120);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    this._createCube();
    this._createAxes();
    this._initInteraction();
  }

  /** Called by the main render loop to sync orientation */
  update() {
    // Position mini camera to match main camera direction
    const dir = new THREE.Vector3();
    dir.subVectors(this.mainCamera.position, this.mainControls.target).normalize();

    this.camera.position.copy(dir.multiplyScalar(4));
    this.camera.lookAt(0, 0, 0);
    this.camera.up.copy(this.mainCamera.up);

    this.renderer.render(this.scene, this.camera);
  }

  /* ---- Cube Creation ---- */

  _createCube() {
    const size = 1;
    const geometry = new THREE.BoxGeometry(size, size, size);

    // Faces: +X Right, -X Left, +Y Top, -Y Bottom, +Z Front, -Z Back
    const faceConfigs = [
      { label: 'R',  bg: '#5c3daf', text: '#e0d4ff' },  // Right  (+X)
      { label: 'L',  bg: '#5c3daf', text: '#e0d4ff' },  // Left   (-X)
      { label: 'T',  bg: '#0088cc', text: '#ccf0ff' },  // Top    (+Y)
      { label: 'B',  bg: '#0088cc', text: '#ccf0ff' },  // Bottom (-Y)
      { label: 'F',  bg: '#008855', text: '#ccffdd' },  // Front  (+Z)
      { label: 'Bk', bg: '#008855', text: '#ccffdd' },  // Back   (-Z)
    ];

    const materials = faceConfigs.map(cfg => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = cfg.bg;
      ctx.fillRect(0, 0, 128, 128);

      // Inner highlight
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 80);
      grad.addColorStop(0, 'rgba(255,255,255,0.12)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, 124, 124);

      // Label
      ctx.fillStyle = cfg.text;
      ctx.font = 'bold 44px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.label, 64, 66);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      return new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.9 });
    });

    this.cube = new THREE.Mesh(geometry, materials);
    this.scene.add(this.cube);

    // Edge outline
    const edgesGeom = new THREE.EdgesGeometry(geometry);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35
    });
    const edges = new THREE.LineSegments(edgesGeom, edgesMat);
    this.cube.add(edges);
  }

  _createAxes() {
    // Mini axis indicators
    const axisLen = 0.95;
    const colors = [0xff4444, 0x44cc44, 0x4488ff]; // X=red, Y=green, Z=blue
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    ];

    for (let i = 0; i < 3; i++) {
      const arrow = new THREE.ArrowHelper(dirs[i], new THREE.Vector3(0, 0, 0), axisLen, colors[i], 0.12, 0.06);
      this.scene.add(arrow);
    }
  }

  /* ---- Interaction ---- */

  _initInteraction() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    this.container.addEventListener('click', (event) => {
      const rect = this.container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, this.camera);
      const intersects = raycaster.intersectObject(this.cube);

      if (intersects.length > 0) {
        // BoxGeometry material indices: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
        const faceIndex = intersects[0].face.materialIndex;
        const viewMap = ['right', 'left', 'top', 'bottom', 'front', 'back'];
        const view = viewMap[faceIndex];

        if (view && this.onViewSelected) {
          this.onViewSelected(view);
        }
      }
    });

    // Hover cursor
    this.container.addEventListener('mouseenter', () => {
      this.container.style.cursor = 'pointer';
    });
    this.container.addEventListener('mouseleave', () => {
      this.container.style.cursor = 'default';
    });
  }
}
