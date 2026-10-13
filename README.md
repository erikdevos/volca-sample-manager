# Volca Sample Manager

A browser app to manage your sample collection and the 100 slots of a **KORG volca sample** (v1).

**Live:** https://erikdevos.github.io/volca-sample-manager/

- **Collection:** import a folder (or drag files in) once. Samples are sorted into categories (kick, snare, clap, hihat, ...) based on their names, and stay in your browser between sessions.
- **Sets:** build sets for the 100 slots in a large 10×10 grid, with meters for slots and memory (~65 s). Samples keep their slot when you add or remove others.
- **Send only what changed:** the app remembers what's on your volca, shows it per slot, and transfers only the changed slots (erasing slots you emptied in the same transfer).
- **Clean up:** find duplicates by sound, trim silence, tidy names ("Snare Thunder" instead of `011-snare-Thunder Snare`) and fix wrong categories.
- **Maintenance:** erase the volca, restore the factory samples, and back up / restore everything as a zip.

Everything runs in your browser. Your samples are never uploaded anywhere.

## Credits

Built on [Volca Sampler](https://github.com/benwiley4000/volca-sampler) by Ben Wiley (MIT license). The transfer audio is made with KORG's [SYRO](https://github.com/korginc/volcasample) library (BSD license, see `public/korg-alldata/LICENSE-KORG.txt` and the FAQ in the app). _volca sample_ is a trademark of KORG Inc., who is not affiliated with this app.

## Developing locally

Requirements:

- [Node.js 16](https://nodejs.org/) (see `.nvmrc`)
- [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) (`emcc` on your path), only needed when changing the SYRO bindings in `syro/`

```console
git clone https://github.com/erikdevos/volca-sample-manager.git
cd volca-sample-manager
npm install
./build-bindings.sh            # compiles SYRO to WebAssembly (public/syro-*.js/wasm)
./build-factory-samples-index  # only if public/factory-samples changed
npm start                      # http://localhost:3000
```

### Tests

```console
npm run test:categories
npm run test:device
npm run test:slots
npm run test:names
```

`npm test` runs the upstream SYRO stream tests, which need Puppeteer.

### Build and deploy

```console
npm run build    # output in build/, including an offline zip
npm run deploy   # publishes build/ to the gh-pages branch
```

### Running offline

Download `Volca-Sample-Manager-Offline.zip` from the app (FAQ / Licenses → Run this app offline), extract it and run `python3 serve-offline.py` in that folder. The app opens at http://localhost:54411.

Your own sample files (`samples/`) are not part of this repository.
