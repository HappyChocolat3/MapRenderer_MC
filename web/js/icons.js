// Original 12x12 pixel-art icons for structure markers.
// Each icon is a list of rows; every character maps to a colour in the shared
// palette (or the icon's own palette). '.' is transparent.
import { S } from './cubiomes.js';
import { STRONGHOLD, SPAWN, FIXED_GATEWAY } from './meta.js';

const SIZE = 12;

const BASE = {
  k: '#141414', // outline
  w: '#f2efe6', // white
  n: '#05070c', // near black
};

const ICONS = {
  [S.Village]: {
    p: { r: '#b5482c', w: '#e3c98f', b: '#6fb2e8', d: '#6b4423' },
    rows: [
      '.....kk.....',
      '....krrk....',
      '...krrrrk...',
      '..krrrrrrk..',
      '.krrrrrrrrk.',
      'kkkkkkkkkkkk',
      '.kwwwwwwwwk.',
      '.kwbbwwbbwk.',
      '.kwbbwwbbwk.',
      '.kwwwddwwwk.',
      '.kwwwddwwwk.',
      '.kkkkkkkkkk.',
    ],
  },
  [S.Desert_Pyramid]: {
    p: { y: '#ecd593', o: '#c9733c' },
    rows: [
      '.....kk.....',
      '....kyyk....',
      '...kyooyk...',
      '...kyyyyk...',
      '..kyyyyyyk..',
      '..kyoyyoyk..',
      '.kyyyyyyyyk.',
      '.kyyyyyyyyk.',
      'kyoyyyyyyoyk',
      'kyyyyyyyyyyk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Jungle_Temple]: {
    p: { s: '#8e9580', g: '#4f9a2b' },
    rows: [
      '...kkkkkk...',
      '...ksgssk...',
      '.kkkkkkkkkk.',
      '.ksssgsssgk.',
      '.ksskkkkssk.',
      'kkkkkkkkkkkk',
      'ksgssssgsssk',
      'ksssskksssgk',
      'kgsssknksssk',
      'ksssgknkssgk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Swamp_Hut]: {
    p: { p: '#5b3487', g: '#7bd13f' },
    rows: [
      '......kk....',
      '.....kpk....',
      '....kppk....',
      '....kppk....',
      '...kpppk....',
      '...kppppk...',
      '..kppppppk..',
      '..kggggggk..',
      'kkppppppppkk',
      'kppppppppppk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Igloo]: {
    p: { w: '#f7fcff', l: '#9fc8e6' },
    rows: [
      '....kkkk....',
      '..kkwwwwkk..',
      '.kwwwwlwwwk.',
      '.kwlwwwwwwk.',
      'kwwwwwwwlwwk',
      'kwwwwkkwwwwk',
      'kwlwknnkwwlk',
      'kwwwknnkwwwk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Outpost]: {
    p: { d: '#5c4630', w: '#e8e8e8', r: '#8a2323' },
    rows: [
      'kkkkkkkkkkkk',
      'kdkddkddkddk',
      'kddddddddddk',
      '.kddddddddk.',
      '.kddwwwwddk.',
      '.kddwrrwddk.',
      '.kddwrrwddk.',
      '.kddwwwwddk.',
      '.kddddddddk.',
      '.kdddkkdddk.',
      '.kdddkndddk.',
      '.kkkkkkkkkk.',
    ],
  },
  [S.Mansion]: {
    p: { d: '#4a3020', w: '#dcc8a0', b: '#4a74a8' },
    rows: [
      '....kkkk....',
      '...kddddk...',
      '..kkkkkkkk..',
      '.kddddddddk.',
      'kkkkkkkkkkkk',
      'kwbwbwwbwbwk',
      'kwwwwwwwwwwk',
      'kwbwbwwbwbwk',
      'kwwwwkkwwwwk',
      'kwbwwknwwbwk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Monument]: {
    p: { p: '#62c2ad', d: '#2a6b62' },
    rows: [
      '.....kk.....',
      '....kppk....',
      '...kpddpk...',
      '..kppppppk..',
      '.kkkkkkkkkk.',
      '.kpdppppdpk.',
      'kppppppppppk',
      'kpdppkkppdpk',
      'kppppkkppppk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Ocean_Ruin]: {
    p: { s: '#a7b3ac', m: '#4f8a4a' },
    rows: [
      '.kkk....kkk.',
      '.ksk....ksk.',
      '.ksk....kmk.',
      '.kmk....ksk.',
      '.ksk...kkkk.',
      '.ksk...kssk.',
      '.ksk...kmsk.',
      'kkkkkkkkkkkk',
      'ksmsssssmssk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Shipwreck]: {
    p: { b: '#86592f', s: '#e9e1cf', t: '#3b82c4' },
    rows: [
      '.....k......',
      '.....kk.....',
      '.....ksk....',
      '.....kssk...',
      '.....ksssk..',
      '.....kkkkkk.',
      'kkkkkkkkkkkk',
      'kbbbbbbbbbbk',
      '.kbbbbbbbbk.',
      '..kkkkkkkk..',
      'ttt.tttt.ttt',
    ],
  },
  [S.Ruined_Portal]: {
    p: { o: '#3d2a63', p: '#a259ff' },
    rows: [
      '.kkkkkk.kk..',
      '.kooook.kok.',
      '.kokkkkkkok.',
      '.kokpppppok.',
      '.kokpppppok.',
      '.kokpppppok.',
      '.kokpppppok.',
      '.kokkkkkkok.',
      '.kooooooook.',
      '.kkkkkkkkkk.',
    ],
  },
  [S.Ancient_City]: {
    p: { d: '#46525e', c: '#2fe3ec' },
    rows: [
      'kkkkkkkkkkkk',
      'kddddddddddk',
      'kddkkkkkkddk',
      'kdknnnnnnkdk',
      'kdknccccnkdk',
      'kdkncnncnkdk',
      'kdknccccnkdk',
      'kdknnnnnnkdk',
      'kddkkkkkkddk',
      'kddddddddddk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Trail_Ruins]: {
    p: { h: '#a0703c', y: '#ead68c' },
    rows: [
      '.........kk.',
      '........khhk',
      '.......khhk.',
      '......khhk..',
      '.....kkkk...',
      '....kyyyk...',
      '...kyyyyk...',
      '..kyyyyk....',
      '.kyyyyk.....',
      'kyyyyk......',
      'kkkkk.......',
    ],
  },
  [S.Trial_Chambers]: {
    p: { c: '#c8733a', o: '#ffb347' },
    rows: [
      'kkkkkkkkkkkk',
      'kckcckcckckk',
      'kkkkkkkkkkkk',
      'kckooooookck',
      'kkkoowwookkk',
      'kckowwwwokck',
      'kkkoowwookkk',
      'kckooooookck',
      'kkkkkkkkkkkk',
      'kckcckcckckk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Abandoned_Camp]: {
    p: { t: '#dcc28a', s: '#b49660', f: '#ff8a1e', y: '#ffd84a', l: '#6b4423' },
    rows: [
      '....kk......',
      '...ktsk.....',
      '..kttssk....',
      '..ktnnsk....',
      '.kttnnssk...',
      '.ktnnnnsk.y.',
      'kttnnnnssfyf',
      'ktnnnnnnskfk',
      'kkkkkkkkkllk',
    ],
  },
  [STRONGHOLD]: {
    p: { g: '#2fa37f', l: '#7fe0bd' },
    rows: [
      '....kkkk....',
      '..kkggggkk..',
      '.kgglgggggk.',
      '.kggkkkkggk.',
      'kgggknnkgggk',
      'kgggknnkgggk',
      '.kggkkkkggk.',
      '.kggggggggk.',
      '..kkggggkk..',
      '....kkkk....',
    ],
  },
  [SPAWN]: {
    p: { r: '#d23b3b', w: '#f4f4f4', d: '#8a5a2b' },
    rows: [
      'kk..........',
      'kwk.........',
      'kwwkkkkkkkkk',
      'kwwrrrrrrrrk',
      'krrrrrrrrrrk',
      'kkkkkkkkkkkk',
      'kdk......kdk',
      'kkk......kkk',
    ],
  },
  [S.Mineshaft]: {
    p: { s: '#9aa3ab', h: '#8a5a2b' },
    rows: [
      '..kkkkkkk...',
      '.kssssssskk.',
      'kssskkkkssk.',
      'kskk..khkssk',
      'kk...khk.ksk',
      '....khk...kk',
      '...khk......',
      '..khk.......',
      '.khk........',
      'khk.........',
      'kk..........',
    ],
  },
  [S.Treasure]: {
    p: { b: '#a8702e', y: '#f2c94c' },
    rows: [
      '.kkkkkkkkkk.',
      'kbbbbbbbbbbk',
      'kbbbbbbbbbbk',
      'kkkkkyykkkkk',
      'kbbbkyykbbbk',
      'kbbbbkkbbbbk',
      'kbbbbbbbbbbk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Desert_Well]: {
    p: { y: '#e8cf8f', t: '#3b82c4' },
    rows: [
      'kkkkkkkkkkkk',
      'kyyyyyyyyyyk',
      'kkkkkkkkkkkk',
      '.ky......yk.',
      '.ky......yk.',
      'kkkkkkkkkkkk',
      'kyttttttttyk',
      'kyyyyyyyyyyk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Geode]: {
    p: { a: '#a874e0', l: '#e6ccff' },
    rows: [
      '.....kk.....',
      '....kalk....',
      '....kaak....',
      '.kk.kaak.kk.',
      'kalkkaakkalk',
      'kaakkaakkaak',
      'kaaakaakaaak',
      '.kaaaaaaaak.',
      '..kkkkkkkk..',
    ],
  },
  [S.Fortress]: {
    p: { r: '#6a2328', o: '#ff9a3c' },
    rows: [
      'kkkk....kkkk',
      'krrk....krrk',
      'krrkkkkkkrrk',
      'krrrrrrrrrrk',
      'krorrrrrrork',
      'krrrrkkrrrrk',
      'krrrknnkrrrk',
      'krrrknnkrrrk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.Bastion]: {
    p: { d: '#3d3843', y: '#f2c94c' },
    rows: [
      'kk.kkkk.kk..',
      'kdkkddkkdk..',
      'kddddddddk..',
      'kddyyddddk..',
      'kddyyddddkkk',
      'kddddddddddk',
      'kddddddyyddk',
      'kddkkdddyddk',
      'kddknkdddddk',
      'kkkkkkkkkkkk',
    ],
  },
  [S.End_City]: {
    p: { p: '#c193c1', d: '#8e5f8e' },
    rows: [
      '...kkkkkk...',
      '...kppppk...',
      '...kpnnpk...',
      '..kkppppkk..',
      '..kpppppdk..',
      '..kpnpnpdk..',
      '.kkppppppkk.',
      '.kppppppppk.',
      '.kpnpnnpnpk.',
      '.kppppppppk.',
      '.kkkkkkkkkk.',
    ],
  },
  [FIXED_GATEWAY]: {
    p: { s: '#bfefff', b: '#6b6bd6' },
    rows: [
      'kkkkkkkkkkkk',
      'knnnnnnnnnnk',
      'knsnnnnnbnnk',
      'knnnnsnnnnnk',
      'knnbnnnnnsnk',
      'knnnnnnnnnnk',
      'knsnnnbnnnnk',
      'knnnnnnnsnnk',
      'knnsnnnnnnnk',
      'knnnnnnnnnnk',
      'kkkkkkkkkkkk',
    ],
  },
};
ICONS[S.Ruined_Portal_N] = ICONS[S.Ruined_Portal];
ICONS[S.End_Gateway] = ICONS[FIXED_GATEWAY];

const cache = new Map();

/** Returns a SIZE x SIZE canvas with the icon for a structure id, or null. */
export function iconCanvas(id) {
  if (cache.has(id)) return cache.get(id);
  const icon = ICONS[id];
  if (!icon) return null;
  const palette = { ...BASE, ...icon.p };
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  // centre the icon in the SIZE x SIZE square
  const h = icon.rows.length;
  const w = Math.max(...icon.rows.map((r) => r.length));
  const oy = Math.floor((SIZE - h) / 2), ox = Math.floor((SIZE - w) / 2);
  icon.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' || !palette[ch]) return;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(ox + x, oy + y, 1, 1);
    });
  });
  cache.set(id, c);
  return c;
}

export const ICON_SIZE = SIZE;
