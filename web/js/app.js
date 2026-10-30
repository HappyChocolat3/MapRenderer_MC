import { loadCubiomes, DIM } from './cubiomes.js';
import {
  STRUCTURES, STRUCT_BY_ID, STRONGHOLD, SPAWN, FIXED_GATEWAY, RIVER_BIOMES,
  parseSeed, randomSeed, mapVersionName,
} from './meta.js';
import { readLevelDat } from './nbt.js';

const TILE = 256;                  // samples per tile side
const LEVELS = [1, 4, 16, 64, 256]; // cubiomes generation scales
const MIN_BPP = 1 / 16;            // blocks per screen pixel
const MAX_BPP = 256;
const MARKER_MIN_SPACING = 18;     // min px between structure regions to show a type
const BADGE_MIN_SPACING = 48;      // below this, structures are drawn as dots
const MAX_CACHED_TILES = 500;
const DENSE_MAX_BPP = 2;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  seed: 0n,
  mc: 0,
  large: false,
  dim: DIM.OVERWORLD,
  y: 320,
  view: { x: 0, z: 0, bpp: 4 },
  layers: { boundaries: true, rivers: true, slime: false, grid: false, muted: false },
  enabled: new Set(STRUCTURES.filter((s) => !s.dense).map((s) => s.id)),
  highlightBiome: -1,
};

let cub;            // main thread cubiomes instance (metadata only)
let pool;
let versions = [];  // [{ mc, name, label }]
let palette = new Uint8Array(256 * 3);
let biomeNames = [];
let structConfigs = new Map(); // type -> config for current version
let special = { strongholds: null, spawn: null, gateways: null, key: '' };

const canvas = $('map');
const ctx = canvas.getContext('2d');
let dpr = 1;
let dirty = true;

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

class Pool {
  constructor(module, n) {
    this.workers = [];
    this.queue = [];
    this.callbacks = new Map();
    this.nextId = 1;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      const entry = { w, busy: false };
      w.onmessage = (ev) => this.onMessage(entry, ev.data);
      w.onerror = (ev) => console.error('worker error', ev.message || ev);
      w.postMessage({ type: 'init', module });
      this.workers.push(entry);
    }
  }

  get idle() { return this.workers.filter((e) => !e.busy).length; }

  onMessage(entry, msg) {
    if (msg.ready) return;
    entry.busy = false;
    const cb = this.callbacks.get(msg.id);
    this.callbacks.delete(msg.id);
    if (cb) msg.ok ? cb.resolve(msg.result) : cb.reject(new Error(msg.error));
    this.pump();
    scheduleTiles();
  }

  run(job) {
    return new Promise((resolve, reject) => {
      job.id = this.nextId++;
      this.callbacks.set(job.id, { resolve, reject });
      this.queue.push(job);
      this.pump();
    });
  }

  // Runs a job only if a worker is free right now (used for tiles, which are
  // re-prioritised every frame instead of being queued).
  tryRun(job) {
    if (this.queue.length || !this.idle) return null;
    return this.run(job);
  }

  pump() {
    for (const e of this.workers) {
      if (!this.queue.length) return;
      if (e.busy) continue;
      e.busy = true;
      e.w.postMessage(this.queue.shift());
    }
  }
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

const tiles = new Map();     // key -> tile
const inflight = new Set();  // keys being generated
let frameCounter = 0;

function params() {
  return { mc: state.mc, large: state.large, seed: state.seed.toString(), dim: state.dim, y: state.y };
}

function paramsKey() {
  return `${state.seed}|${state.mc}|${state.large}|${state.dim}|${state.y}`;
}

function tileKey(scale, tx, tz) { return `${paramsKey()}|${scale}|${tx}|${tz}`; }

function levelFor(bpp) {
  let s = LEVELS[0];
  for (const l of LEVELS) if (l <= Math.max(1, bpp * 2)) s = l;
  return s;
}

function viewBounds() {
  const { x, z, bpp } = state.view;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  return { x0: x - (w / 2) * bpp, z0: z - (h / 2) * bpp, x1: x + (w / 2) * bpp, z1: z + (h / 2) * bpp, w, h };
}

function visibleTiles(scale, b = viewBounds()) {
  const tb = TILE * scale;
  const out = [];
  const tx0 = Math.floor(b.x0 / tb), tx1 = Math.floor(b.x1 / tb);
  const tz0 = Math.floor(b.z0 / tb), tz1 = Math.floor(b.z1 / tb);
  for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) out.push({ tx, tz });
  return out;
}

