import * as THREE from 'three';
import type { World, Unit } from './World';

export class Input {
  private dom: HTMLCanvasElement;
  private camera: THREE.PerspectiveCamera;
  private world: World;

  private isDragging = false;
  private dragStart = new THREE.Vector2();
  private dragEnd = new THREE.Vector2();
  private selectionRect: HTMLDivElement;

  private selected: Unit[] = [];

  private edgeScrollMargin = 24;
  private edgeScrollSpeed = 30;

  constructor(dom: HTMLCanvasElement, camera: THREE.PerspectiveCamera, world: World) {
    this.dom = dom;
    this.camera = camera;
    this.world = world;

    this.selectionRect = document.getElementById('selection-rect') as HTMLDivElement;

    dom.addEventListener('mousedown', (e) => this.onMouseDown(e));
    dom.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => this.onWheel(e));

    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    // Toolbar bindings
    document.getElementById('train-peasant')?.addEventListener('click', () => this.train('peasant'));
    document.getElementById('train-soldier')?.addEventListener('click', () => this.train('soldier'));
    document.getElementById('build-townhall')?.addEventListener('click', () => this.place('townhall'));
    document.getElementById('build-barracks')?.addEventListener('click', () => this.place('barracks'));
  }

  update(dt: number) {
    // Edge scroll
    const rect = this.dom.getBoundingClientRect();
    const mx = (window as any).lastMouseX ?? rect.width / 2;
    const my = (window as any).lastMouseY ?? rect.height / 2;

    const camRight = new THREE.Vector3();
    this.camera.getWorldDirection(camRight);
    camRight.cross(new THREE.Vector3(0, 1, 0)).normalize();
    const camForward = new THREE.Vector3();
    this.camera.getWorldDirection(camForward);
    camForward.y = 0; camForward.normalize();

    if (mx < this.edgeScrollMargin) this.camera.position.add(camRight.clone().multiplyScalar(-this.edgeScrollSpeed * dt));
    if (mx > rect.width - this.edgeScrollMargin) this.camera.position.add(camRight.clone().multiplyScalar(this.edgeScrollSpeed * dt));
    if (my < this.edgeScrollMargin) this.camera.position.add(camForward.clone().multiplyScalar(this.edgeScrollSpeed * dt));
    if (my > rect.height - this.edgeScrollMargin) this.camera.position.add(camForward.clone().multiplyScalar(-this.edgeScrollSpeed * dt));
  }

  private onMouseDown(e: MouseEvent) {
    (window as any).lastMouseX = e.clientX; (window as any).lastMouseY = e.clientY;
    if (e.button === 0) {
      this.isDragging = true;
      this.dragStart.set(e.clientX, e.clientY);
      this.dragEnd.copy(this.dragStart);
      this.updateSelectionRect();
      this.selectionRect.style.display = 'block';
    }
    if (e.button === 2) {
      const p = this.ndcToGround(e.clientX, e.clientY);
      if (p) this.world.tryInteract(this.selected, p);
    }
  }

  private onMouseMove(e: MouseEvent) {
    (window as any).lastMouseX = e.clientX; (window as any).lastMouseY = e.clientY;
    if (this.isDragging) {
      this.dragEnd.set(e.clientX, e.clientY);
      this.updateSelectionRect();
    }
  }

  private onMouseUp(e: MouseEvent) {
    if (e.button === 0 && this.isDragging) {
      this.isDragging = false;
      this.selectionRect.style.display = 'none';
      this.applySelection();
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    this.camera.position.y = Math.max(10, Math.min(120, this.camera.position.y + delta * 3));
  }

  private updateSelectionRect() {
    const x = Math.min(this.dragStart.x, this.dragEnd.x);
    const y = Math.min(this.dragStart.y, this.dragEnd.y);
    const w = Math.abs(this.dragEnd.x - this.dragStart.x);
    const h = Math.abs(this.dragEnd.y - this.dragStart.y);
    const el = this.selectionRect;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
  }

  private applySelection() {
    const rect = this.selectionRect.getBoundingClientRect();

    const newly: Unit[] = [];
    for (const u of this.world.units) {
      if (u.faction !== 'player') continue;
      const screen = this.worldToScreen(u.position.clone());
      if (!screen) continue;
      if (
        screen.x >= rect.left && screen.x <= rect.right &&
        screen.y >= rect.top && screen.y <= rect.bottom
      ) newly.push(u);
      u.selected = false;
    }
    for (const u of newly) u.selected = true;
    this.selected = newly;
  }

  private worldToScreen(pos: THREE.Vector3): THREE.Vector2 | null {
    const v = pos.clone().project(this.camera);
    const rect = this.dom.getBoundingClientRect();
    const x = (v.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
    return new THREE.Vector2(x, y);
  }

  private ndcToGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.dom.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    return this.world.castGroundRay(x, y);
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;
    switch (e.key.toLowerCase()) {
      case 'a':
        // Move camera left
        this.camera.position.x -= 2;
        break;
      case 'd':
        this.camera.position.x += 2;
        break;
      case 'w':
        this.camera.position.z -= 2;
        break;
      case 's':
        this.camera.position.z += 2;
        break;
      case 'p':
        this.train('peasant');
        break;
      case 's': // already used for camera; ignore
        break;
      case 't':
        this.place('townhall');
        break;
      case 'b':
        this.place('barracks');
        break;
    }
  }

  private train(role: 'peasant' | 'soldier') {
    const th = this.world.buildings.find(b => b.type === 'townhall');
    if (!th) return;
    const u = this.world.createUnit(role, th.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)));
    this.world.units.push(u);
    this.world.resources.food += 1;
    this.world.resources.foodCap = Math.max(this.world.resources.foodCap, this.world.resources.food + 4);
  }

  private place(type: 'townhall' | 'barracks') {
    // Place at mouse ground position
    const pos = this.ndcToGround((window as any).lastMouseX ?? 0, (window as any).lastMouseY ?? 0);
    if (!pos) return;
    const b = this.world.createBuilding(type, pos);
    this.world.buildings.push(b);
  }
}