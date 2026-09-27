/**
 * iso.js — Isometric projection utilities.
 * Brief formula:  x = originX + (u - v) × 0.866 × (TILE_W/2)
 *                 y = originY + (u + v) × 0.5  × TILE_H
 * Which simplifies to:
 *                 x = originX + (u - v) × ISO_H
 *                 y = originY + (u + v) × ISO_V
 */
import { ISO_H, ISO_V } from './constants.js';

/**
 * Ground (u,v) → screen (x,y).
 * @param {number} u @param {number} v
 * @param {number} ox origin X @param {number} oy origin Y
 */
export function isoProject(u, v, ox = 0, oy = 0) {
  return {
    x: ox + (u - v) * ISO_H,
    y: oy + (u + v) * ISO_V,
  };
}

/**
 * Screen delta (dx,dy) → ground delta (du,dv).
 * Used to map WASD onto the isometric ground plane.
 */
export function screenToGround(dx, dy) {
  const du =  dx / (ISO_H * 2) + dy / (ISO_V * 2);
  const dv = -dx / (ISO_H * 2) + dy / (ISO_V * 2);
  return { du, dv };
}

/** Depth sort key: larger = drawn later (closer to camera). */
export function depthKey(u, v) { return u + v; }
