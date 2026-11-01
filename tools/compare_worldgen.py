#!/usr/bin/env python3
"""Compares the world generation data of two Minecraft versions and prints a
Markdown summary. Used by .github/workflows/check-mc-version.yml.

Each directory is the --output of the Minecraft data generator run with
"--reports --server" (see the workflow).

usage: compare_worldgen.py OLD_DIR NEW_DIR OLD_VERSION NEW_VERSION
"""

import json
import sys
from pathlib import Path

WORLDGEN = [
    ('Structure sets (placement: spacing, separation, salt)', 'data/minecraft/worldgen/structure_set'),
    ('Structures', 'data/minecraft/worldgen/structure'),
    ('Structure biome tags', 'data/minecraft/tags/worldgen/biome/has_structure'),
]
SINGLE_FILES = [
    ('Stronghold biome bias', 'data/minecraft/tags/worldgen/biome/stronghold_biased_to.json'),
    ('Overworld biome tag', 'data/minecraft/tags/worldgen/biome/is_overworld.json'),
]


def find(root, rel):
    # the data generator writes either <out>/data/... or <out>/generated/data/...
    for base in (root, root / 'generated'):
        p = base / rel
        if p.exists():
            return p
    return None


def load(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def json_files(d):
    if d is None:
        return {}
    return {str(p.relative_to(d)): load(p) for p in sorted(d.rglob('*.json'))}


def biome_params(root, dim):
    p = find(root, f'reports/biome_parameters/minecraft/{dim}.json')
    data = load(p) if p else None
    if data is None:
        return None
    entries = data['biomes'] if isinstance(data, dict) else data
    return sorted(json.dumps(e, sort_keys=True) for e in entries)


def biome_names(params):
    return {json.loads(e)['biome'] for e in params or []}


def main():
    old_dir, new_dir, old_v, new_v = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]
    out = []
    changed = False

    out.append('### Biomes')
    for dim in ('overworld', 'nether'):
        a, b = biome_params(old_dir, dim), biome_params(new_dir, dim)
        if a is None or b is None:
            out.append(f'- **{dim}**: ⚠️ biome parameter report missing, compare manually')
            changed = True
        elif a == b:
            out.append(f'- **{dim}**: biome table unchanged')
        else:
            changed = True
            added = sorted(biome_names(b) - biome_names(a))
            removed = sorted(biome_names(a) - biome_names(b))
            line = f'- **{dim}**: ⚠️ biome table changed ({len(set(a) ^ set(b))} entries differ)'
            if added:
                line += '; new biomes: ' + ', '.join(f'`{x}`' for x in added)
            if removed:
                line += '; removed biomes: ' + ', '.join(f'`{x}`' for x in removed)
            out.append(line)

    out.append('')
    out.append('### Structures')
    for title, rel in WORLDGEN:
        if find(old_dir, rel) is None or find(new_dir, rel) is None:
            out.append(f'- **{title}**: ⚠️ data generator output missing, compare manually')
            changed = True
            continue
        a, b = json_files(find(old_dir, rel)), json_files(find(new_dir, rel))
        added = sorted(set(b) - set(a))
        removed = sorted(set(a) - set(b))
        modified = sorted(k for k in set(a) & set(b) if a[k] != b[k])
        if not (added or removed or modified):
            out.append(f'- **{title}**: unchanged')
            continue
        changed = True
        out.append(f'- **{title}**: ⚠️ changed')
        for label, items in (('added', added), ('removed', removed), ('modified', modified)):
            if items:
                shown = ', '.join(f'`{x[:-5]}`' for x in items[:30])
                more = f' and {len(items) - 30} more' if len(items) > 30 else ''
                out.append(f'  - {label}: {shown}{more}')
    for title, rel in SINGLE_FILES:
        pa, pb = find(old_dir, rel), find(new_dir, rel)
        if pa is None or pb is None:
            out.append(f'- **{title}**: ⚠️ data generator output missing, compare manually')
            changed = True
            continue
        a, b = load(pa), load(pb)
        if a == b:
            out.append(f'- **{title}**: unchanged')
            continue
        changed = True
        va = set((a or {}).get('values', []))
        vb = set((b or {}).get('values', []))
        diff = [f'+`{x}`' for x in sorted(vb - va)] + [f'-`{x}`' for x in sorted(va - vb)]
        out.append(f'- **{title}**: ⚠️ changed ' + (' '.join(diff) if diff else '(format only?)'))

    head = [f'Compared with the last supported version **{old_v}**.', '']
    if changed:
        head.append('**World generation data changed** — the map needs an update '
                    '(see README → "Newer Minecraft versions"). Changes that only '
                    'reformat JSON files can also show up here, so check the details.')
    else:
        head.append('**No world generation changes detected.** Only the version '
                    'mapping needs an update (`mapVersionName` in `web/js/meta.js`, '
                    'version labels in `web/js/app.js`, `tools/supported-version.txt`).')
    print('\n'.join(head + [''] + out))
    return 0


if __name__ == '__main__':
    sys.exit(main())
