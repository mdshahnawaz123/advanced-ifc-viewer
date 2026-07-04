import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Core 3D viewer — manages scene, camera, renderer, and controls.
 */
export class Viewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.clippingPlanes = [];
    this.highlightedMesh = null;
    this.originalMaterial = null;
    this.onElementSelected = null;
    this.renderCallbacks = [];

    this._initRenderer();
    this._initCamera();
    this._initControls();
    this._initLights();
    this._initGrid();
    this._initResize();
    this._animate();
  }

  /* ---- Renderer ---- */
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0x0a0a14, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);
  }

  /**
   * Capture a screenshot of the current canvas.
   * Returns a base64 encoded data URL (PNG)
   */
  captureScreenshot() {
    // Render once to ensure buffer is up to date
    this.renderer.render(this.scene, this.camera);
    // Grab the data URL from the canvas
    return this.renderer.domElement.toDataURL('image/png');
  }

  /* ---- Camera ---- */
  _initCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 10000);
    this.camera.position.set(30, 25, 30);
    this.camera.lookAt(0, 0, 0);
  }

  /* ---- Controls ---- */
  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 5000;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    };
  }

  /* ---- Lights ---- */
  _initLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xddeeff, 0x333355, 0.45);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(80, 120, 60);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 500;
    const d = 100;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    this.scene.add(dir);

    const fill = new THREE.DirectionalLight(0x99bbff, 0.3);
    fill.position.set(-40, 60, -30);
    this.scene.add(fill);
  }

  /* ---- Grid & Axes ---- */
  _initGrid() {
    this.gridHelper = new THREE.GridHelper(200, 200, 0x333355, 0x1a1a33);
    this.gridHelper.material.opacity = 0.4;
    this.gridHelper.material.transparent = true;
    this.scene.add(this.gridHelper);

    this.axesHelper = new THREE.AxesHelper(3);
    this.axesHelper.renderOrder = 999;
    this.axesHelper.material.depthTest = false;
    this.scene.add(this.axesHelper);
  }

  /* ---- Resize ---- */
  _initResize() {
    const observer = new ResizeObserver(() => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w === 0 || h === 0) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
    observer.observe(this.container);
  }

  /* ---- Render Loop ---- */
  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    for (const cb of this.renderCallbacks) cb();
    this.renderer.render(this.scene, this.camera);
  }

  /** Register a callback that runs every frame */
  onRender(callback) {
    this.renderCallbacks.push(callback);
  }

  /* ---- Fit camera to object ---- */
  fitToView(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.8;

    const startPos = this.camera.position.clone();
    const endPos = new THREE.Vector3(
      center.x + distance * 0.45,
      center.y + distance * 0.55,
      center.z + distance * 0.45
    );
    const startTarget = this.controls.target.clone();
    const startTime = performance.now();
    const duration = 600;

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      this.camera.position.lerpVectors(startPos, endPos, eased);
      this.controls.target.lerpVectors(startTarget, center, eased);
      this.controls.update();

      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  /* ---- Raycasting ---- */
  raycast(event, objects) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  /* ---- Highlight / Select ---- */
  highlightMesh(meshOrMeshes) {
    this.clearHighlight();
    if (!meshOrMeshes) return;

    const meshes = Array.isArray(meshOrMeshes) ? meshOrMeshes : [meshOrMeshes];
    if (meshes.length === 0) return;

    this.highlightedMeshes = meshes;
    this.originalMaterials = new Map();
    
    // Create or use a highlight material
    if (!this.highlightMaterial) {
      this.highlightMaterial = new THREE.MeshPhongMaterial({
        color: 0x00d4ff,
        transparent: true,
        opacity: 0.8,
        depthTest: false
      });
    }
    
    meshes.forEach(m => {
      this.originalMaterials.set(m, m.material);
      m.material = this.highlightMaterial;
    });
  }

  clearHighlight() {
    if (this.highlightedMeshes && this.originalMaterials) {
      this.highlightedMeshes.forEach(m => {
        if (this.originalMaterials.has(m)) {
          m.material = this.originalMaterials.get(m);
        }
      });
    }
    this.highlightedMeshes = [];
    this.originalMaterials = new Map();
  }

  /* ---- Visibility ---- */
  hideMeshes(meshOrMeshes) {
    if (!meshOrMeshes) return;
    const meshes = Array.isArray(meshOrMeshes) ? meshOrMeshes : [meshOrMeshes];
    meshes.forEach(m => m.visible = false);
  }

  isolateMeshes(meshOrMeshes) {
    if (!meshOrMeshes) return;
    const targets = Array.isArray(meshOrMeshes) ? meshOrMeshes : [meshOrMeshes];
    if (targets.length === 0) return;
    
    // Hide all model meshes, then show only targets
    this.getModelMeshes().forEach(m => m.visible = false);
    targets.forEach(m => m.visible = true);
  }

  showAll() {
    this.getModelMeshes().forEach(m => m.visible = true);
  }

  overrideColor(meshOrMeshes, colorHex) {
    if (!meshOrMeshes) return;
    const meshes = Array.isArray(meshOrMeshes) ? meshOrMeshes : [meshOrMeshes];
    
    meshes.forEach(m => {
      // Clone material to avoid affecting shared materials
      let newMat;
      if (Array.isArray(m.material)) {
        newMat = m.material[0].clone();
      } else if (m.material) {
        newMat = m.material.clone();
      } else {
        newMat = new THREE.MeshPhongMaterial();
      }
      
      newMat.color.setHex(colorHex);
      
      // If currently highlighted, update the saved original material
      if (this.highlightedMeshes && this.highlightedMeshes.includes(m)) {
        this.originalMaterials.set(m, newMat);
      } else {
        m.material = newMat;
      }
      
      m.userData.overriddenColor = colorHex;
    });
  }

  /* ---- Get all model meshes ---- */
  getModelMeshes() {
    const meshes = [];
    this.scene.traverse(child => {
      if (child.isMesh && child.userData.expressID !== undefined) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  /* ---- Scene bounding box (models only) ---- */
  getSceneBounds() {
    const box = new THREE.Box3();
    this.scene.traverse(child => {
      if (child.isMesh && child.userData.expressID !== undefined) {
        box.expandByObject(child);
      }
    });
    return box.isEmpty() ? null : box;
  }
}