// Structure types computed for tiles of the given scale: only those whose
// region spacing will be visible at the zoom levels using this scale.
function structTypesFor(scale) {
  const out = [];
  for (const [type, cfg] of structConfigs) {
    if (cfg.dim !== state.dim) continue;
    if (cfg.regionSize * 16 >= (MARKER_MIN_SPACING / 2) * scale) out.push(type);
  }
  return out;
}

function requestTile(scale, tx, tz) {
  const key = tileKey(scale, tx, tz);
  if (tiles.has(key) || inflight.has(key)) return true;
  const p = pool.tryRun({
    type: 'tile', params: params(), scale, tx, tz, size: TILE,
    structTypes: structTypesFor(scale), slime: scale <= 4,
  });
  if (!p) return false;
  inflight.add(key);
  p.then((res) => {
    inflight.delete(key);
    tiles.set(key, { ...res, scale, tx, tz, canvas: null, canvasKey: '', used: frameCounter });
    evictTiles();
    dirty = true;
  }, (err) => {
    inflight.delete(key);
    console.error(err);
  });
  return true;
}

function scheduleTiles() {
  if (!pool) return;
  const b = viewBounds();
  const s = levelFor(state.view.bpp);
  const cx = state.view.x, cz = state.view.z;
  const byDistance = (scale) => (a, c) => {
    const tb = TILE * scale;
    const da = Math.hypot((a.tx + 0.5) * tb - cx, (a.tz + 0.5) * tb - cz);
    const dc = Math.hypot((c.tx + 0.5) * tb - cx, (c.tz + 0.5) * tb - cz);
    return da - dc;
  };

  // Coarse preview tiles first (16x cheaper), then the real resolution.
  const jobs = [];
  const coarse = LEVELS[LEVELS.indexOf(s) + 1];
  if (coarse && s >= 4) {
    for (const t of visibleTiles(coarse, b).sort(byDistance(coarse))) jobs.push([coarse, t]);
  }
  for (const t of visibleTiles(s, b).sort(byDistance(s))) jobs.push([s, t]);

  let pending = 0;
  for (const [scale, t] of jobs) {
    const key = tileKey(scale, t.tx, t.tz);
    if (tiles.has(key)) continue;
    pending++;
    if (inflight.has(key)) continue;
    if (!requestTile(scale, t.tx, t.tz)) break;
  }
  $('progress').textContent = pending ? `Generating… (${pending} ${pending === 1 ? 'tile' : 'tiles'})` : '';
}

function evictTiles() {
  if (tiles.size <= MAX_CACHED_TILES) return;
  const sorted = [...tiles.entries()].sort((a, b) => a[1].used - b[1].used);
  for (let i = 0; i < sorted.length - MAX_CACHED_TILES; i++) tiles.delete(sorted[i][0]);
}

function clearTiles() {
  tiles.clear();
  inflight.clear();
  dirty = true;
}

// ---------------------------------------------------------------------------
// Tile colouring
// ---------------------------------------------------------------------------

function renderKey() {
  const l = state.layers;
  return `${l.boundaries}|${l.rivers}|${l.slime}|${l.muted}|${state.highlightBiome}`;
}

