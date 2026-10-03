// Procedural canvas textures: facades (with matching lit-window emissive maps), storefronts,
// roads, ground and the for-sale coin. No image assets — everything is drawn in code.
import * as THREE from 'three';
import type { Theme, WindowStyle } from './themes';
import { makeRng, next } from '../core/rng';

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
};
function tex(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function noise(g: CanvasRenderingContext2D, w: number, h: number, amt: number, seed: number) {
  const r = makeRng(seed);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (next(r) - 0.5) * amt;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

export interface Facade { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture; bays: number; floors: number; }
const CELL = 128;
const GRID = 4;

/** 4×4 window cells; walls are white so per-building vertex colours tint them. `palette` (neon
 *  cities) colours lit curtain-wall floors individually instead of one glow colour. */
export function facade(style: WindowStyle, seed: number, glow: number, palette?: number[]): Facade {
  const S = CELL * GRID;
  const [c, g] = canvas(S, S);
  const [e, ge] = canvas(S, S);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const r = makeRng(seed);
  // Wall base
  if (style === 'curtain') {
    g.fillStyle = '#9fb4c8'; g.fillRect(0, 0, S, S);
  } else {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  }
  if (style === 'brick') {
    for (let y = 0; y < S; y += 12) {
      const off = (y / 12) % 2 ? 16 : 0;
      for (let x = -32; x < S; x += 32) {
        const v = 225 + Math.floor(next(r) * 30);
        g.fillStyle = `rgb(${v},${v - 8},${v - 14})`;
        g.fillRect(x + off + 1, y + 1, 30, 10);
      }
    }
  }
  if (style === 'clapboard') {
    for (let y = 0; y < S; y += 10) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, y + 8, S, 2); }
  }
  if (style !== 'curtain' && style !== 'brick') noise(g, S, S, 10, seed + 1);

  const lit = `rgba(${(glow >> 16) & 255},${(glow >> 8) & 255},${glow & 255},1)`;
  for (let cy = 0; cy < GRID; cy++) for (let cx = 0; cx < GRID; cx++) {
    const ox = cx * CELL, oy = cy * CELL;
    const on = next(r) < 0.5;
    const tone = 40 + Math.floor(next(r) * 25);
    const glass = (x: number, y: number, w: number, h: number) => {
      const grd = g.createLinearGradient(x, y, x + w, y + h);
      grd.addColorStop(0, `rgb(${tone + 25},${tone + 40},${tone + 55})`);
      grd.addColorStop(1, `rgb(${tone - 10},${tone},${tone + 12})`);
      g.fillStyle = grd; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(x + w * 0.15, y + h); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.6, y); g.lineTo(x + w * 0.3, y + h); g.fill();
      if (style === 'curtain') {
        // Curtain walls light individual office floors (not whole cells, which tiled into a
        // grey/white checkerboard at night — critic #6e), each in its own colour on neon cities.
        const strips = 4, sh = h / strips;
        for (let k = 0; k < strips; k++) {
          if (next(r) > 0.42) continue;
          const col = palette ? palette[Math.floor(next(r) * palette.length)] : glow;
          ge.fillStyle = hex(col);
          ge.globalAlpha = 0.5 + next(r) * 0.45;
          ge.fillRect(x + 2, y + k * sh + 2, w - 4, sh - 4);
          ge.globalAlpha = 1;
          ge.fillStyle = 'rgba(0,0,0,0.55)';
          for (let xx = x + 10; xx < x + w; xx += 14) ge.fillRect(xx, y + k * sh + 2, 2, sh - 4);
        }
      } else if (on) {
        ge.fillStyle = lit;
        ge.globalAlpha = 0.65 + next(r) * 0.35;
        ge.fillRect(x, y, w, h);
        ge.globalAlpha = 1;
      }
    };
    switch (style) {
      case 'shutter':
        glass(ox + 42, oy + 26, 44, 74);
        g.fillStyle = '#5b8fb8'; g.fillRect(ox + 26, oy + 26, 15, 74); g.fillRect(ox + 87, oy + 26, 15, 74);
        g.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < 74; k += 6) { g.fillRect(ox + 26, oy + 26 + k, 15, 2); g.fillRect(ox + 87, oy + 26 + k, 15, 2); }
        g.fillStyle = '#e8e0d2'; g.fillRect(ox + 22, oy + 100, 84, 6);
        break;
      case 'adobe':
        g.fillStyle = 'rgba(90,50,25,0.35)'; g.fillRect(ox + 40, oy + 36, 48, 52);
        glass(ox + 46, oy + 42, 36, 42);
        g.fillStyle = '#6b4a35'; g.fillRect(ox + 38, oy + 30, 52, 6);
        break;
      case 'clapboard':
        g.fillStyle = '#ffffff'; g.fillRect(ox + 34, oy + 22, 60, 80);
        glass(ox + 40, oy + 28, 48, 68);
        g.fillStyle = '#ffffff'; g.fillRect(ox + 62, oy + 28, 4, 68); g.fillRect(ox + 40, oy + 60, 48, 4);
        g.fillStyle = '#3f5a6b'; g.fillRect(ox + 24, oy + 22, 9, 80); g.fillRect(ox + 95, oy + 22, 9, 80);
        break;
      case 'arched': {
        g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(ox + 36, oy + 104); g.lineTo(ox + 36, oy + 50); g.arc(ox + 64, oy + 50, 28, Math.PI, 0); g.lineTo(ox + 92, oy + 104); g.fill();
        g.save(); g.beginPath(); g.moveTo(ox + 42, oy + 100); g.lineTo(ox + 42, oy + 52); g.arc(ox + 64, oy + 52, 22, Math.PI, 0); g.lineTo(ox + 86, oy + 100); g.clip();
        glass(ox + 42, oy + 30, 44, 70); g.restore();
        g.fillStyle = '#ffffff'; g.fillRect(ox + 28, oy + 104, 72, 8);
        for (let k = 0; k < 8; k++) g.fillRect(ox + 30 + k * 9, oy + 92, 3, 12);
        break;
      }
      case 'brick':
        g.fillStyle = '#d9d2c7'; g.fillRect(ox + 28, oy + 16, 72, 94);
        glass(ox + 32, oy + 20, 64, 86);
        g.fillStyle = '#3a3f45';
        for (let k = 1; k < 3; k++) g.fillRect(ox + 32 + k * 21, oy + 20, 3, 86);
        for (let k = 1; k < 4; k++) g.fillRect(ox + 32, oy + 20 + k * 21, 64, 3);
        g.fillStyle = '#b9b2a6'; g.fillRect(ox + 24, oy + 108, 80, 8);
        break;
      case 'curtain':
        glass(ox + 3, oy + 6, CELL - 6, CELL - 14);
        g.fillStyle = '#d8e0ea'; g.fillRect(ox, oy + CELL - 8, CELL, 8); g.fillRect(ox, oy, 3, CELL); g.fillRect(ox + CELL / 2 - 1, oy, 2, CELL);
        break;
    }
  }
  return { map: tex(c), emissive: tex(e), bays: GRID, floors: GRID };
}

