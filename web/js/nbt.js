// Minimal reader for Java Edition level.dat files (gzip compressed NBT).

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function isGzip(b) { return b.length > 2 && b[0] === 0x1f && b[1] === 0x8b; }

class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = 0;
  }
  u8() { return this.v.getUint8(this.p++); }
  i8() { return this.v.getInt8(this.p++); }
  i16() { const r = this.v.getInt16(this.p); this.p += 2; return r; }
  u16() { const r = this.v.getUint16(this.p); this.p += 2; return r; }
  i32() { const r = this.v.getInt32(this.p); this.p += 4; return r; }
  i64() { const r = this.v.getBigInt64(this.p); this.p += 8; return r; }
  f32() { const r = this.v.getFloat32(this.p); this.p += 4; return r; }
  f64() { const r = this.v.getFloat64(this.p); this.p += 8; return r; }
  str() {
    const len = this.u16();
    const s = new TextDecoder().decode(this.b.subarray(this.p, this.p + len));
    this.p += len;
    return s;
  }

  payload(type) {
    switch (type) {
      case 1: return this.i8();
      case 2: return this.i16();
      case 3: return this.i32();
      case 4: return this.i64();
      case 5: return this.f32();
      case 6: return this.f64();
      case 7: { const n = this.i32(); const a = this.b.slice(this.p, this.p + n); this.p += n; return a; }
      case 8: return this.str();
      case 9: {
        const t = this.u8(), n = this.i32(), a = [];
        for (let i = 0; i < n; i++) a.push(this.payload(t));
        return a;
      }
      case 10: {
        const o = {};
        for (;;) {
          const t = this.u8();
          if (t === 0) return o;
          const name = this.str();
          o[name] = this.payload(t);
        }
      }
      case 11: { const n = this.i32(), a = []; for (let i = 0; i < n; i++) a.push(this.i32()); return a; }
      case 12: { const n = this.i32(), a = []; for (let i = 0; i < n; i++) a.push(this.i64()); return a; }
      default: throw new Error('Unknown NBT tag type: ' + type);
    }
  }

  root() {
    const t = this.u8();
    if (t !== 10) throw new Error('File does not start with a Compound tag');
    this.str();
    return this.payload(10);
  }
}

export async function parseNBT(bytes) {
  if (isGzip(bytes)) bytes = await gunzip(bytes);
  return new Reader(bytes).root();
}

/**
 * Extracts world generation info from a level.dat file.
 * Returns { seed: BigInt, versionName, largeBiomes, levelName }.
 */
export async function readLevelDat(bytes) {
  if (bytes.length > 8 && !isGzip(bytes) && bytes[0] !== 10) {
    throw new Error('This looks like a Bedrock Edition level.dat – only Java Edition is supported.');
  }
  const root = await parseNBT(bytes);
  const data = root.Data || root;
  const wgs = data.WorldGenSettings;

  let seed = null;
  if (wgs && typeof wgs.seed === 'bigint') seed = wgs.seed;
  else if (typeof data.RandomSeed === 'bigint') seed = data.RandomSeed;
  if (seed === null) throw new Error('No seed found in level.dat');

  let largeBiomes = false;
  const ow = wgs && wgs.dimensions && wgs.dimensions['minecraft:overworld'];
  if (ow && ow.generator) {
    const settings = ow.generator.settings;
    if (settings === 'minecraft:large_biomes') largeBiomes = true;
    if (ow.generator.biome_source && ow.generator.biome_source.large_biomes) largeBiomes = true;
  }
  if (typeof data.generatorName === 'string' && data.generatorName.toLowerCase() === 'largebiomes') {
    largeBiomes = true;
  }

  return {
    seed,
    versionName: data.Version && data.Version.Name || null,
    dataVersion: data.DataVersion ?? (data.Version && data.Version.Id) ?? null,
    largeBiomes,
    levelName: data.LevelName || null,
  };
}
