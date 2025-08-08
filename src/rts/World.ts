import * as THREE from 'three';
import { Grid, AStarFinder, DiagonalMovement } from 'pathfinding';
import { makeTree, makeGoldMine, makeUnitMesh, makeBuildingMesh, Colors } from './assets';

export type ResourceType = 'wood' | 'gold';

export interface ResourceNode {
  id: number;
  type: ResourceType;
  amount: number;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
}

export type UnitRole = 'peasant' | 'soldier';
export type Faction = 'player' | 'enemy';

export interface Unit {
  id: number;
  role: UnitRole;
  faction: Faction;
  position: THREE.Vector3;
  target: THREE.Vector3 | null;
  path: THREE.Vector3[];
  mesh: THREE.Object3D;
  speed: number;
  selected: boolean;
  carrying?: { type: ResourceType; amount: number } | null;
  attackCooldown: number;
  hp: number;
}

export type BuildingType = 'townhall' | 'barracks';

export interface Building {
  id: number;
  type: BuildingType;
  position: THREE.Vector3;
  size: number; // square footprint in tiles
  mesh: THREE.Object3D;
  hp: number;
}

export interface Resources {
  wood: number;
  gold: number;
  food: number;
  foodCap: number;
}

export class World {
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.Camera;

  readonly gridSize = 64; // tiles
  readonly tileSize = 2; // world units per tile
  readonly halfSize = (this.gridSize * this.tileSize) / 2;

  private gridWalkable: boolean[][];
  private pfGrid: any;
  // AStar finder constructed on demand to avoid stale grid references

  readonly resources: Resources = { wood: 0, gold: 0, food: 0, foodCap: 4 };

  units: Unit[] = [];
  buildings: Building[] = [];
  resourceNodes: ResourceNode[] = [];

  // Fog of war via canvas texture
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private fogTexture: THREE.Texture;
  private fogMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private raycaster = new THREE.Raycaster();
  private ground: THREE.Mesh;

  private idCounter = 1;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;

    // Ground plane with tiles
    const groundGeo = new THREE.PlaneGeometry(this.gridSize * this.tileSize, this.gridSize * this.tileSize, this.gridSize, this.gridSize);
    const groundMat = new THREE.MeshStandardMaterial({ color: Colors.ground, roughness: 1, metalness: 0 });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Generate map
    this.gridWalkable = this.generateMap();
    this.pfGrid = new Grid(this.gridWalkable[0].length, this.gridWalkable.length, this.gridWalkable.map(row => row.map(cell => (cell ? 0 : 1))));

    // Fog of war setup
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.gridSize;
    this.fogCanvas.height = this.gridSize;
    this.fogCtx = this.fogCanvas.getContext('2d')!;
    this.fogTexture = new THREE.CanvasTexture(this.fogCanvas);
    this.fogTexture.minFilter = THREE.LinearFilter;
    // initialize fog fully covered once; later we only punch holes
    this.fogCtx.fillStyle = 'rgba(0,0,0,0.25)';
    this.fogCtx.fillRect(0, 0, this.gridSize, this.gridSize);
    const fogMat = new THREE.MeshBasicMaterial({ map: this.fogTexture, transparent: true, opacity: 0.95 });
    const fogGeo = new THREE.PlaneGeometry(this.gridSize * this.tileSize, this.gridSize * this.tileSize, 1, 1);
    this.fogMesh = new THREE.Mesh(fogGeo, fogMat);
    this.fogMesh.rotation.x = -Math.PI / 2;
    this.fogMesh.position.y = 0.21; // slightly above ground
    this.scene.add(this.fogMesh);

    // Initial entities
    const townhall = this.createBuilding('townhall', new THREE.Vector3(0, 0, 0));
    this.buildings.push(townhall);

    for (let i = 0; i < 4; i++) {
      const offset = new THREE.Vector3((i % 2) * 2 - 1, 0, Math.floor(i / 2) * 2 - 1).multiplyScalar(1.2);
      const unit = this.createUnit('peasant', townhall.position.clone().add(offset), 'player');
      this.units.push(unit);
    }

