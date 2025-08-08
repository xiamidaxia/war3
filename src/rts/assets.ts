import * as THREE from 'three';

export const Colors = {
  ground: 0xbfd7b5,
  water: 0x7ec8e3,
  treeLeaf: 0x4caf50,
  treeTrunk: 0x8d6e63,
  gold: 0xffd54f,
  stone: 0x9e9e9e,
  teamBlue: 0x4a90e2,
  teamRed: 0xe94e77,
};

export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: Colors.treeTrunk, roughness: 1 })
  );
  trunk.position.y = 0.6;
  trunk.castShadow = true;

  const leaf = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.9, 0),
    new THREE.MeshStandardMaterial({ color: Colors.treeLeaf, flatShading: true, roughness: 1 })
  );
  leaf.position.y = 1.6;
  leaf.castShadow = true;

  g.add(trunk, leaf);
  return g;
}

export function makeGoldMine(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.2, 1.2, 8),
    new THREE.MeshStandardMaterial({ color: Colors.stone, flatShading: true })
  );
  base.position.y = 0.6;
  const gold = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.6, 0),
    new THREE.MeshStandardMaterial({ color: Colors.gold, emissive: 0xaa8800 })
  );
  gold.position.y = 1.4;
  g.add(base, gold);
  return g;
}

export function makeUnitMesh(role: 'peasant' | 'soldier'): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.25, 0.6, 4, 8),
    new THREE.MeshStandardMaterial({ color: role === 'peasant' ? 0xf5f5f5 : 0xd9d9d9 })
  );
  body.position.y = 0.7;
  const team = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 8),
    new THREE.MeshStandardMaterial({ color: Colors.teamBlue, emissive: 0x001133 })
  );
  team.position.set(0, 1.2, 0);
  g.add(body, team);
  return g;
}

export function makeBuildingMesh(type: 'townhall' | 'barracks'): THREE.Group {
  const g = new THREE.Group();
  const s = type === 'townhall' ? 2.2 : 1.8;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(s, 1.2, s),
    new THREE.MeshStandardMaterial({ color: 0xf0ede7 })
  );
  base.position.y = 0.6;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(s * 0.75, 1, 4),
    new THREE.MeshStandardMaterial({ color: 0xcf5a3b, flatShading: true })
  );
  roof.position.y = 1.7;
  roof.rotation.y = Math.PI / 4;
  g.add(base, roof);
  return g;
}

export function makeGroundTile(size: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size, 1, 1),
    new THREE.MeshStandardMaterial({ color })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}