function tileCanvas(tile) {
  const key = renderKey();
  if (tile.canvas && tile.canvasKey === key) return tile.canvas;
  if (!tile.canvas) {
    tile.canvas = document.createElement('canvas');
    tile.canvas.width = TILE;
    tile.canvas.height = TILE;
  }
  const c2 = tile.canvas.getContext('2d');
  const img = c2.createImageData(TILE, TILE);
  const px = img.data;
  const ids = tile.ids;
  const n = TILE + 2;
  const { boundaries, rivers, slime, muted } = state.layers;
  const hl = state.highlightBiome;
  const slimeMask = slime ? tile.slime : null;
  const chunksPerRow = Math.max(1, (TILE * tile.scale) >> 4);
  const blocksPerSample = tile.scale;

  for (let j = 0; j < TILE; j++) {
    for (let i = 0; i < TILE; i++) {
      const idx = (j + 1) * n + (i + 1);
      const id = ids[idx];
      let r, g, b;
      if (rivers && RIVER_BIOMES.has(id)) {
        r = id === 11 ? 150 : 40; g = id === 11 ? 210 : 140; b = 255;
      } else {
        r = palette[id * 3]; g = palette[id * 3 + 1]; b = palette[id * 3 + 2];
        if (muted) {
          const lum = 0.3 * r + 0.59 * g + 0.11 * b;
          r = r * 0.35 + lum * 0.4 + 30; g = g * 0.35 + lum * 0.4 + 30; b = b * 0.35 + lum * 0.4 + 30;
        }
      }
      if (hl >= 0 && id !== hl) {
        const lum = 0.3 * r + 0.59 * g + 0.11 * b;
        r = g = b = lum * 0.35;
      }
      if (boundaries && (id !== ids[idx - 1] || id !== ids[idx - n])) {
        r *= 0.45; g *= 0.45; b *= 0.45;
      }
      if (slimeMask) {
        const cx = (i * blocksPerSample) >> 4, cz = (j * blocksPerSample) >> 4;
        if (slimeMask[cz * chunksPerRow + cx]) {
          const edge = blocksPerSample < 16 &&
            (((i * blocksPerSample) & 15) === 0 || ((j * blocksPerSample) & 15) === 0);
          const a = edge ? 0.85 : 0.5;
          r = r * (1 - a) + 60 * a; g = g * (1 - a) + 230 * a; b = b * (1 - a) + 70 * a;
        }
      }
      const o = (j * TILE + i) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
  }
  c2.putImageData(img, 0, 0);
  tile.canvasKey = key;
  return tile.canvas;
}

// Finds a cached tile covering the given tile area at a coarser scale.
function fallbackTile(scale, tx, tz) {
  const tb = TILE * scale;
  for (let k = LEVELS.indexOf(scale) + 1; k < LEVELS.length; k++) {
    const S = LEVELS[k], TB = TILE * S;
    const ptx = Math.floor((tx * tb) / TB), ptz = Math.floor((tz * tb) / TB);
    const t = tiles.get(tileKey(S, ptx, ptz));
    if (t) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

let markers = []; // markers on screen, for hit testing

function draw() {
  frameCounter++;
  const b = viewBounds();
  const { bpp } = state.view;
  const s = levelFor(bpp);
  const tb = TILE * s;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b0c0f';
  ctx.fillRect(0, 0, b.w, b.h);

  const sources = []; // tiles providing structure data for the view
  for (const { tx, tz } of visibleTiles(s, b)) {
    const sx = (tx * tb - b.x0) / bpp, sy = (tz * tb - b.z0) / bpp, size = tb / bpp;
    const tile = tiles.get(tileKey(s, tx, tz));
    if (tile) {
      tile.used = frameCounter;
      ctx.imageSmoothingEnabled = bpp > s;
      ctx.drawImage(tileCanvas(tile), sx, sy, size + 0.5, size + 0.5);
      sources.push(tile);
      continue;
    }
    const fb = fallbackTile(s, tx, tz);
    if (fb) {
      fb.used = frameCounter;
      const ratio = s / fb.scale;
      const ox = (tx * tb - fb.tx * TILE * fb.scale) / fb.scale;
      const oz = (tz * tb - fb.tz * TILE * fb.scale) / fb.scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tileCanvas(fb), ox, oz, TILE * ratio, TILE * ratio, sx, sy, size + 0.5, size + 0.5);
      if (!sources.includes(fb)) sources.push(fb);
    }
  }

  if (state.layers.grid) drawGrid(b);
  drawMarkers(b, sources);
  updateStructZoomNotes();
  $('scaleInfo').textContent = bpp >= 1 ? `1 px = ${+bpp.toFixed(2)} blocks` : `1 block = ${+(1 / bpp).toFixed(1)} px`;
}

function drawGrid(b) {
  const { bpp } = state.view;
  let step = 16;
  while (step / bpp < 56) step *= 2;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  const gx0 = Math.floor(b.x0 / step) * step, gz0 = Math.floor(b.z0 / step) * step;
  for (let x = gx0; x <= b.x1; x += step) {
    const sx = Math.round((x - b.x0) / bpp) + 0.5;
    ctx.strokeStyle = x === 0 ? 'rgba(255,80,80,.8)' : 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, b.h); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText(String(x), sx + 3, 3);
  }
  for (let z = gz0; z <= b.z1; z += step) {
    const sy = Math.round((z - b.z0) / bpp) + 0.5;
    ctx.strokeStyle = z === 0 ? 'rgba(80,140,255,.8)' : 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(b.w, sy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText(String(z), 3, sy + 3);
  }
  ctx.restore();
}

function regionBlocks(id) {
  const cfg = structConfigs.get(id);
  return cfg ? cfg.regionSize * 16 : Infinity;
}

function typeVisibleAtZoom(def) {
  const bpp = state.view.bpp;
  if (def.dense && bpp > DENSE_MAX_BPP) return false;
  return regionBlocks(def.id) / bpp >= MARKER_MIN_SPACING;
}

function drawMarker(def, px, py, size) {
  ctx.font = `700 ${size <= 14 ? 9 : 10}px system-ui, sans-serif`;
  const w = Math.max(size, ctx.measureText(def.label).width + 6);
  const x = Math.round(px - w / 2), y = Math.round(py - size / 2);
  ctx.fillStyle = def.color;
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, size, 4);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 1.5, w - 3, size - 3, 3);
  ctx.stroke();
  ctx.fillStyle = def.dark ? '#111' : '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.label, px, py + 0.5);
  return w;
}