    // Spawn a few enemy soldiers at far side
    for (let i = 0; i < 5; i++) {
      const gx = this.gridSize - 8 + Math.floor(Math.random() * 4);
      const gz = 8 + Math.floor(Math.random() * 4);
      const pos = this.tileToWorld(gx, gz);
      const enemy = this.createUnit('soldier', pos, 'enemy');
      (enemy.mesh as any).material = (enemy.mesh as any).material?.clone?.();
      this.units.push(enemy);
    }

    this.revealFogAt(new THREE.Vector2(this.gridSize / 2, this.gridSize / 2), 6);
    this.updateFogTexture();
  }

  // Map generation inspired by Turtle Rock: central land with rivers and resource clusters
  private generateMap(): boolean[][] {
    const size = this.gridSize;
    const walkable: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => true));

    // Rivers: create 2-3 meandering lines
    const riverCount = 2;
    for (let r = 0; r < riverCount; r++) {
      let x = Math.floor(Math.random() * size);
      let z = 0;
      const dir = Math.random() < 0.5 ? 1 : -1;
      for (; z < size; z++) {
        const width = 2 + Math.floor(2 * Math.sin((z + r * 13) * 0.2) + 2 * Math.random());
        for (let dx = -width; dx <= width; dx++) {
          const gx = Math.max(0, Math.min(size - 1, x + dx));
          walkable[z][gx] = false; // water not walkable
        }
        x += dir * (Math.random() < 0.6 ? 1 : 0);
        x = Math.max(2, Math.min(size - 3, x));
      }
    }

    // Trees clusters
    const treeGroupCount = 30;
    for (let i = 0; i < treeGroupCount; i++) {
      const cx = Math.floor(Math.random() * size);
      const cz = Math.floor(Math.random() * size);
      const radius = 2 + Math.floor(Math.random() * 3);
      for (let z = -radius; z <= radius; z++) {
        for (let x = -radius; x <= radius; x++) {
          const gx = cx + x, gz = cz + z;
          if (gx < 1 || gz < 1 || gx >= size - 1 || gz >= size - 1) continue;
          if (!walkable[gz][gx]) continue;
          if (x * x + z * z <= radius * radius && Math.random() < 0.8) {
            // Place tree node occasionally leaving some walkable tile for paths between
            this.spawnTree(gx, gz);
          }
        }
      }
    }

    // Gold mines near corners
    const corners = [
      [4, 4],
      [size - 5, 4],
      [4, size - 5],
      [size - 5, size - 5],
    ];
    for (const [gx, gz] of corners) {
      if (walkable[gz][gx]) this.spawnGold(gx, gz);
    }

    // Visual river
    this.buildRivers(walkable);

    // Ground tiles slight color variation
    this.paintGround();

    return walkable;
  }

  private tileToWorld(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3((x + 0.5) * this.tileSize - this.halfSize, 0, (z + 0.5) * this.tileSize - this.halfSize);
  }

  private spawnTree(gx: number, gz: number) {
    const pos = this.tileToWorld(gx, gz);
    const tree = makeTree();
    tree.position.copy(pos);
    tree.castShadow = true;
    this.scene.add(tree);
    const node: ResourceNode = { id: this.idCounter++, type: 'wood', amount: 300, position: pos, mesh: tree };
    this.resourceNodes.push(node);
  }

  private spawnGold(gx: number, gz: number) {
    const pos = this.tileToWorld(gx, gz);
    const mine = makeGoldMine();
    mine.position.copy(pos);
    mine.castShadow = true;
    this.scene.add(mine);
    const node: ResourceNode = { id: this.idCounter++, type: 'gold', amount: 5000, position: pos, mesh: mine };
    this.resourceNodes.push(node);
  }

  private buildRivers(walkable: boolean[][]) {
    const waterGeo = new THREE.PlaneGeometry(this.gridSize * this.tileSize, this.gridSize * this.tileSize, this.gridSize, this.gridSize);
    const colors = [] as number[];
    for (let i = 0; i < walkable.length; i++) {
      for (let j = 0; j < walkable[i].length; j++) {
        const isWater = !walkable[i][j];
        const c = new THREE.Color(isWater ? Colors.water : Colors.ground);
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const waterMesh = new THREE.Mesh(waterGeo, mat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = 0.02;
    waterMesh.renderOrder = -1;
    this.scene.add(waterMesh);
  }

  private paintGround() {
    const geo = this.ground.geometry as THREE.PlaneGeometry;
    const colors = [] as number[];
    for (let i = 0; i < this.gridSize * this.gridSize; i++) {
      const jitter = (Math.random() - 0.5) * 0.05;
      const c = new THREE.Color(Colors.ground).offsetHSL(0, 0, jitter);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    (this.ground.material as THREE.MeshStandardMaterial).vertexColors = true as any;
  }

  createUnit(role: UnitRole, position: THREE.Vector3, faction: Faction = 'player'): Unit {
    const mesh = makeUnitMesh(role);
    mesh.position.copy(position);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const unit: Unit = { id: this.idCounter++, role, faction, position: position.clone(), target: null, path: [], mesh, speed: role === 'peasant' ? 6 : 7, selected: false, carrying: null, attackCooldown: 0, hp: role === 'peasant' ? 40 : 100 };
    return unit;
  }

  createBuilding(type: BuildingType, position: THREE.Vector3): Building {
    const mesh = makeBuildingMesh(type);
    mesh.position.copy(position);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const size = type === 'townhall' ? 3 : 2;
    const building: Building = { id: this.idCounter++, type, position: position.clone(), size, mesh, hp: type === 'townhall' ? 1500 : 800 };
    return building;
  }

  issueMove(units: Unit[], dest: THREE.Vector3) {
    const spread = Math.ceil(Math.sqrt(units.length));
    let i = 0;
    for (const u of units) {
      if (u.faction !== 'player') continue;
      const dx = (i % spread) - spread / 2;
      const dz = Math.floor(i / spread) - spread / 2;
      i++;
      const d = dest.clone().add(new THREE.Vector3(dx * 0.8, 0, dz * 0.8));
      u.target = d;
      u.path = this.findPath(u.position, d).map((p) => this.tileToWorld(p[0], p[1]));
    }
  }

  tryInteract(units: Unit[], point: THREE.Vector3) {
    // If clicking near a resource node, harvest
    const node = this.findNearestResource(point, 2.2);
    if (node) {
      for (const u of units) {
        if (u.role === 'peasant') {
          this.commandHarvest(u, node);
        } else {
          u.target = node.position.clone();
          u.path = this.findPath(u.position, u.target).map(p => this.tileToWorld(p[0], p[1]));
        }
      }
      return;
    }

    // Else move
    this.issueMove(units, point);
  }

  private commandHarvest(unit: Unit, node: ResourceNode) {
    unit.target = node.position.clone();
    unit.path = this.findPath(unit.position, unit.target).map(p => this.tileToWorld(p[0], p[1]));
    (unit as any).harvestNodeId = node.id;
  }

  private findNearestResource(point: THREE.Vector3, radius: number): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestDist = Infinity;
    for (const n of this.resourceNodes) {
      const d = n.position.distanceTo(point);
      if (d < radius && d < bestDist && n.amount > 0) { best = n; bestDist = d; }
    }
    return best;
  }

  private worldToTile(pos: THREE.Vector3): [number, number] {
    const x = Math.floor((pos.x + this.halfSize) / this.tileSize);
    const z = Math.floor((pos.z + this.halfSize) / this.tileSize);
    const gx = Math.max(0, Math.min(this.gridSize - 1, x));
    const gz = Math.max(0, Math.min(this.gridSize - 1, z));
    return [gx, gz];
  }

  private findPath(from: THREE.Vector3, to: THREE.Vector3): [number, number][] {
    const [sx, sz] = this.worldToTile(from);
    const [tx, tz] = this.worldToTile(to);
    const grid = this.pfGrid.clone();
    const path = new AStarFinder({ diagonalMovement: DiagonalMovement.Always }).findPath(sx, sz, tx, tz, grid) as [number, number][];
    return path;
  }

  castGroundRay(ndcX: number, ndcY: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera as THREE.PerspectiveCamera);
    const inter = this.raycaster.intersectObject(this.ground, false)[0];
    return inter ? inter.point : null;
  }

  update(dt: number) {
    // Update unit movement and behaviors
    const neighborRadius = 0.6;
    const alive: Unit[] = [];

    for (const u of this.units) {
      // simple avoidance
      let avoidance = new THREE.Vector3();
      for (const v of this.units) {
        if (u === v) continue;
        const d = u.position.distanceTo(v.position);
        if (d < neighborRadius && d > 0.0001) {
          const push = u.position.clone().sub(v.position).setY(0).normalize().multiplyScalar((neighborRadius - d) * 2);
          avoidance.add(push);
        }
      }

      // Auto target nearest enemy
      const enemy = this.findNearestEnemy(u, 8);
      if (enemy) {
        const dist = u.position.distanceTo(enemy.position);
        if (dist > 1.3) {
          // chase
          if (u.attackCooldown <= 0.1) {
            u.path = this.findPath(u.position, enemy.position).map(p => this.tileToWorld(p[0], p[1]));
          }
        } else {
          // attack
          if (u.attackCooldown <= 0) {
            enemy.hp -= u.role === 'soldier' ? 15 : 5;
            u.attackCooldown = 0.8;
          }
        }
      }

      if (u.path.length > 0) {
        const target = u.path[0];
        const to = target.clone().sub(u.position);
        const dist = to.length();
        if (dist < 0.2) {
          u.path.shift();
        } else {
          const dir = to.normalize();
          const vel = dir.multiplyScalar(u.speed * dt).add(avoidance.multiplyScalar(dt));
          u.position.add(vel);
          u.mesh.position.copy(u.position);
        }
      }

      // harvest behavior
      if ((u as any).harvestNodeId) {
        const node = this.resourceNodes.find(n => n.id === (u as any).harvestNodeId);
        if (node) {
          const dist = u.position.distanceTo(node.position);
          if (dist < 1.2) {
            node.amount -= 1;
            if (!u.carrying) u.carrying = { type: node.type, amount: 0 };
            u.carrying.amount += 1;
            if (u.carrying.amount >= 10 || node.amount <= 0) {
              const th = this.buildings.find(b => b.type === 'townhall');
              if (th) {
                u.target = th.position.clone();
                u.path = this.findPath(u.position, u.target).map(p => this.tileToWorld(p[0], p[1]));
                (u as any).returning = true;
              }
            }
          }
          if ((u as any).returning) {
            const th = this.buildings.find(b => b.type === 'townhall');
            if (th && u.position.distanceTo(th.position) < 1.6) {
              if (u.carrying) {
                this.resources[u.carrying.type] += u.carrying.amount;
                u.carrying = null;
              }
              (u as any).returning = false;
              if (node.amount > 0) this.commandHarvest(u, node);
            }
          }
        }
      }

      // cooldown
      u.attackCooldown -= dt;

      // death check
      if (u.hp > 0) alive.push(u); else {
        this.scene.remove(u.mesh);
      }
    }

    this.units = alive;

    // Fog of war reveal around player units
    const reveals = this.units.filter(u => u.faction === 'player').map(u => this.worldToTile(u.position));
    for (const [x, z] of reveals) {
      this.revealFogAt(new THREE.Vector2(x, z), 5);
    }
    this.updateFogTexture();
  }

  private findNearestEnemy(u: Unit, radius: number): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const v of this.units) {
      if (v.faction === u.faction) continue;
      const d = v.position.distanceTo(u.position);
      if (d < radius && d < bestD) { best = v; bestD = d; }
    }
    return best;
  }

  private revealFogAt(tile: THREE.Vector2, radius: number) {
    const g = this.fogCtx;
    const grad = g.createRadialGradient(tile.x, tile.y, 1, tile.x, tile.y, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.95)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = grad as any;
    g.beginPath();
    g.arc(tile.x, tile.y, radius, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  private updateFogTexture() {
    this.fogTexture.needsUpdate = true;
  }
}