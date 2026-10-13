# Plan: volgende twee stappen

Status bij het schrijven (13-10-2026): de app werkt end-to-end en een echte transfer naar de Volca Sample v1 is gelukt (commit `dd92afd`). Dev-server: Node 16 (`.nvmrc`), `npm start` via `.claude/launch.json` ("dev"); WASM bouwen met `./build-bindings.sh` (emcc 6.x, zie de fixes in dat script en in `syro/`).

---

## Stap 1: weten wat er op de Volca staat, alleen wijzigingen sturen

**Waarom.** Een volle set sturen duurt ca. 12–13 minuten. Na kleine wijzigingen (een paar samples gewisseld) wil je alleen die slots sturen. En slots die nog op de Volca staan maar niet meer in je set zitten, kosten geheugen: die moeten gewist worden.

**Aanpak**

1. **Device-snapshot bijhouden** (nieuw: `src/deviceStore.js`, localforage `volca_device`).
   - Per slot 0–99: `{ sampleId, contentKey, name }` of `null` (leeg), plus `updatedAt` en `known: boolean`.
   - `contentKey` = alles wat het verstuurde geluid bepaalt: `sourceFileId`, `trim.frames`, `normalize`, `pitchAdjustment`, `qualityBitDepth`, `JSON.stringify(plugins)`. (Niet `useCompression`: die verandert het resultaat op het apparaat niet.) Helper `getContentKey(sample)` naast `hasAudioRelevantChanges` in `src/sampleCacheStore.js`.
   - Start: `known: false` ("onbekend", want we weten niet wat er nu op staat).
2. **Snapshot bijwerken na elke geslaagde actie.** "Geslaagd" = het transfergeluid is helemaal afgespeeld (`transferProgress >= 1` in `useSyroTransfer`). De Volca stuurt niets terug, dus dit is een aanname: na afloop tonen we "Showed the volca an error? → Mark slots as unknown".
   - Set-transfer (`src/manager/TopBar.js` via `VolcaTransferControl`): verstuurde slots krijgen de nieuwe inhoud. Een callback `onTransferComplete(samples)` toevoegen aan `VolcaTransferControl.js`.
   - "Erase all" (`AllDataTransferModal`): alles leeg, `known: true`.
   - "Restore factory": slots = factory-ids met hun `contentKey`, `known: true`.
   - "Erase specific slots" (`VolcaEraseSlotsModals.js`): die slots leeg. Callback toevoegen.
3. **Verschil berekenen** (`src/utils/deviceDiff.js`, puur, met unit-test): voor set vs. snapshot per slot `unchanged | changed | new | toErase` (slot staat op de Volca maar is leeg in de set). Bij `known: false` is alles "changed".
4. **Transfer-keuze** in de bevestigingsstap van de set-transfer:
   - Standaard "Only changes (N slots, ~X min)", alternatief "Everything (~Y min)".
   - Slots in `toErase` worden in **dezelfde stream** meegestuurd als erase-opdracht. Hiervoor `buildSyroBuffer` in `src/utils/syro.js` laten mixen: samples via `createSyroDataFromWavData`, wissen via `createEmptySyroData`.
   - **Verifiëren** vóór gebruik: een gemengde stream (bijv. 2 samples + 2 erases) byte-vergelijken met KORG's eigen voorbeeldprogramma (native gecompileerd uit `syro/volcasample/example/`, args zoals `s10c:file.wav` en `e5:`), net zoals bij de alldata-check. Pas daarna inschakelen.
5. **Zichtbaar maken in het raster** (`src/manager/SlotGrid.js`):
   - Klein statuspuntje per slot: "on volca" (grijs), "changed/new" (blauw), "will be erased" (lege slot met streep).
   - Bovenbalk/meter: tekst "Volca: in sync" / "12 slots to update" / "Volca state unknown". Knop "Mark volca as unknown" in het Volca-menu.

