/**
 * main.js — Entry point. Creates Game, loads meta, starts loop.
 */
import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
window.__game = game;
game.start();
