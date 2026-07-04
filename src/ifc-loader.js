import * as THREE from 'three';

/**
 * IFC file loader using web-ifc WASM engine.
 * Parses IFC geometry and creates Three.js meshes.
 */

let ifcAPI = null;

/** Initialize the web-ifc engine (lazy singleton) */
export async function initIFC() {
  if (ifcAPI) return ifcAPI;

  // Dynamic import to avoid top-level WASM issues
  const WebIFC = await import('web-ifc');
  ifcAPI = new WebIFC.IfcAPI();
  ifcAPI.SetWasmPath('/');
  await ifcAPI.Init();
  return ifcAPI;
}

/**
 * Load an IFC file buffer and return a Three.js Group of meshes.
 * @param {ArrayBuffer} buffer - Raw IFC file data
 * @returns {Promise<{group: THREE.Group, modelID: number}>}
 */
export async function loadIFCFile(buffer) {
  const api = await initIFC();
  const data = new Uint8Array(buffer);

  const modelID = api.OpenModel(data, {
    COORDINATE_TO_ORIGIN: true,
    USE_FAST_BOOLS: true
  });

  const group = new THREE.Group();
  group.name = 'IFCModel';

  const geometryCache = new Map();
  const materialCache = new Map();
  let meshCount = 0;

  const flatMeshes = api.LoadAllGeometry(modelID);

  for (let i = 0; i < flatMeshes.size(); i++) {
    const flatMesh = flatMeshes.get(i);
    const expressID = flatMesh.expressID;

    for (let j = 0; j < flatMesh.geometries.size(); j++) {
      const placed = flatMesh.geometries.get(j);
      const geomID = placed.geometryExpressID;
      const color = placed.color;
      const transform = placed.flatTransformation;

      /* --- Geometry (cached) --- */
      let geometry;
      if (geometryCache.has(geomID)) {
        geometry = geometryCache.get(geomID);
      } else {
        const ifcGeom = api.GetGeometry(modelID, geomID);
        const rawVerts = api.GetVertexArray(
          ifcGeom.GetVertexData(),
          ifcGeom.GetVertexDataSize()
        );
        const rawIdx = api.GetIndexArray(
          ifcGeom.GetIndexData(),
          ifcGeom.GetIndexDataSize()
        );

        // Vertex data is interleaved: x, y, z, nx, ny, nz (6 floats per vertex)
        const vertCount = rawVerts.length / 6;
        const positions = new Float32Array(vertCount * 3);
        const normals = new Float32Array(vertCount * 3);

        for (let k = 0; k < vertCount; k++) {
          const src = k * 6;
          const dst = k * 3;
          positions[dst] = rawVerts[src];
          positions[dst + 1] = rawVerts[src + 1];
          positions[dst + 2] = rawVerts[src + 2];
          normals[dst] = rawVerts[src + 3];
          normals[dst + 1] = rawVerts[src + 4];
          normals[dst + 2] = rawVerts[src + 5];
        }

        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(rawIdx), 1));

        ifcGeom.delete();
        geometryCache.set(geomID, geometry);
      }

      /* --- Material (cached by color) --- */
      const colorKey = `${color.x.toFixed(3)}_${color.y.toFixed(3)}_${color.z.toFixed(3)}_${color.w.toFixed(3)}`;
      let material;
      if (materialCache.has(colorKey)) {
        material = materialCache.get(colorKey);
      } else {
        material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(color.x, color.y, color.z),
          opacity: color.w,
          transparent: color.w < 0.999,
          side: THREE.DoubleSide,
          depthWrite: color.w >= 0.999,
          flatShading: false
        });
        materialCache.set(colorKey, material);
      }

      /* --- Mesh --- */
      const mesh = new THREE.Mesh(geometry, material);
      const matrix = new THREE.Matrix4().fromArray(transform);
      mesh.applyMatrix4(matrix);
      mesh.userData.expressID = expressID;
      mesh.userData.modelID = modelID;
      mesh.receiveShadow = true;
      mesh.castShadow = true;

      group.add(mesh);
      meshCount++;
    }
  }

  group.userData.modelID = modelID;
  group.userData.meshCount = meshCount;

  console.log(`✅ Loaded IFC model (ID: ${modelID}) — ${meshCount} meshes`);
  return { group, modelID };
}

/**
 * Get basic properties for an IFC element.
 * @param {number} modelID
 * @param {number} expressID
 * @returns {object|null}
 */
export function getElementProperties(modelID, expressID) {
  if (!ifcAPI) return null;

  try {
    const line = ifcAPI.GetLine(modelID, expressID);
    const result = {
      expressID,
      type: line.constructor?.name || 'Unknown',
      properties: {}
    };

    // Extract readable properties
    for (const [key, value] of Object.entries(line)) {
      if (key === 'expressID' || key === 'type') continue;
      if (value === null || value === undefined) continue;

      if (typeof value === 'object' && value.value !== undefined) {
        result.properties[key] = value.value;
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result.properties[key] = value;
      }
    }

    return result;
  } catch (e) {
    console.warn('Could not get properties for expressID:', expressID, e);
    return { expressID, type: 'Element', properties: {} };
  }
}

/** Get the IFC API instance (for advanced use) */
export function getIfcAPI() {
  return ifcAPI;
}

/**
 * Summarize model elements by iterating over loaded geometry.
 * Yields periodically to avoid freezing the UI.
 * @param {THREE.Group} group - The loaded THREE.Group containing meshes
 * @returns {Promise<Object>} Dictionary of { "Type": count }
 */
export async function summarizeModel(group) {
  if (!ifcAPI) return {};
  
  const summary = {};
  const meshes = group.children;
  const modelID = group.userData.modelID;

  for (let i = 0; i < meshes.length; i++) {
    const expressID = meshes[i].userData.expressID;
    if (expressID !== undefined) {
      try {
        const line = ifcAPI.GetLine(modelID, expressID);
        const type = line?.constructor?.name || 'Unknown';
        meshes[i].userData.ifcType = type;
        summary[type] = (summary[type] || 0) + 1;
      } catch (e) {
        // ignore errors for individual elements
      }
    }

    // Yield every 100 elements to prevent UI freeze
    if (i % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return summary;
}
