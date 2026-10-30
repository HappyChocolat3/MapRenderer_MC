#!/usr/bin/env python3
"""Generates a cubiomes biome tree table (cubiomes/tables/btree*.h) from a
biome parameter report of the Minecraft data generator
(reports/biome_parameters/minecraft/overworld.json, see
.github/workflows/biome-params.yml).

The tree is built exactly like Minecraft's Climate.RTree, so that the nearest
biome search in cubiomes gives the same results as the game, including ties.

usage: gen_btree.py REPORT.json[.gz] NAME > cubiomes/tables/btreeNAME.h
"""

import gzip
import json
import math
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIMS = ['temperature', 'humidity', 'continentalness', 'erosion', 'depth', 'weirdness', 'offset']
CHILDREN = 6


def f32(x):
    return struct.unpack('f', struct.pack('f', x))[0]


def quantize(v):
    # Climate.quantizeCoord: (long) (f * 10000.0F), evaluated in float
    return int(f32(f32(v) * f32(10000.0)))


def java_div2(a):
    # (min + max) / 2L with Java's truncating integer division
    s = a
    return -((-s) // 2) if s < 0 else s // 2


def biome_ids():
    """Maps modern biome names to cubiomes ids using biomes.h and util.c."""
    enum = {}
    src = (ROOT / 'cubiomes/biomes.h').read_text()
    body = src[src.index('enum BiomeID'):]
    body = body[:body.index('};')]
    entries = re.findall(r'^\s*(\w+)\s*(?:=\s*([^,/\n]+?))?\s*,', body, re.M)
    # Values may be expressions referring to names defined later
    # (e.g. "old_growth_birch_forest = tall_birch_forest"), so resolve in passes.
    for _ in range(10):
        nxt = None
        for name, val in entries:
            if val:
                try:
                    nxt = eval(val, {'__builtins__': {}}, dict(enum))
                except NameError:
                    nxt = None
            if nxt is not None:
                enum.setdefault(name, nxt)
                nxt += 1
    missing = [n for n, _ in entries if n not in enum]
    if missing:
        raise SystemExit(f'could not resolve biome ids: {missing}')
    names = {}
    util = (ROOT / 'cubiomes/util.c').read_text()
    fn = util[util.index('const char *biome2str'):]
    fn = fn[:fn.index('\n}\n')]
    for case, s in re.findall(r'case (\w+):\s*return "(\w+)"', fn):
        names.setdefault(s, enum[case])
    for k, v in enum.items():
        names.setdefault(k, v)
    return names


class Node:
    __slots__ = ('space', 'children', 'biome')

    def __init__(self, space, children=None, biome=None):
        self.space = space
        self.children = children
        self.biome = biome


def subtree(children):
    space = []
    for d in range(len(DIMS)):
        space.append((min(c.space[d][0] for c in children), max(c.space[d][1] for c in children)))
    return Node(space, children)


def mid(node, d):
    lo, hi = node.space[d]
    return java_div2(lo + hi)


def sort_nodes(nodes, d, absolute):
    order = [(d + i) % len(DIMS) for i in range(len(DIMS))]
    if absolute:
        key = lambda n: tuple(abs(mid(n, k)) for k in order)
    else:
        key = lambda n: tuple(mid(n, k) for k in order)
    nodes.sort(key=key)


def bucketize(nodes):
    size = int(6.0 ** math.floor(math.log(len(nodes) - 0.01) / math.log(6.0)))
    out, cur = [], []
    for n in nodes:
        cur.append(n)
        if len(cur) >= size:
            out.append(subtree(cur))
            cur = []
    if cur:
        out.append(subtree(cur))
    return out


def cost(space):
    return sum(abs(hi - lo) for lo, hi in space)


def build(nodes):
    if len(nodes) == 1:
        return nodes[0]
    if len(nodes) <= CHILDREN:
        nodes.sort(key=lambda n: sum(abs(mid(n, d)) for d in range(len(DIMS))))
        return subtree(nodes)
    best, best_dim, best_buckets = None, -1, None
    for d in range(len(DIMS)):
        sort_nodes(nodes, d, False)
        buckets = bucketize(nodes)
        c = sum(cost(b.space) for b in buckets)
        if best is None or best > c:
            best, best_dim, best_buckets = c, d, buckets
    sort_nodes(best_buckets, best_dim, True)
    return subtree([build(list(b.children)) for b in best_buckets])


def load(path):
    opener = gzip.open if str(path).endswith('.gz') else open
    with opener(path, 'rt') as f:
        data = json.load(f)
    entries = data['biomes'] if isinstance(data, dict) else data
    ids = biome_ids()
    leaves = []
    for e in entries:
        name = e['biome'].split(':')[-1]
        if name not in ids:
            raise SystemExit(f'unknown biome {name!r}: add it to cubiomes/biomes.h and util.c')
        p = e['parameters']
        space = []
        for d in DIMS:
            v = p.get(d, 0.0)
            if isinstance(v, list):
                space.append((quantize(v[0]), quantize(v[1])))
            else:
                q = quantize(v)
                space.append((q, q))
        leaves.append(Node(space, biome=ids[name]))
    for leaf in leaves:
        if leaf.space[6] != (0, 0):
            raise SystemExit('non-zero offset parameters are not supported by cubiomes')
    return leaves


def height(n):
    return 0 if n.children is None else 1 + max(height(c) for c in n.children)


def emit(root, name, src):
    h = height(root)
    steps = [(CHILDREN ** (h - d) - 1) // (CHILDREN - 1) for d in range(h)] + [0]

    flat = []

    def walk(n):
        # Reserve slots for a complete subtree layout: children of a node at
        # depth d are spaced steps[d] apart, as get_resulting_node() expects.
        idx = len(flat)
        flat.append(n)
        if n.children is not None:
            for c in n.children:
                walk(c)
        return idx

    walk(root)

    # The root's box is never used by the search; cubiomes encodes it as (0,0).
    params = sorted({sp for n in flat[1:] for sp in n.space[:6]} | {(0, 0)})
    pidx = {p: i for i, p in enumerate(params)}
    if len(params) > 255:
        raise SystemExit('too many distinct parameter ranges')

    index = {id(n): i for i, n in enumerate(flat)}
    words = []
    for i, n in enumerate(flat):
        w = 0
        for d in range(6):
            w |= pidx[n.space[d] if i else (0, 0)] << (8 * d)
        if n.children is None:
            w |= (0xFF << 56) | (n.biome << 48)
        else:
            w |= index[id(n.children[0])] << 48
        words.append(w)

    out = ['#include <inttypes.h>', '', f'enum {{ btree{name}_order = {CHILDREN} }};', '']
    out.append(f'static const uint32_t btree{name}_steps[] = {{ ' + ', '.join(map(str, steps)) + ' };')
    out.append('')
    out.append(f'static const int32_t btree{name}_param[][2] =')
    out.append('{')
    for i in range(0, len(params), 4):
        chunk = params[i:i + 4]
        row = ','.join('{%6d,%6d}' % p for p in chunk)
        out.append(f'    {row}, // {i:02X}-{i + len(chunk) - 1:02X}')
    out.append('};')
    out.append('')
    out.append(f'static const uint64_t btree{name}_nodes[] =')
    out.append('{')
    out.append(f'    // Binary encoded biome parameter search tree, generated by')
    out.append(f'    // tools/gen_btree.py from {src}.')
    out.append('    //')
    out.append('    //   +-------------- If the top byte equals 0xFF, the node is a leaf and the')
    out.append('    //   |               second byte is the biome id, otherwise the two bytes')
    out.append('    //   |               are a short index to the first child node.')
    out.append('    //   |')
    out.append('    //   | +------------ Biome parameter index for 5 (weirdness)')
    out.append('    //   | | +---------- Biome parameter index for 4 (depth)')
    out.append('    //   | | | +-------- Biome parameter index for 3 (erosion)')
    out.append('    //   | | | | +------ Biome parameter index for 2 (continentalness)')
    out.append('    //   | | | | | +---- Biome parameter index for 1 (humidity)')
    out.append('    //   | | | | | | +-- Biome parameter index for 0 (temperature)')
    out.append('    //   | | | | | | |')
    out.append('    //   v v v v v v v')
    for i in range(0, len(words), 4):
        out.append('    ' + ','.join('0x%016X' % w for w in words[i:i + 4]) + ',')
    out.append('};')
    return '\n'.join(out) + '\n'


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    path, name = sys.argv[1], sys.argv[2]
    root = build(load(path))
    sys.stdout.write(emit(root, name, Path(path).name))


if __name__ == '__main__':
    main()
