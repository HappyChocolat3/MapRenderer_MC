// Map generation worker: owns one cubiomes instance and answers tile requests.
import { loadCubiomes, DIM } from './cubiomes.js';

let cub = null;
let queue = [];

function setup(p) {
  cub.setup(p.mc, p.large, BigInt(p.seed), p.dim);
}

const handlers = {
  // Biome ids for a tile, with a one sample border on every side so that the
  // main thread can find biome boundaries across tile edges.
  tile(job) {
    const { params, scale, tx, tz, size, structTypes, slime } = job;
    setup(params);
    const n = size + 2;
    const raw = cub.genBiomes(scale, tx * size - 1, tz * size - 1, n, n, params.y);
    const ids = new Uint8Array(n * n);
    if (raw) for (let i = 0; i < raw.length; i++) ids[i] = raw[i] < 0 ? 255 : raw[i];

    const blocks = size * scale;
    const x0 = tx * blocks, z0 = tz * blocks;

    let slimeMask = null;
    if (slime && params.dim === DIM.OVERWORLD) {
      const chunks = Math.max(1, blocks >> 4);
      slimeMask = cub.slimeChunks(x0 >> 4, z0 >> 4, chunks, chunks);
    }

    const structures = {};
    for (const t of structTypes) {
      structures[t] = cub.findStructures(t, x0, z0, x0 + blocks, z0 + blocks);
    }
    return { ids, slime: slimeMask, structures };
  },

  strongholds(job) {
    setup(job.params);
    return { positions: cub.findStrongholds(job.count) };
  },

  spawn(job) {
    setup(job.params);
    return { positions: cub.findSpawn() };
  },

  gateways(job) {
    setup(job.params);
    return { positions: cub.fixedGateways() };
  },
};

function run(job) {
  try {
    const result = handlers[job.type](job);
    const transfer = [];
    if (result.ids) transfer.push(result.ids.buffer);
    if (result.slime) transfer.push(result.slime.buffer);
    postMessage({ id: job.id, ok: true, result }, transfer);
  } catch (e) {
    postMessage({ id: job.id, ok: false, error: String(e && e.stack || e) });
  }
}

onmessage = async (ev) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    cub = await loadCubiomes(msg.module);
    postMessage({ ready: true });
    for (const job of queue) run(job);
    queue = [];
    return;
  }
  if (!cub) queue.push(msg);
  else run(msg);
};
