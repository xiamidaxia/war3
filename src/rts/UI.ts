import { World } from './World';

export class UI {
  private world: World;
  private elWood = document.getElementById('res-wood')!;
  private elGold = document.getElementById('res-gold')!;
  private elFood = document.getElementById('res-food')!;

  constructor(world: World) {
    this.world = world;
  }

  update() {
    const r = this.world.resources;
    this.elWood.textContent = `木材: ${r.wood}`;
    this.elGold.textContent = `黄金: ${r.gold}`;
    this.elFood.textContent = `人口: ${r.food}/${r.foodCap}`;
  }
}