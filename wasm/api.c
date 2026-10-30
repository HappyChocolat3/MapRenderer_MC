// Thin WebAssembly API around cubiomes, used by web/js/worker.js.
//
// Every worker owns one instance of this module, so the global state below is
// per worker. Results are written into static/heap buffers and the JS side reads
// them straight out of linear memory.

#include "../cubiomes/generator.h"
#include "../cubiomes/finders.h"
#include "../cubiomes/util.h"

#include <stdlib.h>
#include <string.h>

#define EXPORT(name) __attribute__((export_name(#name)))

static Generator g;
static SurfaceNoise sn;
static int g_mc = -1, g_dim = 0x7fffffff, g_flags = -1;
static uint64_t g_seed;
static int sn_ready;

static int *biome_buf;
static size_t biome_cap;

#define MAX_OUT 65536
static int out_buf[MAX_OUT * 3];

static unsigned char colors[256][3];
static int colors_ready;

EXPORT(setup)
void setup(int mc, int large_biomes, uint64_t seed, int dim)
{
    int flags = large_biomes ? LARGE_BIOMES : 0;
    if (mc != g_mc || flags != g_flags)
    {
        setupGenerator(&g, mc, flags);
        g_mc = mc;
        g_flags = flags;
        g_dim = 0x7fffffff;
    }
    if (dim != g_dim || seed != g_seed)
    {
        applySeed(&g, dim, seed);
        g_dim = dim;
        g_seed = seed;
        sn_ready = 0;
    }
}

static int *ensure_buf(size_t n)
{
    if (n > biome_cap)
    {
        free(biome_buf);
        biome_buf = (int *) malloc(n * sizeof(int));
        biome_cap = biome_buf ? n : 0;
    }
    return biome_buf;
}

// Generates a sx*sz area of biome ids at the given scale (1, 4, 16, 64, 256).
// x, z are in scaled coordinates, y is a block height.
// Returns a pointer to the ids (row-major, z outer) or 0 on failure.
EXPORT(gen_biomes)
int *gen_biomes(int scale, int x, int z, int sx, int sz, int y)
{
    Range r = {scale, x, z, sx, sz, scale == 1 ? y : (y >> 2), 1};
    size_t n = getMinCacheSize(&g, scale, sx, 1, sz);
    int *buf = ensure_buf(n);
    if (!buf)
        return 0;
    if (genBiomes(&g, buf, r))
        return 0;
    return buf;
}

EXPORT(biome_at)
int biome_at(int scale, int x, int y, int z)
{
    return getBiomeAt(&g, scale, x, scale == 1 ? y : (y >> 2), z);
}

// Writes for every chunk in the given area 1 (slime chunk) or 0.
EXPORT(slime_chunks)
unsigned char *slime_chunks(int cx, int cz, int w, int h)
{
    unsigned char *out = (unsigned char *) out_buf;
    if ((size_t) w * h > sizeof(out_buf))
        return 0;
    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++)
            out[j * w + i] = isSlimeChunk(g_seed, cx + i, cz + j);
    return out;
}

static StructureConfig sconf_out;

// Returns a pointer to {salt, regionSize, chunkRange, dim} or 0 if the
// structure does not exist for the current version.
EXPORT(struct_config)
int *struct_config(int stype)
{
    if (!getStructureConfig(stype, g_mc, &sconf_out))
        return 0;
    out_buf[0] = sconf_out.salt;
    out_buf[1] = sconf_out.regionSize;
    out_buf[2] = sconf_out.chunkRange;
    out_buf[3] = sconf_out.dim;
    return out_buf;
}

static int viable(int stype, int x, int z)
{
    if (!isViableStructurePos(stype, &g, x, z, 0))
        return 0;
    if (stype == End_City)
    {
        if (!sn_ready)
        {
            initSurfaceNoise(&sn, DIM_END, g_seed);
            sn_ready = 1;
        }
        return isViableEndCityTerrain(&g, &sn, x, z);
    }
    if (g_mc >= MC_1_18 && !isViableStructureTerrain(stype, &g, x, z))
        return 0;
    return 1;
}

