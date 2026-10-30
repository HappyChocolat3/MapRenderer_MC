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
  prób, twierdze, spawn, kopalnie, skarby, studnie, geody, fortece, bastiony,
  miasta Endu i bramy Endu,
- siatkę współrzędnych, podświetlanie wybranego biomu, kopiowanie `/tp` po kliknięciu
  w strukturę oraz link do aktualnego widoku (stan zapisuje się w adresie URL).

Obsługiwane wersje: od Beta 1.7 do 1.21.x (starsze niż 1.7 — eksperymentalnie).

## Jak to działa

Generowanie świata to [cubiomes](https://github.com/Cubitect/cubiomes) (biblioteka C,
licencja MIT, wierne odtworzenie generatora Minecrafta) skompilowane do
WebAssembly. Mapa jest dzielona na kafelki, które liczy kilka Web Workerów
równolegle; najpierw ładuje się szybki, zgrubny podgląd, potem pełna rozdzielczość.

```
cubiomes/        kod źródłowy cubiomes (commit w cubiomes/VERSION)
wasm/api.c       API C eksportowane do JavaScriptu
wasm/build.sh    budowanie web/cubiomes.wasm
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

## Uwagi

- Działa dla **Java Edition**. Bedrock ma inną generację struktur.
- Pozycje struktur są sprawdzane pod kątem biomu (i terenu tam, gdzie cubiomes to
  wspiera), ale w rzadkich przypadkach struktura może się nie wygenerować w grze.
- Projekt niezależny, niezwiązany z Mojang Studios ani Microsoft.

## Licencje

- cubiomes — MIT, © Cubitect (`cubiomes/LICENSE`).
