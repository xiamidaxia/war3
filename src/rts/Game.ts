import * as THREE from 'three';
import { World } from './World';
import { Input } from './Input';
import { UI } from './UI';

export class Game {
  readonly container: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly world: World;
  readonly input: Input;
  readonly ui: UI;

  private lastTime = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfe7da);

    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
    this.camera.position.set(40, 50, 40);
    this.camera.lookAt(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x88aabb, 0.8);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(50, 80, 30);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    this.scene.add(dir);

    this.world = new World(this.scene, this.renderer, this.camera);
    this.input = new Input(this.renderer.domElement, this.camera, this.world);
    this.ui = new UI(this.world);

    window.addEventListener('resize', () => this.onResize());
    this.onResize();

    requestAnimationFrame((t) => this.loop(t));
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop(ts: number) {
    const dt = Math.min(0.05, (ts - this.lastTime) / 1000);
    this.lastTime = ts;

    this.input.update(dt);
    this.world.update(dt);
    this.ui.update();

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.loop(t));
  }
}