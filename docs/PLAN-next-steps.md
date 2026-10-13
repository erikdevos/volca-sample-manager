# Plan: Volca-stand bijhouden + namen opschonen

## Context
De app werkt end-to-end; een echte transfer naar Eriks Volca Sample v1 is gelukt (commit `dd92afd`, plan-doc `docs/PLAN-next-steps.md` in `54c356e`). Twee wensen van Erik:
1. Een volle set sturen duurt ~13 min. De app moet **onthouden wat er op de Volca staat**, per slot laten zien of het al op de Volca staat, en bij transfer laten **kiezen**: alleen wijzigingen (standaard) of alles. Slots die op de Volca staan maar niet meer in de set, worden in dezelfde stream gewist.
2. **Namen opschonen**: nummer en pack-codes weg, typo's corrigeren, volgnummers bij dubbele namen. Naamstijl: **categorie eerst** ("Snare Thunder"). Plus de verkeerd ingedeelde conga (`057-kick`) corrigeren.

Werkwijze: Node 16 (`export PATH=~/.nvm/versions/node/v16.20.2/bin:$PATH`), dev-server "dev" via `.claude/launch.json`, WASM via `./build-bindings.sh`, Prettier 2.8.8 voor opmaak. Committen pas na akkoord van Erik.

---

## Stap 1: Volca-stand bijhouden, alleen wijzigingen sturen

**1. Device-snapshot** — nieuw `src/deviceStore.js` (localforage `volca_device`, één record):
`{ known: boolean, slots: (null | { sampleId, contentKey, name })[100], updatedAt }`. Start: `known: false`.
- `getContentKey(sample)` in `src/sampleCacheStore.js`, naast `hasAudioRelevantChanges` (zelfde velden: `sourceFileId`, `trim.frames`, `normalize`, `pitchAdjustment`, `qualityBitDepth`, `plugins`; niet `useCompression`).
- Hook `useDeviceState()` (nieuw `src/useDeviceState.js`) met `recordTransfer(samplesWithSlots)`, `recordErase(slots)`, `recordEraseAll()`, `recordFactory(factorySamples)`, `markUnknown()`.

**2. Snapshot bijwerken na geslaagde acties** ("geslaagd" = transfergeluid helemaal afgespeeld, `transferProgress >= 1` in `useSyroTransfer`, `src/utils/syro.js`):
- Set-transfer: callback `onTransferComplete(items)` toevoegen aan `src/VolcaTransferControl.js`, aangeroepen vanuit `src/manager/TopBar.js`.
- `src/manager/AllDataTransferModal.js`: eraseAll → `recordEraseAll`, restoreFactory → `recordFactory` (factory-ids op slot 0–99).
- `src/VolcaEraseSlotsModals.js`: callback na afloop → `recordErase(slots)`.
- Na elke transfer in het afrondscherm: link "Volca showed an error? Mark state as unknown".

**3. Diff** — nieuw `src/utils/deviceDiff.js` (puur): per slot `unchanged | changed | new | erase` (op Volca, leeg in set) en totaal-overzicht; bij `known: false` alles "changed" en geen "erase". Unit-test `test/deviceDiff.test.js` (zelfde opzet als `test/categories.test.js`, `npm run test:...` script toevoegen).

**4. Gemengde stream (samples + wissen)** in `buildSyroBuffer` (`src/utils/syro.js`): `getSyroSetBuffer(samples, eraseSlots)` vult samples via `createSyroDataFromWavData` en wissen via `createEmptySyroData` (bestaat al in `syro/syro-bindings.c`; worker kopieert `pData` met `Size 0` veilig).
- **Eerst verifiëren**: KORG-voorbeeld native compileren (`cc … syro/volcasample/example/korg_syro_volcasample_example.c syro/volcasample/syro/*.c` in scratchpad), stream maken met 2 samples + 2 erases (args `s2c:file.wav`, `e5:` …), byte-vergelijken met de browseruitvoer (tijdelijke `public/_ref`, daarna verwijderen). Ook de 4 bestaande `test/snapshots` opnieuw checken. Als erase via `createEmptySyroData` afwijkt: in C een `createEraseSyroData` met `DataType_Sample_Erase` toevoegen.

