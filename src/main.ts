import { Game } from './rts/Game';
import './style.css';

const container = document.querySelector<HTMLDivElement>('#app');
if (!container) {
  throw new Error('Missing #app container');
}

const game = new Game(container);
(game as any).debug = false;

// Expose for quick debugging in devtools
(Object.assign(window as any, { game }));
