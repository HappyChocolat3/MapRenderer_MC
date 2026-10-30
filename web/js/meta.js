// Static metadata: structure names/colours, seed parsing and version mapping.
import { S, DIM } from './cubiomes.js';

// Pseudo structure ids for things that are not cubiomes structure types.
export const STRONGHOLD = 100;
export const SPAWN = 101;
export const FIXED_GATEWAY = 102;

// label: short text drawn on the map marker
// dense: per-chunk features, only shown when zoomed in (off by default)
export const STRUCTURES = [
  { id: S.Village,         name: 'Wioska',                 label: 'V',  color: '#c97f34', dims: [DIM.OVERWORLD] },
  { id: S.Desert_Pyramid,  name: 'Piramida pustynna',      label: 'P',  color: '#e3bb4f', dims: [DIM.OVERWORLD] },
  { id: S.Jungle_Temple,   name: 'Świątynia w dżungli',    label: 'J',  color: '#5f9128', dims: [DIM.OVERWORLD] },
  { id: S.Swamp_Hut,       name: 'Chatka wiedźmy',         label: 'W',  color: '#4c6a3c', dims: [DIM.OVERWORLD] },
  { id: S.Igloo,           name: 'Igloo',                  label: 'I',  color: '#bfe3ff', dims: [DIM.OVERWORLD], dark: true },
  { id: S.Outpost,         name: 'Posterunek złosadników', label: 'Po', color: '#5a5a5a', dims: [DIM.OVERWORLD] },
  { id: S.Mansion,         name: 'Rezydencja leśna',       label: 'R',  color: '#6e3f1d', dims: [DIM.OVERWORLD] },
  { id: S.Monument,        name: 'Monument oceaniczny',    label: 'M',  color: '#22b3a6', dims: [DIM.OVERWORLD] },
  { id: S.Ocean_Ruin,      name: 'Ruiny oceaniczne',       label: 'Ro', color: '#3c7f91', dims: [DIM.OVERWORLD] },
  { id: S.Shipwreck,       name: 'Wrak statku',            label: 'Wr', color: '#8b5a2b', dims: [DIM.OVERWORLD] },
  { id: S.Ruined_Portal,   name: 'Zrujnowany portal',      label: 'Zp', color: '#7d3cc8', dims: [DIM.OVERWORLD] },
  { id: S.Ancient_City,    name: 'Starożytne miasto',      label: 'A',  color: '#0e4d5c', dims: [DIM.OVERWORLD] },
  { id: S.Trail_Ruins,     name: 'Ruiny szlaku',           label: 'Rs', color: '#b5745a', dims: [DIM.OVERWORLD] },
  { id: S.Trial_Chambers,  name: 'Komnaty prób',           label: 'K',  color: '#d4772a', dims: [DIM.OVERWORLD] },
  { id: S.Abandoned_Camp,  name: 'Opuszczony obóz',        label: 'O',  color: '#c2185b', dims: [DIM.OVERWORLD] },
  { id: STRONGHOLD,        name: 'Twierdza',               label: 'T',  color: '#8c8c8c', dims: [DIM.OVERWORLD] },
  { id: SPAWN,             name: 'Spawn',                  label: '★',  color: '#ffffff', dims: [DIM.OVERWORLD], dark: true },
  { id: S.Mineshaft,       name: 'Kopalnia',               label: 'Ko', color: '#9c7038', dims: [DIM.OVERWORLD], dense: true },
  { id: S.Treasure,        name: 'Zakopany skarb',         label: '$',  color: '#ffd400', dims: [DIM.OVERWORLD], dense: true, dark: true },
  { id: S.Desert_Well,     name: 'Studnia pustynna',       label: 'St', color: '#e0c07a', dims: [DIM.OVERWORLD], dense: true, dark: true },
  { id: S.Geode,           name: 'Geoda ametystowa',       label: 'G',  color: '#a874e0', dims: [DIM.OVERWORLD], dense: true },
  { id: S.Fortress,        name: 'Forteca Netheru',        label: 'F',  color: '#7a2020', dims: [DIM.NETHER] },
  { id: S.Bastion,         name: 'Pozostałości bastionu',  label: 'B',  color: '#2e2e2e', dims: [DIM.NETHER] },
  { id: S.Ruined_Portal_N, name: 'Zrujnowany portal',      label: 'Zp', color: '#7d3cc8', dims: [DIM.NETHER] },
  { id: S.End_City,        name: 'Miasto Endu',            label: 'E',  color: '#e4d79c', dims: [DIM.END], dark: true },
  { id: FIXED_GATEWAY,     name: 'Brama Endu (główna)',    label: 'Br', color: '#20204a', dims: [DIM.END] },
  { id: S.End_Gateway,     name: 'Brama Endu (zewn.)',     label: 'b',  color: '#3a3a7a', dims: [DIM.END], dense: true },
];

export const STRUCT_BY_ID = new Map(STRUCTURES.map((s) => [s.id, s]));

export const RIVER_BIOMES = new Set([7, 11]); // river, frozen_river

// Java's String.hashCode, used by Minecraft for text seeds.
function javaHashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** Parses a seed the same way the Minecraft "Create world" screen does. */
export function parseSeed(text) {
  const t = text.trim();
  if (t === '') return null;
  if (/^[-+]?\d+$/.test(t)) {
    const v = BigInt(t);
    if (v >= -(1n << 63n) && v < (1n << 63n)) return v;
  }
  return BigInt(javaHashCode(t));
}

export function randomSeed() {
  const a = new BigUint64Array(1);
  crypto.getRandomValues(a);
  return BigInt.asIntN(64, a[0]);
}

/**
 * Maps a game version string (e.g. "1.20.4") to the matching cubiomes version
 * name (as accepted by str2mc). Unknown / newer versions map to the newest.
 */
export function mapVersionName(name, newest) {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(name || '');
  if (!m) return newest;
  const major = +m[1], minor = +m[2], patch = +(m[3] || 0);
  if (major === 26) return minor <= 1 ? '1.21.9' : minor === 2 ? '26.2' : newest;
  if (major !== 1 || minor >= 22) return newest;
  if (minor === 21) {
    if (patch <= 1) return '1.21.1';
    if (patch <= 3) return '1.21.3';
    if (patch === 4) return '1.21 WD';
    return patch <= 8 ? '1.21.5' : '1.21.9';
  }
  if (minor === 19) return patch <= 2 ? '1.19.2' : '1.19';
  if (minor === 16) return patch <= 1 ? '1.16.1' : '1.16';
  return '1.' + minor;
}
