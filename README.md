# Mapa świata Minecraft

Przeglądarkowa mapa świata Minecraft (Java Edition) działająca w całości po stronie
klienta — idealna do hostowania na GitHub Pages. Na podstawie **seeda** albo pliku
**`level.dat`** pokazuje:

- **biomy** (Overworld, Nether, End) z wyborem wysokości Y dla 1.18+,
- **granice biomów**,
- **rzeki** (wyróżnione kolorem),
- **slime chunki** (po przybliżeniu),
- **struktury** — każdą można osobno pokazać lub ukryć: wioski, piramidy, świątynie
  w dżungli, chatki wiedźm, igloo, posterunki, rezydencje, monumenty, ruiny
  oceaniczne, wraki, zrujnowane portale, starożytne miasta, ruiny szlaku, komnaty
  prób, opuszczone obozy (26.3), twierdze, spawn, kopalnie, skarby, studnie, geody,
  fortece, bastiony, miasta Endu i bramy Endu,
- siatkę współrzędnych, podświetlanie wybranego biomu, kopiowanie `/tp` po kliknięciu
  w strukturę oraz link do aktualnego widoku (stan zapisuje się w adresie URL).

Obsługiwane wersje: od Beta 1.7 do **26.3** (starsze niż 1.7 — eksperymentalnie),
w tym Dappled Forest i Sulfur Caves.

## Jak to działa

Generowanie świata to [cubiomes](https://github.com/Cubitect/cubiomes) (biblioteka C,
licencja MIT, wierne odtworzenie generatora Minecrafta) skompilowane do
WebAssembly. Mapa jest dzielona na kafelki, które liczy kilka Web Workerów
równolegle; najpierw ładuje się szybki, zgrubny podgląd, potem pełna rozdzielczość.

```
cubiomes/        kod źródłowy cubiomes (commit w cubiomes/VERSION) z dodaną
                 obsługą wersji 1.21.5 – 26.3 (patrz niżej)
wasm/api.c       API C eksportowane do JavaScriptu
wasm/build.sh    budowanie web/cubiomes.wasm
tools/           generator tablic biomów + dane z generatora danych Minecrafta
web/             strona (to jest publikowane na GitHub Pages)
  js/app.js        interfejs, renderowanie mapy, obsługa myszy/dotyku
  js/worker.js     worker generujący kafelki
  js/cubiomes.js   wrapper na moduł WebAssembly
  js/nbt.js        odczyt level.dat (NBT + gzip)
  js/meta.js       lista struktur, parsowanie seeda, mapowanie wersji
```

## Publikacja na GitHub Pages

1. W repozytorium: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Wypchnij zmiany na gałąź `main` (lub uruchom ręcznie workflow
   „Deploy to GitHub Pages”). Workflow buduje `cubiomes.wasm` i publikuje katalog `web/`.

Gotowy `web/cubiomes.wasm` jest też w repozytorium, więc katalog `web/` można
wrzucić na dowolny hosting statyczny bez kompilacji.

## Uruchomienie lokalnie

Strona używa modułów ES i workerów, więc trzeba ją serwować przez HTTP:

```sh
cd web
python3 -m http.server 8000
# http://localhost:8000
```

## Przebudowa WebAssembly

Wymaga clang z targetem wasm32 i wasi-libc (Ubuntu 24.04):

```sh
sudo apt-get install clang lld wasi-libc libclang-rt-18-dev-wasm32
./wasm/build.sh
```

## Nowe wersje Minecrafta

cubiomes nie jest aktualizowane od 1.21.4, więc nowsze wersje są dodane w tym repozytorium:

| Wersja | Zmiany w generowaniu świata |
|---|---|
| 1.21.5 | Pale Garden zajmuje część dawnych obszarów Dark Forest; rezydencje także w Pale Garden |
| 1.21.9 | twierdze mogą być przyciągane do Cherry Grove |
| 26.2 | nowy biom jaskiniowy Sulfur Caves |
| 26.3 | nowy biom Dappled Forest (zamiast części Plains), opuszczone obozy |

Tabele biomów (`cubiomes/tables/btree215.h`, `btree262.h`, `btree263.h`) są generowane
z oficjalnych danych gry:

1. Workflow **„Dump biome parameters”** uruchamia generator danych Minecrafta
   (`server.jar --reports`) dla podanych wersji i zapisuje wyniki w `tools/biome-params/`.
2. `tools/gen_btree.py` buduje z nich drzewo wyszukiwania dokładnie tak jak gra
   (`Climate.RTree`). Dla 1.21.4 daje tablicę identyczną bajt w bajt z oryginalną
   tablicą cubiomes.

Aby dodać kolejną wersję: uruchom workflow z nową wersją, wygeneruj tablicę
(`python3 tools/gen_btree.py tools/biome-params/X-overworld.json.gz NAZWA`), dodaj wersję
w `cubiomes/biomes.h`, `biomenoise.c`, `util.c` oraz ewentualne nowe biomy/struktury.

Opuszczone obozy to struktury jigsaw — tak jak w cubiomes dla innych struktur tego typu,
biom sprawdzany jest w przybliżeniu (na powierzchni chunka startowego).

## Uwagi

- Działa dla **Java Edition**. Bedrock ma inną generację struktur.
- Pozycje struktur są sprawdzane pod kątem biomu (i terenu tam, gdzie cubiomes to
  wspiera), ale w rzadkich przypadkach struktura może się nie wygenerować w grze.
- Projekt niezależny, niezwiązany z Mojang Studios ani Microsoft.

## Licencje

- cubiomes — MIT, © Cubitect (`cubiomes/LICENSE`).