**5. Keuze bij transfer** (`TopBar.js` / bevestigingsstap van `VolcaTransferControl`): twee opties met tijdsinschatting: "Only changes (N slots + M to erase, ~X)" (standaard als `known`) en "Everything (~Y)". Bij `known: false` alleen "Everything", met uitleg. Knop in de bovenbalk toont "Transfer changes (N)" of "In sync".

**6. Zichtbaar in het raster** (`src/manager/SlotGrid.js` + `.module.scss`):
- Per gevulde slot een statusmarkering: **on volca** (klein vinkje/groen puntje), **changed/new** (blauw puntje "will be sent").
- Lege slot waar nog iets op de Volca staat: gestreepte achtergrond + naam van wat er staat, "will be erased".
- Samenvatting naast de meters: "Volca: in sync" / "12 to send, 3 to erase" / "Volca state unknown". In het Volca-menu: "Mark volca state as unknown".

## Stap 2: Namen opschonen en categorieën corrigeren

**1. Opschoner** — nieuw `src/utils/names.js` (puur), hergebruikt `getFileNameWords`, `getDisplayName`, `CATEGORIES`, `getCategoryLabel` uit `src/utils/categories.js`:
- Nummer vooraan weg; pack-codes weg: tokens met letters+cijfers (`BD1050`, `OH25`, `Clp01`, `CY0000`, `SD7575`, `Dist_Bd1`) en vastgeplakte restanten (`snareldk28` → `snare`).
- Typo's: `hithat` → `hihat` (lijst uitbreidbaar).
- Stijl **categorie eerst**: categorienaam + overige betekenisvolle woorden in Title Case: `011-snare-Thunder Snare` → "Snare Thunder", `011-snare-707 Slammed` → "Snare 707 Slammed", `037-hihat-open` → "Hihat Open".
- Dubbele namen binnen een categorie nummeren met twee cijfers in sorteervolgorde: "Kick 01" … "Kick 15" (aanname: `01`-stijl sorteert netjes; makkelijk aan te passen).
- Unit-test op alle namen in `samples/`: geen lege namen, geen dubbelen, geen pack-codes over, verwachte voorbeelden kloppen.

**2. "Tidy names"-scherm** — nieuw `src/manager/TidyNamesModal.js` (opzet als `TrimSilenceModal.js`): bron = hele collectie of selectie (knoppen in `src/manager/LibraryPanel.js`), opties als schakelaars, preview "old → new" met vinkje per rij, toepassen via `onSampleUpdate(id, { name })` (geen audio-herberekening dankzij `hasAudioRelevantChanges`).
- `originalName` in metadata (`src/store.js`: param + typedef; gezet bij import in `src/utils/libraryImport.js`; voor bestaande samples bij eerste hernoeming) en als tooltip tonen in lijst en raster.

**3. Categorie-correcties** in hetzelfde scherm, sectie "Category suggestions" vóór het hernoemen:
- Samples die (bijna) identiek zijn aan een factory-sample met een andere categorie (via `findDuplicates` uit `src/utils/duplicates.js`, drempel `DUPLICATE_THRESHOLD`) → stel de factory-categorie voor. Zo wordt `057-kick` → Percussion (conga) voorgesteld en daarna netjes "Perc Conga…/Percussion 0x" genoemd.
- Toepassen via `onSampleUpdate(id, { category })`; hernoemen gebruikt daarna de nieuwe categorie.

**4. Snel hernoemen**: F2 / potlood in `LibraryPanel` rij → inline invoerveld (Enter opslaan, Esc annuleren).

## Verificatie
- `npm run test:categories` + nieuwe tests (`deviceDiff`, `names`) groen.
- Byte-identiek: gemengde stream vs. KORG-native; 4 bestaande snapshots; alldata ongewijzigd.
- Browser (ingebouwde pane, rAF-polyfill voor verborgen pane): set sturen → raster toont alles "on volca", "In sync"; sample wisselen → "Only changes (1)"; set inkorten → oude slots "will be erased"; Erase all / Restore factory / Erase slots werken de stand bij; herladen behoudt de stand.
- Tidy names: preview klopt voor de 128 samples, conga-suggestie verschijnt, toepassen + herladen behoudt namen, herimport herkent samples nog (hash), sets en duplicaten werken nog.
- Erik test op het apparaat: kleine wijziging sturen en controleren dat alleen die slots veranderen.
- Na elke stap: screenshot naar Erik, commit na akkoord.