function drawMarkers(b, sources) {
  markers = [];
  const { bpp } = state.view;
  const list = [];

  for (const def of STRUCTURES) {
    if (!state.enabled.has(def.id) || !def.dims.includes(state.dim)) continue;
    let pos = null;
    if (def.id === STRONGHOLD) pos = special.strongholds;
    else if (def.id === SPAWN) pos = special.spawn;
    else if (def.id === FIXED_GATEWAY) pos = special.gateways;
    if (pos) {
      for (let i = 0; i < pos.length; i += 2) list.push([def, pos[i], pos[i + 1]]);
      continue;
    }
    if (!structConfigs.has(def.id) || !typeVisibleAtZoom(def)) continue;
    for (const t of sources) {
      const p = t.structures && t.structures[def.id];
      if (!p) continue;
      for (let i = 0; i < p.length; i += 2) list.push([def, p[i], p[i + 1]]);
    }
  }

  // Types whose structures are packed tightly at this zoom are drawn as small
  // dots, so that the labelled badges stay readable.
  const size = bpp > 32 ? 14 : 18;
  const dots = [], badges = [];
  for (const item of list) {
    (regionBlocks(item[0].id) / bpp < BADGE_MIN_SPACING ? dots : badges).push(item);
  }
  for (const [def, x, z] of dots) {
    const px = (x - b.x0) / bpp, py = (z - b.z0) / bpp;
    if (px < -10 || py < -10 || px > b.w + 10 || py > b.h + 10) continue;
    ctx.fillStyle = def.color;
    ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    markers.push({ def, x, z, px, py, w: 10, h: 10 });
  }
  for (const [def, x, z] of badges) {
    const px = (x - b.x0) / bpp, py = (z - b.z0) / bpp;
    if (px < -20 || py < -20 || px > b.w + 20 || py > b.h + 20) continue;
    const w = drawMarker(def, px, py, size);
    markers.push({ def, x, z, px, py, w, h: size });
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function frame() {
  if (dirty) {
    dirty = false;
    draw();
    scheduleTiles();
  }
  requestAnimationFrame(frame);
}

function invalidate() {
  dirty = true;
  saveHash();
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  dirty = true;
}

// ---------------------------------------------------------------------------
// World parameter changes
// ---------------------------------------------------------------------------

function worldChanged() {
  cub.setup(state.mc, state.large, state.seed, state.dim);
  structConfigs = new Map();
  for (const def of STRUCTURES) {
    if (def.id >= 100) continue;
    const cfg = cub.structConfig(def.id);
    if (cfg) structConfigs.set(def.id, cfg);
  }
  buildPalette();
  buildStructList();
  buildBiomeList();
  updateSeedInfo();
  updateYControl();
  loadSpecial();
  clearTiles();
  invalidate();
}

function loadSpecial() {
  const key = `${state.seed}|${state.mc}|${state.large}|${state.dim}`;
  if (special.key === key) return;
  special = { strongholds: null, spawn: null, gateways: null, key };
  const p = { ...params(), y: 0 };
  const done = (field) => (res) => {
    if (special.key !== key) return;
    special[field] = res.positions;
    dirty = true;
  };
  const fail = (e) => console.error(e);
  if (state.dim === DIM.OVERWORLD) {
    const count = state.mc >= cub.mcFromString('1.9') ? 128 : 3;
    pool.run({ type: 'spawn', params: { ...p, dim: DIM.OVERWORLD } }).then(done('spawn'), fail);
    pool.run({ type: 'strongholds', params: { ...p, dim: DIM.OVERWORLD }, count }).then(done('strongholds'), fail);
  } else if (state.dim === DIM.END && state.mc >= cub.mcFromString('1.13')) {
    pool.run({ type: 'gateways', params: p }).then(done('gateways'), fail);
  }
}

function buildPalette() {
  palette = new Uint8Array(256 * 3);
  biomeNames = [];
  for (let id = 0; id < 256; id++) {
    const c = cub.biomeColor(id);
    palette[id * 3] = (c >> 16) & 255;
    palette[id * 3 + 1] = (c >> 8) & 255;
    palette[id * 3 + 2] = c & 255;
    biomeNames[id] = cub.biomeName(state.mc, id);
  }
}

function prettyName(s) {
  if (!s) return '?';
  return s.replace(/_/g, ' ');
}

function updateSeedInfo() {
  const raw = $('seed').value.trim();
  const isNumber = /^[-+]?\d+$/.test(raw);
  $('seedInfo').textContent = raw && !isNumber
    ? `Text seed → ${state.seed}`
    : (!raw ? `Seed: ${state.seed}` : '');
}

function updateYControl() {
  const modern = state.mc >= cub.mcFromString('1.18');
  $('yLevel').disabled = !modern || state.dim !== DIM.OVERWORLD;
  $('yHint').textContent = modern ? '(320 = surface)' : '(1.18+ only)';
}

// ---------------------------------------------------------------------------
// Sidebar UI
// ---------------------------------------------------------------------------

function buildVersionSelect() {
  const labels = {
    '26.3': '26.3 (latest)',
    '26.2': '26.2',
    '1.21.9': '1.21.9 – 26.1.2',
    '1.21.5': '1.21.5 – 1.21.8',
    '1.21 WD': '1.21.4',
    '1.21.3': '1.21.2 – 1.21.3',
    '1.21.1': '1.21 – 1.21.1',
    '1.19': '1.19.3 – 1.19.4',
    '1.19.2': '1.19 – 1.19.2',
    '1.16': '1.16.2 – 1.16.5',
    '1.16.1': '1.16 – 1.16.1',
  };
  versions = [];
  for (let mc = 1; mc < 64; mc++) {
    const name = cub.mcName(mc);
    if (!name || name === '?' || cub.mcFromString(name) !== mc) continue;
    const old = mc < cub.mcFromString('1.7');
    versions.push({ mc, name, label: (labels[name] || name) + (old ? ' (experimental)' : '') });
  }
  const sel = $('version');
  sel.innerHTML = '';
  for (const v of [...versions].reverse()) {
    const o = document.createElement('option');
    o.value = v.mc;
    o.textContent = v.label;
    sel.appendChild(o);
  }
}

function newestVersion() { return versions[versions.length - 1]; }

function swatch(def) {
  const span = document.createElement('span');
  span.className = 'marker-swatch' + (def.dark ? ' dark' : '');
  span.style.background = def.color;
  span.textContent = def.label;
  return span;
}

function buildStructList() {
  const ul = $('structList');
  ul.innerHTML = '';
  for (const def of STRUCTURES) {
    if (!def.dims.includes(state.dim)) continue;
    const available = def.id >= 100
      ? !(def.id === FIXED_GATEWAY && state.mc < cub.mcFromString('1.13'))
      : structConfigs.has(def.id);
    const li = document.createElement('li');
    li.dataset.id = def.id;
    if (!available) li.className = 'unavailable';
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.enabled.has(def.id);
    cb.disabled = !available;
    cb.addEventListener('change', () => {
      cb.checked ? state.enabled.add(def.id) : state.enabled.delete(def.id);
      invalidate();
    });
    const note = document.createElement('span');
    note.className = 'zoom-note';
    if (!available) note.textContent = 'not in this version';
    label.append(cb, swatch(def), document.createTextNode(def.name), note);
    li.appendChild(label);
    ul.appendChild(li);
  }
}

function updateStructZoomNotes() {
  for (const li of $('structList').children) {
    const def = STRUCT_BY_ID.get(+li.dataset.id);
    if (!def || def.id >= 100 || !structConfigs.has(def.id)) continue;
    li.querySelector('.zoom-note').textContent = typeVisibleAtZoom(def) ? '' : 'zoom in';
  }
}

function buildBiomeList() {
  const ul = $('biomeList');
  ul.innerHTML = '';
  const dimBiomes = [];
  for (let id = 0; id < 256; id++) {
    if (!biomeNames[id] || !cub.biomeExists(state.mc, id)) continue;
    if (cub.biomeDim(id) !== state.dim) continue;
    if (state.dim === DIM.OVERWORLD && !cub.isOverworldBiome(state.mc, id)) continue;
    dimBiomes.push(id);
  }
  dimBiomes.sort((a, b) => biomeNames[a].localeCompare(biomeNames[b]));
  if (!dimBiomes.includes(state.highlightBiome)) state.highlightBiome = -1;
  for (const id of dimBiomes) {
    const li = document.createElement('li');
    if (id === state.highlightBiome) li.className = 'active';
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = `rgb(${palette[id * 3]},${palette[id * 3 + 1]},${palette[id * 3 + 2]})`;
    li.append(sw, document.createTextNode(prettyName(biomeNames[id])));
    li.addEventListener('click', () => {
      state.highlightBiome = state.highlightBiome === id ? -1 : id;
      for (const el of ul.children) el.classList.remove('active');
      if (state.highlightBiome === id) li.classList.add('active');
      invalidate();
    });
    ul.appendChild(li);
  }
}

function setSeedFromInput() {
  const parsed = parseSeed($('seed').value);
  state.seed = parsed === null ? 0n : parsed;
}

function bindUI() {
  let seedTimer = 0;
  $('seed').addEventListener('input', () => {
    clearTimeout(seedTimer);
    seedTimer = setTimeout(() => { setSeedFromInput(); worldChanged(); }, 350);
  });
  $('randomSeed').addEventListener('click', () => {
    $('seed').value = randomSeed().toString();
    setSeedFromInput();
    worldChanged();
  });
  $('version').addEventListener('change', () => {
    state.mc = +$('version').value;
    worldChanged();
  });
  $('largeBiomes').addEventListener('change', () => {
    state.large = $('largeBiomes').checked;
    worldChanged();
  });
  for (const btn of $('dimension').querySelectorAll('button')) {
    btn.addEventListener('click', () => setDimension(+btn.dataset.dim));
  }
  let yTimer = 0;
  $('yLevel').addEventListener('input', () => {
    $('yValue').textContent = $('yLevel').value;
    clearTimeout(yTimer);
    yTimer = setTimeout(() => { state.y = +$('yLevel').value; clearTiles(); invalidate(); }, 200);
  });

  const layerIds = { boundaries: 'layerBoundaries', rivers: 'layerRivers', slime: 'layerSlime', grid: 'layerGrid', muted: 'layerMuted' };
  for (const [k, id] of Object.entries(layerIds)) {
    $(id).addEventListener('change', () => { state.layers[k] = $(id).checked; invalidate(); });
  }

  $('structAll').addEventListener('click', () => {
    for (const def of STRUCTURES) if (def.dims.includes(state.dim)) state.enabled.add(def.id);
    buildStructList();
    invalidate();
  });
  $('structNone').addEventListener('click', () => {
    for (const def of STRUCTURES) if (def.dims.includes(state.dim)) state.enabled.delete(def.id);
    buildStructList();
    invalidate();
  });

  $('levelDat').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadLevelDat(f);
    e.target.value = '';
  });
  const drop = $('levelDrop');
  const wrap = document.body;
  wrap.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  wrap.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('dragover'); });
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f) loadLevelDat(f);
  });

  $('gotoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const x = parseFloat($('gotoX').value), z = parseFloat($('gotoZ').value);
    if (Number.isFinite(x)) state.view.x = x;
    if (Number.isFinite(z)) state.view.z = z;
    if (state.view.bpp > 4) state.view.bpp = 4;
    invalidate();
  });
  $('zoomIn').addEventListener('click', () => zoomAt(0.5));
  $('zoomOut').addEventListener('click', () => zoomAt(2));
  $('zoomHome').addEventListener('click', () => { state.view.x = 0; state.view.z = 0; invalidate(); });

  $('openSidebar').addEventListener('click', () => document.body.classList.add('sidebar-open'));
  $('closeSidebar').addEventListener('click', () => document.body.classList.remove('sidebar-open'));
}