/** Storefront strip: 2 bays of display glass + door. Emissive = shop lights at night. */
export function storefront(seed: number, glow: number): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const [c, g] = canvas(512, 256);
  const [e, ge] = canvas(512, 256);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 256);
  noise(g, 512, 256, 8, seed);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 512, 256);
  for (let b = 0; b < 2; b++) {
    const ox = b * 256;
    const grd = g.createLinearGradient(ox, 60, ox + 200, 230);
    grd.addColorStop(0, '#46586a'); grd.addColorStop(1, '#1d2731');
    g.fillStyle = grd; g.fillRect(ox + 18, 60, 166, 160);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(ox + 40, 60, 26, 160); g.fillRect(ox + 80, 60, 8, 160);
    g.fillStyle = '#2b2b2b'; g.fillRect(ox + 196, 80, 46, 176);
    g.fillStyle = '#c9a227'; g.fillRect(ox + 232, 160, 4, 18);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(ox + 12, 220, 178, 36);
    ge.fillStyle = `#${glow.toString(16).padStart(6, '0')}`;
    ge.fillRect(ox + 18, 60, 166, 160); ge.globalAlpha = 0.5; ge.fillRect(ox + 196, 80, 46, 176); ge.globalAlpha = 1;
  }
  return { map: tex(c), emissive: tex(e) };
}

export function roadTexture(asphalt: number, line: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = hex(asphalt); g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 18, 7);
  g.fillStyle = hex(line);
  for (let y = 0; y < 256; y += 64) g.fillRect(124, y + 8, 8, 34);
  g.globalAlpha = 0.85; g.fillRect(10, 0, 5, 256); g.fillRect(241, 0, 5, 256); g.globalAlpha = 1;
  return tex(c);
}
export function crossingTexture(asphalt: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = hex(asphalt); g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 18, 9);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0; k < 8; k++) {
    g.fillRect(24 + k * 26, 4, 14, 30); g.fillRect(24 + k * 26, 222, 14, 30);
    g.fillRect(4, 24 + k * 26, 30, 14); g.fillRect(222, 24 + k * 26, 30, 14);
  }
  return tex(c, false);
}

export function groundTexture(theme: Theme): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = hex(theme.ground); g.fillRect(0, 0, 512, 512);
  const r = makeRng(31);
  const alt = hex(theme.groundAlt);
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.18 + next(r) * 0.25;
    g.fillStyle = alt;
    const x = next(r) * 512, y = next(r) * 512, rad = 8 + next(r) * 40;
    g.beginPath(); g.ellipse(x, y, rad, rad * (0.4 + next(r) * 0.6), next(r) * 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  if (theme.outskirts === 'mesas') { // sand ripples
    g.strokeStyle = 'rgba(120,70,30,0.10)'; g.lineWidth = 2;
    for (let y = 0; y < 512; y += 14) { g.beginPath(); for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x / 40 + y) * 4); g.stroke(); }
  }
  noise(g, 512, 512, 14, 33);
  return tex(c);
}

export function cropTexture(color: number, stripe: number): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = hex(color); g.fillRect(0, 0, 128, 128);
  g.fillStyle = hex(stripe);
  for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 7, 128);
  noise(g, 128, 128, 16, 41);
  return tex(c);
}

export function coinTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(54, 50, 10, 64, 64, 64);
  grd.addColorStop(0, '#fff2b0'); grd.addColorStop(0.6, '#f2c14e'); grd.addColorStop(1, '#b8860b');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#a87408'; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#8a5a00'; g.font = 'bold 76px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('$', 64, 70);
  return tex(c, false);
}

/** Soft radial glow used for streetlight pools and sun/lamp halos. */
export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c, false);
}