**Verificatie**
- Unit-test voor `deviceDiff` (nieuw / gewijzigd / ongewijzigd / te wissen / onbekend).
- Byte-vergelijking gemengde stream tegen KORG-native (zie 4).
- Bestaande snapshots blijven identiek (`test/snapshots`, zie de check in de browser zoals eerder gedaan).
- In de browser: set sturen (afspelen laten "slagen" via rAF-polyfill), sample wisselen, dan moet "Only changes" precies 1 slot tonen; set inkorten, dan moeten de oude slots als "to erase" verschijnen.
- Erik test op het apparaat: kleine wijziging sturen en controleren dat alleen die slots veranderen.

---

## Stap 2: namen opschonen en categorieën corrigeren

**Waarom.** Veel samples heten na het weglaten van het nummer gewoon "kick" of "snare"; de restanten uit de oorspronkelijke packs (`BD1050`, `OH25`, `ldk28`, `Clp01`, `CY0000`, `SD7575`) zijn niet relevant. Sommige categorieën kloppen niet (`057-kick` is eigenlijk de factory-conga).

**Aanpak**

1. **Naam-opschoner** (`src/utils/names.js`, puur, met unit-test op alle namen in `samples/`):
   - Nummer vooraan weg (bestaat al: `getDisplayName` in `src/utils/categories.js`).
   - Optioneel bron-codes weg: losse tokens van letters+cijfers zoals `BD1050`, `OH25`, `Clp01`, `CY0000`; vastgeplakt zoals `snareldk28` → `snare`. Woorden die iets zeggen (`Thunder Snare`, `707 Slammed`, `Deep`) blijven.
   - Typo's corrigeren (`hithat` → `hihat`), dubbele categorie-woorden samenvoegen.
   - Uniek maken binnen een categorie: dubbele namen nummeren (`Kick 01` … `Kick 15`), in de huidige sorteervolgorde.
   - Hoofdletters: optioneel "Title Case".
2. **"Tidy names"-scherm** (`src/manager/TidyNamesModal.js`), zelfde opzet als `TrimSilenceModal`:
   - Bron: hele collectie of de selectie (knop in de selectiebalk van `LibraryPanel` en in de collectie-header).
   - Opties als schakelaars (bovenstaande punten), live preview-tabel "oud → nieuw", vinkje per rij, "Rename N samples".
   - Toepassen via `onSampleUpdate(id, { name })`. Hernoemen raakt de audio niet (geen herberekening, dankzij `hasAudioRelevantChanges`).
   - De oorspronkelijke bestandsnaam bewaren in metadata (`originalName`, gezet bij import in `src/utils/libraryImport.js`; voor bestaande samples bij eerste hernoeming vullen) en tonen als tooltip, zodat je altijd het bronbestand terugvindt.
3. **Snel hernoemen en categorie wijzigen in de lijst** (`LibraryPanel` / `SlotGrid`):
   - F2 of een potlood-actie op een rij → inline naamveld.
   - Categorie-keuze in het bewerkpaneel bestaat al; in de duplicatenlijst ook. Extra: in de collectie een filter "Check category" voor samples waarvan de opgeslagen categorie afwijkt van wat de naam (na hernoemen) suggereert, of die als factory-duplicaat een andere categorie hebben (zoals `057-kick`).
4. **Categorie volgt naam?** Bij hernoemen de categorie niet automatisch veranderen; wel een hint tonen als de nieuwe naam op een andere categorie wijst.

**Verificatie**
- Unit-test `names.js` op alle 128 bestandsnamen: geen lege namen, geen dubbele namen binnen een categorie, bron-codes weg, betekenisvolle woorden behouden. Een paar verwachte uitkomsten vastleggen (bijv. `011-snare-Thunder Snare` → `Thunder Snare` of `Snare Thunder`, nog kiezen).
- In de browser: preview controleren, toepassen, herladen (namen blijven), en checken dat herimport van de map de samples nog herkent (hash op bestand, dus naamonafhankelijk).
- Duplicaat-detectie, sets en transfer werken nog (namen spelen daar geen rol, behalve in de weergave).

**Open vraag voor Erik (bij de start van stap 2):** naamstijl: `Thunder Snare` (beschrijving eerst) of `Snare Thunder` (categorie eerst)? En nummeren als `Kick 01` of `Kick 1`?

---

Volgorde: stap 1 eerst (meeste tijdwinst bij transfers), dan stap 2. Na elke stap: tests, browsercheck, commit (na akkoord van Erik).