function setDimension(dim) {
  if (state.dim === dim) return;
  // Keep the same in-game location when switching between overworld and nether.
  if (state.dim === DIM.OVERWORLD && dim === DIM.NETHER) {
    state.view.x /= 8; state.view.z /= 8; state.view.bpp = Math.max(MIN_BPP, state.view.bpp / 8);
  } else if (state.dim === DIM.NETHER && dim === DIM.OVERWORLD) {
    state.view.x *= 8; state.view.z *= 8; state.view.bpp = Math.min(MAX_BPP, state.view.bpp * 8);
  }
  state.dim = dim;
  for (const b of $('dimension').querySelectorAll('button')) {
    b.classList.toggle('active', +b.dataset.dim === dim);
  }
  worldChanged();
}

async function loadLevelDat(file) {
  const info = $('levelInfo');
  info.classList.remove('error');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const lvl = await readLevelDat(bytes);
    $('seed').value = lvl.seed.toString();
    state.seed = lvl.seed;
    const vname = mapVersionName(lvl.versionName, newestVersion().name);
    const mc = cub.mcFromString(vname) || newestVersion().mc;
    state.mc = mc;
    $('version').value = mc;
    state.large = lvl.largeBiomes;
    $('largeBiomes').checked = lvl.largeBiomes;
    const parts = [];
    if (lvl.levelName) parts.push(`"${lvl.levelName}"`);
    parts.push(lvl.versionName ? `version ${lvl.versionName}` : 'unknown version (assuming latest)');
    if (lvl.largeBiomes) parts.push('large biomes');
    info.textContent = 'Loaded: ' + parts.join(', ');
    worldChanged();
  } catch (e) {
    console.error(e);
    info.textContent = 'Error: ' + e.message;
    info.classList.add('error');
  }
}

