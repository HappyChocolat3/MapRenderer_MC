# Minecraft World Map

A Minecraft (Java Edition) world map that runs entirely in the browser — perfect
for hosting on GitHub Pages. From a **seed** or a **`level.dat`** file it shows:

- **biomes** (Overworld, Nether, End), with a selectable Y level for 1.18+,
- **biome boundaries**,
- **rivers** (highlighted),
- **slime chunks** (when zoomed in),
- **structures** — each type can be shown or hidden: villages, desert pyramids,
  jungle temples, witch huts, igloos, pillager outposts, woodland mansions, ocean
  monuments, ocean ruins, shipwrecks, ruined portals, ancient cities, trail ruins,
  trial chambers, abandoned camps (26.3), strongholds, world spawn, mineshafts,
  buried treasure, desert wells, amethyst geodes, nether fortresses, bastion
  remnants, end cities and end gateways,
- a coordinate grid, highlighting of a selected biome, copying a `/tp` command by
  clicking a structure, and a shareable link to the current view (the state is
  stored in the URL).

Supported versions: Beta 1.7 up to **26.3** (versions before 1.7 are experimental),
including Dappled Forest and Sulfur Caves.

## How it works

World generation is done by [cubiomes](https://github.com/Cubitect/cubiomes)
(a C library, MIT license, that faithfully reimplements Minecraft's world
generation) compiled to WebAssembly. The map is split into tiles that are
generated in parallel by several Web Workers; a fast low-resolution preview is
shown first, followed by full resolution.

```
cubiomes/        cubiomes source (commit in cubiomes/VERSION) with added support
                 for versions 1.21.5 – 26.3 (see below)
wasm/api.c       C API exported to JavaScript
wasm/build.sh    builds web/cubiomes.wasm
tools/           biome table generator + data from Minecraft's data generator
web/             the website (this is what gets published to GitHub Pages)
  js/app.js        UI, map rendering, mouse/touch handling
  js/worker.js     tile generation worker
  js/cubiomes.js   wrapper around the WebAssembly module
  js/nbt.js        level.dat reader (NBT + gzip)
  js/meta.js       structure list, seed parsing, version mapping
```

## Publishing to GitHub Pages

1. In the repository go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to the `main` branch (or run the "Deploy to GitHub Pages" workflow
   manually). The workflow builds `cubiomes.wasm` and publishes the `web/` directory.

A prebuilt `web/cubiomes.wasm` is also committed, so `web/` can be uploaded to
any static hosting without compiling anything.

## Running locally

The site uses ES modules and workers, so it has to be served over HTTP:

```sh
cd web
python3 -m http.server 8000
# http://localhost:8000
```

## Rebuilding the WebAssembly module

Requires clang with the wasm32 target and wasi-libc (Ubuntu 24.04):

```sh
sudo apt-get install clang lld wasi-libc libclang-rt-18-dev-wasm32
./wasm/build.sh
```

## Newer Minecraft versions

Upstream cubiomes stops at 1.21.4, so newer versions are added in this repository:

| Version | World generation changes |
|---|---|
| 1.21.5 | Pale Garden takes over some former Dark Forest areas; woodland mansions can also generate in Pale Gardens |
| 1.21.9 | strongholds can be biased towards Cherry Groves |
| 26.2 | new cave biome: Sulfur Caves |
| 26.3 | new biome Dappled Forest (replacing some Plains), abandoned camps |

The biome tables (`cubiomes/tables/btree215.h`, `btree262.h`, `btree263.h`) are
generated from the game's official data:

1. The **"Dump biome parameters"** workflow runs Minecraft's data generator
   (`server.jar --reports`) for the given versions and stores the results in
   `tools/biome-params/`.
2. `tools/gen_btree.py` builds the search tree from them exactly like the game
   does (`Climate.RTree`). For 1.21.4 it produces a table that is byte-for-byte
   identical to the original cubiomes table.

To add another version: run the workflow with the new version, generate the
table (`python3 tools/gen_btree.py tools/biome-params/X-overworld.json.gz NAME`),
add the version to `cubiomes/biomes.h`, `biomenoise.c` and `util.c`, plus any new
biomes or structures.

Abandoned camps are jigsaw structures — as cubiomes does for other structures of
this kind, their biome check is an approximation (at the surface of the start
chunk).

## Notes

- Works for **Java Edition** only. Bedrock Edition generates structures differently.
- Structure positions are checked against biomes (and terrain where cubiomes
  supports it), but in rare cases a structure may still fail to generate in game.
- This project is not affiliated with Mojang Studios or Microsoft.

## Licenses

- cubiomes — MIT, © Cubitect (`cubiomes/LICENSE`).