// Finds all structures of the given type whose position is inside the block
// area [x0, x1) x [z0, z1). Positions are written as (x, z) pairs into the
// output buffer; returns the number found (negative if the buffer overflowed).
EXPORT(find_structures)
int *find_structures(int stype, int x0, int z0, int x1, int z1, int *count)
{
    StructureConfig sc;
    *count = 0;
    if (!getStructureConfig(stype, g_mc, &sc) || sc.dim != g_dim)
        return out_buf;

    int rb = sc.regionSize * 16;
    int rx0 = floordiv(x0, rb), rx1 = floordiv(x1 - 1, rb);
    int rz0 = floordiv(z0, rb), rz1 = floordiv(z1 - 1, rb);
    int n = 0;

    for (int rz = rz0; rz <= rz1; rz++)
    {
        for (int rx = rx0; rx <= rx1; rx++)
        {
            Pos p;
            if (!getStructurePos(stype, g_mc, g_seed, rx, rz, &p))
                continue;
            if (p.x < x0 || p.x >= x1 || p.z < z0 || p.z >= z1)
                continue;
            if (!viable(stype, p.x, p.z))
                continue;
            if (n >= MAX_OUT)
            {
                *count = -n;
                return out_buf;
            }
            out_buf[2*n+0] = p.x;
            out_buf[2*n+1] = p.z;
            n++;
        }
    }
    *count = n;
    return out_buf;
}

// Finds the first 'n' strongholds (requires the overworld to be set up).
EXPORT(find_strongholds)
int *find_strongholds(int n, int *count)
{
    StrongholdIter sh;
    int i = 0;
    if (n > MAX_OUT)
        n = MAX_OUT;
    initFirstStronghold(&sh, g_mc, g_seed);
    while (i < n)
    {
        int more = nextStronghold(&sh, &g);
        out_buf[2*i+0] = sh.pos.x;
        out_buf[2*i+1] = sh.pos.z;
        i++;
        if (more <= 0)
            break;
    }
    *count = i;
    return out_buf;
}

EXPORT(find_spawn)
int *find_spawn(void)
{
    Pos p = getSpawn(&g);
    out_buf[0] = p.x;
    out_buf[1] = p.z;
    return out_buf;
}

EXPORT(fixed_gateways)
int *fixed_gateways(void)
{
    Pos p[20];
    getFixedEndGateways(g_mc, g_seed, p);
    for (int i = 0; i < 20; i++)
    {
        out_buf[2*i+0] = p[i].x;
        out_buf[2*i+1] = p[i].z;
    }
    return out_buf;
}

EXPORT(mc_name)
const char *mc_name(int mc) { return mc2str(mc); }

EXPORT(mc_from_str)
int mc_from_str(const char *s) { return str2mc(s); }

EXPORT(biome_name)
const char *biome_name(int mc, int id) { return biome2str(mc, id); }

EXPORT(struct_name)
const char *struct_name(int stype) { return struct2str(stype); }

EXPORT(biome_color)
int biome_color(int id)
{
    if (!colors_ready)
    {
        initBiomeColors(colors);
        colors_ready = 1;
    }
    if (id < 0 || id > 255)
        return 0;
    return (colors[id][0] << 16) | (colors[id][1] << 8) | colors[id][2];
}

EXPORT(is_overworld_biome)
int is_overworld_biome(int mc, int id) { return isOverworld(mc, id); }

EXPORT(biome_dim)
int biome_dim(int id) { return getDimension(id); }

EXPORT(biome_exists)
int biome_exists(int mc, int id) { return biomeExists(mc, id); }

// Small scratch area for passing strings and out-params from JS.
static char scratch[256];
EXPORT(scratch_ptr)
char *scratch_ptr(void) { return scratch; }