// ---------------------------------------------------------------------------
// Map interaction
// ---------------------------------------------------------------------------

function clampBpp(v) { return Math.min(MAX_BPP, Math.max(MIN_BPP, v)); }

function zoomAt(factor, px, py) {
  const b = viewBounds();
  if (px === undefined) { px = b.w / 2; py = b.h / 2; }
  const wx = b.x0 + px * state.view.bpp, wz = b.z0 + py * state.view.bpp;
  const nb = clampBpp(state.view.bpp * factor);
  state.view.x = wx - (px - b.w / 2) * nb;
  state.view.z = wz - (py - b.h / 2) * nb;
  state.view.bpp = nb;
  invalidate();
}

function screenToWorld(px, py) {
  const b = viewBounds();
  return { x: b.x0 + px * state.view.bpp, z: b.z0 + py * state.view.bpp };
}

function biomeAtWorld(x, z) {
  const s = levelFor(state.view.bpp);
  const tb = TILE * s;
  const tx = Math.floor(x / tb), tz = Math.floor(z / tb);
  const tile = tiles.get(tileKey(s, tx, tz)) || fallbackTile(s, tx, tz);
  if (!tile) return -1;
  const i = Math.floor((x - tile.tx * TILE * tile.scale) / tile.scale);
  const j = Math.floor((z - tile.tz * TILE * tile.scale) / tile.scale);
  if (i < 0 || j < 0 || i >= TILE || j >= TILE) return -1;
  return tile.ids[(j + 1) * (TILE + 2) + (i + 1)];
}

