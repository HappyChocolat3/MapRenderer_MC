// Loader and thin wrapper for cubiomes.wasm (see wasm/api.c).
// Works both in browsers (workers / main thread) and in Node for tests.

export const DIM = { NETHER: -1, OVERWORLD: 0, END: 1 };

// Mirrors enum StructureType in cubiomes/finders.h
export const S = {
  Feature: 0, Desert_Pyramid: 1, Jungle_Temple: 2, Swamp_Hut: 3, Igloo: 4,
  Village: 5, Ocean_Ruin: 6, Shipwreck: 7, Monument: 8, Mansion: 9,
  Outpost: 10, Ruined_Portal: 11, Ruined_Portal_N: 12, Ancient_City: 13,
  Treasure: 14, Mineshaft: 15, Desert_Well: 16, Geode: 17, Fortress: 18,
  Bastion: 19, End_City: 20, End_Gateway: 21, End_Island: 22,
  Trail_Ruins: 23, Trial_Chambers: 24,
};

function wasiStubs(getMemory) {
  return {
    fd_close: () => 0,
    fd_fdstat_get: () => 0,
    fd_seek: () => 0,
    // stdout/stderr output from C is only used for debugging; forward it.
    fd_write: (fd, iovs, iovsLen, nwritten) => {
      const mem = getMemory();
      const view = new DataView(mem.buffer);
      let total = 0, text = '';
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view.getUint32(iovs + i * 8, true);
        const len = view.getUint32(iovs + i * 8 + 4, true);
        text += new TextDecoder().decode(new Uint8Array(mem.buffer, ptr, len));
        total += len;
      }
      view.setUint32(nwritten, total, true);
      if (text.trim()) console.log('[cubiomes]', text.trimEnd());
      return 0;
    },
    proc_exit: (code) => { throw new Error('cubiomes exited with code ' + code); },
  };
}

export async function loadCubiomes(source) {
  let memory;
  const imports = { wasi_snapshot_preview1: wasiStubs(() => memory) };
  let instance;
  if (source instanceof WebAssembly.Module) {
    instance = await WebAssembly.instantiate(source, imports);
  } else {
    ({ instance } = await WebAssembly.instantiate(source, imports));
  }
  memory = instance.exports.memory;
  instance.exports._initialize();
  return new Cubiomes(instance.exports);
}

export class Cubiomes {
  constructor(exports) {
    this.x = exports;
    this.scratch = exports.scratch_ptr();
  }

  get mem() { return this.x.memory.buffer; }

  cstr(ptr) {
    if (!ptr) return null;
    const bytes = new Uint8Array(this.mem, ptr);
    let end = 0;
    while (bytes[end]) end++;
    return new TextDecoder().decode(bytes.subarray(0, end));
  }

  setup(mc, largeBiomes, seed, dim) {
    this.x.setup(mc, largeBiomes ? 1 : 0, BigInt.asUintN(64, BigInt(seed)), dim);
  }

  /** Returns an Int32Array copy of sx*sz biome ids, or null on failure. */
  genBiomes(scale, x, z, sx, sz, y) {
    const ptr = this.x.gen_biomes(scale, x, z, sx, sz, y);
    if (!ptr) return null;
    return new Int32Array(this.mem, ptr, sx * sz).slice();
  }

  biomeAt(scale, x, y, z) { return this.x.biome_at(scale, x, y, z); }

  slimeChunks(cx, cz, w, h) {
    const ptr = this.x.slime_chunks(cx, cz, w, h);
    return ptr ? new Uint8Array(this.mem, ptr, w * h).slice() : null;
  }

  structConfig(type) {
    const ptr = this.x.struct_config(type);
    if (!ptr) return null;
    const a = new Int32Array(this.mem, ptr, 4);
    return { salt: a[0], regionSize: a[1], chunkRange: a[2], dim: a[3] };
  }

  _positions(ptr, n) {
    const a = new Int32Array(this.mem, ptr, Math.abs(n) * 2);
    return Array.from(a);
  }

  /** Returns a flat [x0, z0, x1, z1, ...] array of structure positions. */
  findStructures(type, x0, z0, x1, z1) {
    const ptr = this.x.find_structures(type, x0, z0, x1, z1, this.scratch);
    const n = new Int32Array(this.mem, this.scratch, 1)[0];
    return this._positions(ptr, n);
  }

  findStrongholds(n) {
    const ptr = this.x.find_strongholds(n, this.scratch);
    const cnt = new Int32Array(this.mem, this.scratch, 1)[0];
    return this._positions(ptr, cnt);
  }

  findSpawn() { return this._positions(this.x.find_spawn(), 1); }

  fixedGateways() { return this._positions(this.x.fixed_gateways(), 20); }

  mcName(mc) { return this.cstr(this.x.mc_name(mc)); }

  mcFromString(s) {
    const bytes = new TextEncoder().encode(s.slice(0, 200) + '\0');
    new Uint8Array(this.mem, this.scratch, bytes.length).set(bytes);
    return this.x.mc_from_str(this.scratch);
  }

  biomeName(mc, id) { return this.cstr(this.x.biome_name(mc, id)); }
  structName(type) { return this.cstr(this.x.struct_name(type)); }
  biomeColor(id) { return this.x.biome_color(id); }
  biomeExists(mc, id) { return !!this.x.biome_exists(mc, id); }
  isOverworldBiome(mc, id) { return !!this.x.is_overworld_biome(mc, id); }
  biomeDim(id) { return this.x.biome_dim(id); }
}
