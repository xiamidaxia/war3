// Three.js ESM from CDN
import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js';

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(50, app.clientWidth / app.clientHeight, 0.1, 1000);
camera.position.set(0, 2.2, 6);
scene.add(camera);

// Light
const hemi = new THREE.HemisphereLight(0xbfdfff, 0x3366aa, 0.85);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(5, 8, 3);
scene.add(dir);

// Sky gradient background via big sphere
const skyGeo = new THREE.SphereGeometry(80, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    topColor: { value: new THREE.Color('#9ad1ff') },
    bottomColor: { value: new THREE.Color('#2f73ff') }
  },
  vertexShader: /* glsl */`
    varying vec3 vPos;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos;
    void main(){
      float h = normalize(vPos).y * 0.5 + 0.5; // 0..1
      vec3 col = mix(bottomColor, topColor, smoothstep(0.0,1.0,h));
      gl_FragColor = vec4(col, 1.0);
    }
  `
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// Planet
const radius = 2.0;
const planet = new THREE.Group();
scene.add(planet);

// Ocean with toonish flow effect
const oceanGeom = new THREE.SphereGeometry(radius, 128, 128);
const oceanMat = new THREE.ShaderMaterial({
  transparent: false,
  uniforms: {
    uTime: { value: 0 },
    baseColor: { value: new THREE.Color('#56c5ff') },
    rimColor: { value: new THREE.Color('#bff2ff') }
  },
  vertexShader: /* glsl */`
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    void main(){
      vNormal = normalize(normalMatrix * normal);
      vec4 wp = modelMatrix * vec4(position,1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */`
    uniform float uTime; uniform vec3 baseColor; uniform vec3 rimColor;
    varying vec3 vNormal; varying vec3 vWorldPos;
    // simple toon bands using sin waves that drift around sphere
    float bands(vec3 p){
      float v = sin(8.0*p.x + uTime*0.7) + sin(8.0*p.y - uTime*0.6) + sin(8.0*p.z + uTime*0.5);
      v = v/3.0; // -1..1
      v = 0.5 + 0.5*v; // 0..1
      // quantize
      float q = floor(v*4.0)/4.0; // 4 bands
      return q;
    }
    void main(){
      vec3 n = normalize(vNormal);
      float rim = pow(1.0 - max(dot(n, normalize(cameraPosition - vWorldPos)), 0.0), 2.0);
      float b = bands(normalize(vWorldPos));
      vec3 col = mix(baseColor, rimColor, rim*0.9) * (0.75 + 0.25*b);
      gl_FragColor = vec4(col, 1.0);
    }
  `
});
const ocean = new THREE.Mesh(oceanGeom, oceanMat);
planet.add(ocean);

// Generate a random "continent" patch using noise on a shell slightly above ocean
const landGroup = new THREE.Group();
planet.add(landGroup);

function generateContinent() {
  landGroup.clear();
  const continentRadius = radius * 1.001; // just above water
  const geom = new THREE.IcosahedronGeometry(continentRadius, 6);
  const positions = geom.attributes.position;

  // pick a random center direction on sphere
  const center = new THREE.Vector3().randomDirection();
  const angularSize = THREE.MathUtils.degToRad(55 + Math.random()*15); // size of patch

  const elev = positions.clone();
  const color = new THREE.Color();
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(positions, i).normalize();
    // angular distance from center
    const angle = Math.acos(THREE.MathUtils.clamp(v.dot(center), -1, 1));
    let h = 0.0;
    if (angle < angularSize) {
      const t = 1.0 - angle / angularSize; // 0..1 inside patch
      // island falloff shape
      h = Math.pow(t, 1.5) * 0.22; // elevation
    }
    elev.setXYZ(i, v.x * (1.0 + h), v.y * (1.0 + h), v.z * (1.0 + h));
    // color bands grass/sand/rock
    let c;
    if (h < 0.02) c = new THREE.Color('#f7e08c'); // beach
    else if (h < 0.12) c = new THREE.Color('#7dd36f'); // grass
    else c = new THREE.Color('#6b7a84'); // rock
    colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
  }

  const landGeom = new THREE.BufferGeometry();
  landGeom.setIndex(geom.index);
  landGeom.setAttribute('position', elev);
  landGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  landGeom.computeVertexNormals();

  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0 });
  const land = new THREE.Mesh(landGeom, landMat);
  landGroup.add(land);

  // small city blocks and trees scattered on land, standing upright
  const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), new THREE.MeshStandardMaterial({ color: '#3a4c6b' }), 120);
  const treeMat = new THREE.MeshStandardMaterial({ color: '#2a8d3a' });
  const treeGeo = new THREE.ConeGeometry(0.08, 0.18, 8);
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, 150);

  const m = new THREE.Matrix4();
  const up = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1,1,1);

  const v = new THREE.Vector3();
  for (let i = 0, placed=0, tplaced=0; i < positions.count && (placed < instances.count || tplaced < trees.count); i+=40) {
    v.fromBufferAttribute(elev, i).normalize();
    // only place inside patch by checking radius diff
    const height = v.length();
    if (height < 1.01) continue; // water
    // convert to world position on land surface
    const pos = v.clone().multiplyScalar(radius * height);
    // local up is normal
    up.copy(v).normalize();
    // orient: make object's Y axis align with up
    quat.setFromUnitVectors(new THREE.Vector3(0,1,0), up);
    // random rotation around up
    const twist = new THREE.Quaternion().setFromAxisAngle(up, Math.random()*Math.PI*2);
    quat.multiply(twist);
    // instance matrix
    scale.setScalar(0.8 + Math.random()*0.6);
    m.compose(pos, quat, scale);

    if (placed < instances.count && Math.random() < 0.5) {
      instances.setMatrixAt(placed++, m);
    } else if (tplaced < trees.count) {
      const s = 0.7 + Math.random()*1.2; scale.set(1, s, 1); m.compose(pos, quat, scale);
      trees.setMatrixAt(tplaced++, m);
    }
  }
  instances.instanceMatrix.needsUpdate = true;
  trees.instanceMatrix.needsUpdate = true;
  landGroup.add(instances);
  landGroup.add(trees);
}

generateContinent();

// Airplane that orbits and drops items
const airplane = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.35, 6, 12), new THREE.MeshStandardMaterial({ color: '#e84d4d', roughness: 0.7 }));
const wing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: '#f6d16d' }));
wing.position.y = 0.02;
const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), wing.material);
tail.position.set(-0.18, 0.1, 0);
airplane.add(body, wing, tail);
scene.add(airplane);

const dropGroup = new THREE.Group();
scene.add(dropGroup);

function spawnDrop(worldPos) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: '#ffb454' }));
  mesh.position.copy(worldPos);
  mesh.userData = { velocity: new THREE.Vector3(), life: 0 };
  dropGroup.add(mesh);
}

function randomPlanetPoint() {
  // choose random direction
  const dir = new THREE.Vector3().randomDirection();
  return dir.multiplyScalar(radius * 1.02); // slightly above
}

let orbitAngle = 0;
let lastDrop = 0;

// Controls: drag to rotate planet only (not camera)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 9;
controls.addEventListener('change', () => renderer.render(scene, camera));

// reset camera on dblclick
renderer.domElement.addEventListener('dblclick', () => {
  camera.position.set(0, 2.2, 6);
  controls.target.set(0,0,0);
  controls.update();
});

// Resize
window.addEventListener('resize', () => {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
});

// Animate
const clock = new THREE.Clock();
function animate(){
  const t = clock.getElapsedTime();
  oceanMat.uniforms.uTime.value = t;

  // airplane orbit
  orbitAngle += 0.35 * clock.getDelta();
  const orbitRadius = radius * 3.0;
  const px = Math.cos(orbitAngle) * orbitRadius;
  const pz = Math.sin(orbitAngle) * orbitRadius;
  const py = Math.sin(orbitAngle*2.0) * orbitRadius * 0.15;
  airplane.position.set(px, py, pz);
  airplane.lookAt(0,0,0);

  // random drop every ~1.5-3s
  if (t - lastDrop > 1.5 + Math.random()*1.5) {
    lastDrop = t;
    const to = randomPlanetPoint();
    const from = airplane.position.clone();
    // midway point as initial position
    spawnDrop(from.clone());
    // store target
    dropGroup.children[dropGroup.children.length-1].userData.target = to;
  }

  // update drops: move toward target, align upright when reaching ground
  for (const cube of dropGroup.children) {
    const u = cube.userData; if (!u) continue;
    const to = u.target; if (!to) continue;
    if (!u.progress) u.progress = 0;
    u.progress += 0.01; // speed
    const p = new THREE.Vector3().lerpVectors(cube.position, to, 0.1);
    cube.position.copy(p);

    // if reached near planet surface, snap to surface and orient upright
    const d = cube.position.length();
    if (d <= radius * 1.02) {
      const n = cube.position.clone().normalize();
      cube.position.copy(n.multiplyScalar(radius * 1.02));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), n);
      cube.quaternion.copy(q);
      // stop moving further
      cube.userData.target = null;
    }
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// Expose regenerate API for quick testing in console
window.regenerateContinent = generateContinent;