function markerAt(px, py) {
  for (let k = markers.length - 1; k >= 0; k--) {
    const m = markers[k];
    if (Math.abs(px - m.px) <= m.w / 2 + 2 && Math.abs(py - m.py) <= m.h / 2 + 2) return m;
  }
  return null;
}

function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { t.hidden = true; }, 1800);
}

function updateHover(px, py) {
  const tip = $('tooltip');
  const w = screenToWorld(px, py);
  const bx = Math.floor(w.x), bz = Math.floor(w.z);
  const id = biomeAtWorld(w.x, w.z);
  const biome = id >= 0 && id !== 255 ? prettyName(biomeNames[id]) : '…';
  let info = `X: ${bx}  Z: ${bz}  ·  ${biome}`;
  if (state.dim === DIM.OVERWORLD) info += `  ·  chunk ${bx >> 4}, ${bz >> 4}`;
  if (state.dim === DIM.NETHER) info += `  ·  Overworld: ${bx * 8}, ${bz * 8}`;
  $('cursorInfo').textContent = info;

  const m = markerAt(px, py);
  canvas.classList.toggle('pointer', !!m);
  if (m) {
    tip.innerHTML = '';
    const title = document.createElement('b');
    title.textContent = m.def.name;
    tip.append(title, document.createTextNode(`\nX: ${m.x}  Z: ${m.z}\nClick to copy /tp`));
    tip.style.left = px + 'px';
    tip.style.top = py + 'px';
    tip.hidden = false;
  } else {
    tip.hidden = true;
  }
}

