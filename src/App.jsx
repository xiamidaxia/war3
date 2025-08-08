import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function App() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 2.2, 6);
    scene.add(camera);

    const hemi = new THREE.HemisphereLight(0xbfdfff, 0x3366aa, 0.85);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 8, 3);
    scene.add(dir);

    const skyGeo = new THREE.SphereGeometry(80, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color('#9ad1ff') },
        bottomColor: { value: new THREE.Color('#2f73ff') }
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos;
        void main(){
          float h = normalize(vPos).y * 0.5 + 0.5;
          vec3 col = mix(bottomColor, topColor, smoothstep(0.0,1.0,h));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    const radius = 2.0;
    const planet = new THREE.Group();
    scene.add(planet);

    const oceanGeom = new THREE.SphereGeometry(radius, 128, 128);
    const oceanMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        baseColor: { value: new THREE.Color('#56c5ff') },
        rimColor: { value: new THREE.Color('#bff2ff') }
      },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vWorldPos;
        void main(){
          vNormal = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime; uniform vec3 baseColor; uniform vec3 rimColor;
        varying vec3 vNormal; varying vec3 vWorldPos;
        float bands(vec3 p){
          float v = sin(8.0*p.x + uTime*0.7) + sin(8.0*p.y - uTime*0.6) + sin(8.0*p.z + uTime*0.5);
          v = v/3.0; v = 0.5 + 0.5*v; float q = floor(v*4.0)/4.0; return q;
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

    const landGroup = new THREE.Group();
    planet.add(landGroup);

    function generateContinent() {
      while (landGroup.children.length) {
        const c = landGroup.children.pop();
        c.traverse?.((n) => {
          if (n.geometry) n.geometry.dispose();
          if (n.material) {
            if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose());
            else n.material.dispose();
          }
        });
      }

      const continentRadius = radius * 1.001;
      const geom = new THREE.IcosahedronGeometry(continentRadius, 6);
      const positions = geom.attributes.position;
      const center = new THREE.Vector3().randomDirection();
      const angularSize = THREE.MathUtils.degToRad(55 + Math.random() * 15);

      const elev = positions.clone();
      const colors = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(positions, i).normalize();
        const angle = Math.acos(THREE.MathUtils.clamp(v.dot(center), -1, 1));
        let h = 0.0;
        if (angle < angularSize) {
          const t = 1.0 - angle / angularSize;
          h = Math.pow(t, 1.5) * 0.22;
        }
        elev.setXYZ(i, v.x * (1.0 + h), v.y * (1.0 + h), v.z * (1.0 + h));
        let c;
        if (h < 0.02) c = new THREE.Color('#f7e08c');
        else if (h < 0.12) c = new THREE.Color('#7dd36f');
        else c = new THREE.Color('#6b7a84');
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }

      const landGeom = new THREE.BufferGeometry();
      landGeom.setIndex(geom.index);
      landGeom.setAttribute('position', elev);
      landGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      landGeom.computeVertexNormals();

      const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0 });
      const land = new THREE.Mesh(landGeom, landMat);
      landGroup.add(land);

      const buildings = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.06, 0.2, 0.06),
        new THREE.MeshStandardMaterial({ color: '#3a4c6b' }),
        120
      );
      const treeGeo = new THREE.ConeGeometry(0.08, 0.18, 8);
      const trees = new THREE.InstancedMesh(
        treeGeo,
        new THREE.MeshStandardMaterial({ color: '#2a8d3a' }),
        150
      );

      const m = new THREE.Matrix4();
      const up = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      const v = new THREE.Vector3();
      for (let i = 0, bi = 0, ti = 0; i < positions.count && (bi < buildings.count || ti < trees.count); i += 40) {
        v.fromBufferAttribute(elev, i).normalize();
        const height = v.length();
        if (height < 1.01) continue;
        const pos = v.clone().multiplyScalar(radius * height);
        up.copy(v).normalize();
        quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        const twist = new THREE.Quaternion().setFromAxisAngle(up, Math.random() * Math.PI * 2);
        quat.multiply(twist);
        scale.setScalar(0.8 + Math.random() * 0.6);
        m.compose(pos, quat, scale);
        if (bi < buildings.count && Math.random() < 0.5) {
          buildings.setMatrixAt(bi++, m);
        } else if (ti < trees.count) {
          const s = 0.7 + Math.random() * 1.2; scale.set(1, s, 1); m.compose(pos, quat, scale);
          trees.setMatrixAt(ti++, m);
        }
      }
      buildings.instanceMatrix.needsUpdate = true;
      trees.instanceMatrix.needsUpdate = true;
      landGroup.add(buildings);
      landGroup.add(trees);
    }

    generateContinent();

    const airplane = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.08, 0.35, 6, 12),
      new THREE.MeshStandardMaterial({ color: '#e84d4d', roughness: 0.7 })
    );
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.02, 0.1),
      new THREE.MeshStandardMaterial({ color: '#f6d16d' })
    );
    wing.position.y = 0.02;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), wing.material);
    tail.position.set(-0.18, 0.1, 0);
    airplane.add(body, wing, tail);
    scene.add(airplane);

    const dropGroup = new THREE.Group();
    scene.add(dropGroup);

    function spawnDrop(worldPos) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.06),
        new THREE.MeshStandardMaterial({ color: '#ffb454' })
      );
      mesh.position.copy(worldPos);
      mesh.userData = { target: null, progress: 0 };
      dropGroup.add(mesh);
    }

    function randomPlanetPoint() {
      const dir = new THREE.Vector3().randomDirection();
      return dir.multiplyScalar(radius * 1.02);
    }

    let orbitAngle = 0;
    let lastDrop = 0;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 9;

    const clock = new THREE.Clock();
    let rafId = 0;

    function animate() {
      const t = clock.getElapsedTime();
      oceanMat.uniforms.uTime.value = t;

      orbitAngle += 0.35 * clock.getDelta();
      const orbitRadius = radius * 3.0;
      const px = Math.cos(orbitAngle) * orbitRadius;
      const pz = Math.sin(orbitAngle) * orbitRadius;
      const py = Math.sin(orbitAngle * 2.0) * orbitRadius * 0.15;
      airplane.position.set(px, py, pz);
      airplane.lookAt(0, 0, 0);

      if (t - lastDrop > 1.5 + Math.random() * 1.5) {
        lastDrop = t;
        const to = randomPlanetPoint();
        const from = airplane.position.clone();
        spawnDrop(from.clone());
        dropGroup.children[dropGroup.children.length - 1].userData.target = to;
      }

      for (const cube of dropGroup.children) {
        const u = cube.userData; if (!u || !u.target) continue;
        u.progress += 0.01;
        const p = new THREE.Vector3().lerpVectors(cube.position, u.target, 0.1);
        cube.position.copy(p);
        const d = cube.position.length();
        if (d <= radius * 1.02) {
          const n = cube.position.clone().normalize();
          cube.position.copy(n.multiplyScalar(radius * 1.02));
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
          cube.quaternion.copy(q);
          cube.userData.target = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    }
    animate();

    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);

    function onDblClick() {
      camera.position.set(0, 2.2, 6);
      controls.target.set(0, 0, 0);
      controls.update();
    }
    renderer.domElement.addEventListener('dblclick', onDblClick);

    // Expose regenerate function on window for quick testing
    window.regenerateContinent = generateContinent;

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('dblclick', onDblClick);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div id="app" ref={containerRef}>
      <div className="hud">拖拽旋转地球 · 双击复位 · 飞机会随机投放物品</div>
    </div>
  );
}