function bindMap() {
  const pointers = new Map();
  let dragStart = null;
  let pinch = null;
  let moved = false;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    moved = false;
    if (pointers.size === 1) {
      dragStart = { x: e.offsetX, y: e.offsetY, vx: state.view.x, vz: state.view.z };
      canvas.classList.add('dragging');
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), bpp: state.view.bpp };
      dragStart = null;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) {
        const target = clampBpp(pinch.bpp * (pinch.d / d));
        zoomAt(target / state.view.bpp, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      moved = true;
      return;
    }
    if (dragStart) {
      const dx = e.offsetX - dragStart.x, dy = e.offsetY - dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      state.view.x = dragStart.vx - dx * state.view.bpp;
      state.view.z = dragStart.vz - dy * state.view.bpp;
      invalidate();
    }
    updateHover(e.offsetX, e.offsetY);
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      canvas.classList.remove('dragging');
      if (!moved && dragStart) {
        const m = markerAt(e.offsetX, e.offsetY);
        if (m) {
          const cmd = `/tp @s ${m.x} ~ ${m.z}`;
          navigator.clipboard?.writeText(cmd).then(
            () => showToast(`Copied: ${cmd}`),
            () => showToast(cmd),
          );
        }
      }
      dragStart = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { $('tooltip').hidden = true; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.pow(2, e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
    zoomAt(factor, e.offsetX, e.offsetY);
    updateHover(e.offsetX, e.offsetY);
  }, { passive: false });

  window.addEventListener('resize', resize);
}

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

let hashTimer = 0;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const v = versions.find((x) => x.mc === state.mc);
    const p = new URLSearchParams();
    p.set('seed', $('seed').value.trim() || state.seed.toString());
    if (v) p.set('v', v.name);
    if (state.large) p.set('large', '1');
    if (state.dim !== DIM.OVERWORLD) p.set('dim', state.dim);
    if (state.y !== 320) p.set('y', state.y);
    p.set('x', Math.round(state.view.x));
    p.set('z', Math.round(state.view.z));
    p.set('zoom', +state.view.bpp.toFixed(4));
    history.replaceState(null, '', '#' + p.toString());
  }, 300);
}

function loadHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const seedText = p.get('seed');
  if (seedText !== null) $('seed').value = seedText;
  else $('seed').value = randomSeed().toString();
  setSeedFromInput();

  const v = p.get('v') && versions.find((x) => x.name === p.get('v'));
  state.mc = v ? v.mc : newestVersion().mc;
  $('version').value = state.mc;
  state.large = p.get('large') === '1';
  $('largeBiomes').checked = state.large;
  const dim = +(p.get('dim') || 0);
  state.dim = [DIM.OVERWORLD, DIM.NETHER, DIM.END].includes(dim) ? dim : DIM.OVERWORLD;
  for (const b of $('dimension').querySelectorAll('button')) {
    b.classList.toggle('active', +b.dataset.dim === state.dim);
  }
  const y = +(p.get('y') ?? 320);
  if (Number.isFinite(y)) state.y = Math.max(-64, Math.min(320, y));
  $('yLevel').value = state.y;
  $('yValue').textContent = state.y;
  const num = (k, d) => { const n = parseFloat(p.get(k)); return Number.isFinite(n) ? n : d; };
  state.view.x = num('x', 0);
  state.view.z = num('z', 0);
  state.view.bpp = clampBpp(num('zoom', 4));
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  $('progress').textContent = 'Loading generator…';
  const wasmUrl = new URL('../cubiomes.wasm', import.meta.url);
  let module;
  try {
    module = await WebAssembly.compileStreaming(fetch(wasmUrl));
  } catch {
    // e.g. servers that do not send the application/wasm MIME type
    module = await WebAssembly.compile(await (await fetch(wasmUrl)).arrayBuffer());
  }
  cub = await loadCubiomes(module);
  const threads = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
  pool = new Pool(module, threads);

  buildVersionSelect();
  loadHash();
  bindUI();
  bindMap();
  resize();
  worldChanged();
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  $('progress').textContent = 'Failed to load: ' + e.message;
});
