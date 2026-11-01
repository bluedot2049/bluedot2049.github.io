# Architecture Proposal: Avatar Persistence & Ultra-Compact Codec

> **Target Audience**: AI Agents & Technical Collaborators  
> **Status**: Design agreed with user 2026-11-01 (see §6). Not implemented yet — do not change runtime code without explicit user instruction.  
> **Related Files**: [`js/looks.js`](file:///g:/煉金畫廊/js/looks.js), [`js/main.js`](file:///g:/煉金畫廊/js/main.js), [`js/creator.js`](file:///g:/煉金畫廊/js/creator.js), [`js/vendors.js`](file:///g:/煉金畫廊/js/vendors.js), [`js/photo.js`](file:///g:/煉金畫廊/js/photo.js)

---

## 1. Context & Problem Formulation

### 1.1 Problem Statement
Users report losing their character customizations (race, clothes, face painting, body sliders) after site updates (`更新網站.bat`) or across certain browser sessions/reloads.

### 1.2 Root Cause Analysis
1. **Volatile Client-Side Storage**:
   Customization is currently stored strictly in `localStorage.getItem('look')`.
   - Cleared on cache clear ("Clear Site Data" / Ctrl+F5) or incognito sessions.
   - Isolated in in-app WebViews (LINE, Instagram, Facebook, Discord).
   - Origin-bound (`http://localhost:8000` vs `http://127.0.0.1:8000` vs `https://bluedot2049.github.io`).
2. **Missing Schema Migration Write-Back**:
   In `main.js:loadLook()`, legacy formats (`outfit` or pre-layering `clothes`/`robe`) are parsed via `sanitizeLook(oldData)`, but the modernized structure is **not written back** to `localStorage`. Subsequent loads repeatedly trigger fallback logic (`fromClothes()`), potentially reverting layered clothing choices to defaults.
3. **No External Portability / Backup**:
   Zero support for URL hash sharing, export codes, or cloud sync.

---

## 2. Character Customization Data Model

### 2.1 State Space Breakdown (Current Version)
| Category | Fields | Cardinality / Value Range | Entropy (Bits) |
| :--- | :--- | :--- | :--- |
| **Race** | `race` | 26 options | $\approx 4.70$ bits |
| **Categorical Options (18)** | `eyes, brows, nose, mouth, mark, glasses, hair, hat, top, topPat, bottom, botPat, outer, shoes, one, neck, back, hand` | Hand: 20 max; others: 4–13 | $\approx 52.95$ bits |
| **Colors (15)** | `skin (16), hairC (8), hatC (8)`, + 12 clothing colors (`topC, topC2, botC, botC2, outC, outC2, oneC, oneC2, shoeC, neckC, backC, handC`) (24 each) | 8 to 24 colors | $\approx 65.02$ bits |
| **Sliders (7)** | `head, tall, fat, eyeSize, eyeGap, eyeOdd, faceY` | 0..10 (11 states each) | $7 \times \log_2(11) \approx 24.22$ bits |
| **Flags (1)** | `keep` | 0 or 1 (2 states) | 1 bit |
| **Theoretical Shannon Entropy** | — | — | **$\approx 147.89$ bits** |

*Note*: 147.89 bits $\div$ 6 bits/char (Base64) $\approx$ **24.65 characters**. The entire body + clothing state can mathematically fit into **25 Base64 characters**.

### 2.2 Face Canvas (`L.face`)
- Canvas: $64 \times 64 = 4096$ cells.
- Palette: 9 states (0 = transparent, 1..8 = colors from `FACE_INK`).
- Current Format: Run-Length Encoded ASCII (e.g. `a1200b2a30...`, max length 12000 chars, typically 60–250 chars).

---

## 3. Evaluated Encoding Formats & Trade-offs

### 3.1 Body Encoding Comparison

```
+----------------------------------------------------------------------------------------------------+
| Method                     | Length     | Robustness | Extensibility | Implementation Complexity   |
+----------------------------------------------------------------------------------------------------+
| A. Mixed-Radix BigInt      | 25-26 chars| Low        | Strict Version| Low (native BigInt)         |
| B. Reserved Bit-Packing    | 28-32 chars| Very High  | High (Cap 32) | Low (Bit shifts / Base64)   |
| C. 1-to-1 Base64 Position  | 42 chars   | High       | Append-only   | Trivial (1 char per item)   |
+----------------------------------------------------------------------------------------------------+
```

#### Detailed Trade-offs:
- **Method A (Mixed-Radix BigInt, ~25-26 chars)**:
  - *Formula*: $X = \sum_{i=0}^{N-1} \left( v_i \prod_{j=0}^{i-1} R_j \right)$
  - *Risk*: **Avalanche effect**. If any option list cardinality ($R_j$) or ordering changes between client versions, the entire integer decodes into garbage. Requires rigid semantic version prefix (`A`, `B`).
- **Method B (Reserved Ceiling Bit-Packing, ~28-32 chars) [RECOMMENDED]**:
  - *Spec*: Allocate fixed bit slices: Race (5b), 18 Options (5b each, capacity 32), 15 Colors (5b each, capacity 32), 7 Sliders (4b each, 0..15), 1 Flag (1b).
  - *Total*: $5 + (18 \times 5) + (15 \times 5) + (7 \times 4) + 1 = 199$ bits $\to$ **33 Base64 chars**.
  - *Advantage*: High fault tolerance. New hats/clothes can be appended without breaking bit alignment for other items.
- **Method C (1-to-1 Positional Stream, 42 chars)**:
  - Map each field directly to one Base64 digit `0..63`.
  - Zero bitwise operations; easiest to inspect and debug.

---

### 3.2 Face Drawing Compression Options

1. **Option F1: Base64 Compact RLE (~40-60 chars) [RECOMMENDED]**:
   - Keep raster grid.
   - Replace decimal run lengths in `encodeFace` (`a1200`) with Base64 variable-length integers (1-2 chars for runs up to 4096).
   - *Pros*: Preserves existing painting engine, supports eraser, multiple layers, undo, non-symmetric doodles.
2. **Option F2: Bounding Box Crop + Symmetry Folding (~20-35 chars)**:
   - Crop to active rectangular bounding box $(x_1, y_1, w, h)$.
   - If `sym == true`, store only $x \in [0..31]$ and mirror on decode.
   - *Pros*: Extreme compression for standard faces.
   - *Cons*: Degrades if user draws at canvas corners or disables symmetry.
3. **Option F3: Vector Stroke Encoding (~10-20 chars) [NOT RECOMMENDED]**:
   - Record `[x, y, color, brushSize]` path strokes instead of raster grid.
   - *Fatal Flaw*: Extremely vulnerable to eraser usage and repetitive stroke sketching (data size explodes on heavy scratchwork). Requires architectural rewrite of [`creator.js`](file:///g:/煉金畫廊/js/creator.js).

---

## 4. Proposed Solution Architecture: Dual-Layer Persistence

```
+-----------------------------------------------------------------------+
|  User Visits / Reloads                                                |
|                                                                       |
|  1. Inspect URL Hash (#look=<Code>)                                    |
|     |-- Found -> Parse Code -> Set Look -> Write to localStorage      |
|                                                                       |
|  2. If Hash empty -> Inspect localStorage.getItem('look')             |
|     |-- Found -> Migrate & Write Back -> Set Look                     |
|                                                                       |
|  3. Fallback -> randomPreset() -> Write to localStorage               |
+-----------------------------------------------------------------------+
```

### 4.1 URL / Share Code Structure
`#look=<VersionByte><BodyCode>[.<FaceCode>]`

- **VersionByte**: `A` (1 char)
- **BodyCode**: 25–33 Base64 chars (Method A or Method B)
- **Separator**: `.` (if face exists)
- **FaceCode**: Base64 Compact RLE (0 chars if default face; 40–60 chars if painted)
- **Total Combined String**:
  - Without custom face: **~26–34 characters**
  - With custom face: **~60–90 characters**

### 4.2 Seamless UI Integration Points
1. **Automatic Hash Sync**:
   On mirror customization commit (`Creator:onChange`), silently update `history.replaceState(null, '', '#look=' + code)` without page reload.
2. **Drawer UI Widget**:
   Add small buttons inside [`creator.js`](file:///g:/煉金畫廊/js/creator.js) drawer:
   - `[ 📋 複製造型碼 ]`: Copies code / share URL to clipboard.
   - `[ 📥 貼上造型碼 ]`: Prompt / modal input to paste and instantly dress up.
3. **Storage Self-Healing (Migration)**:
   In `main.js:loadLook()`, execute immediate `saveLook(sanitized)` to purge obsolete keys (`clothes`, `robe`) and ensure future updates do not overwrite customized states.

---

## 5. Execution Checklist for Future Agents

When the user asks to implement this specification:
- [ ] Implement `exportLookCode(look)` and `importLookCode(code)` in `looks.js`.
- [ ] Add compact RLE support in `looks.js` for `face`.
- [ ] Update `main.js:loadLook()` to:
  1. Check `location.hash` for `#look=` parameter.
  2. Perform write-back of migrated structures into `localStorage`.
- [ ] Update `creator.js` to expose Copy/Paste code buttons and sync `location.hash`.
- [ ] Write unit tests to verify:
  - Bijection: `importLookCode(exportLookCode(L)) == L`
  - Backward compatibility: Fallback defaults on truncated strings.
  - Safe failure: Malformed strings safely fall back to `presetLook(0)`.

---

## 6. Decisions (2026-11-01)

These supersede §4 where they conflict. The scope grew from "avatar look" to "the whole player save", because Haishi gifts are about to get harder to obtain (barter + time conditions, see §6.1), which makes losing `localStorage` much more costly.

### 6.1 Gift acquisition (context for the save format)
- **No in-game currency. No server-side limited stock** (no accounts exist; anonymous Supabase identity lives in `localStorage` and is lost the same way).
- Vendor gifts get three tiers:
  1. Free on first talk (as today) — some items stay here so new players get something immediately.
  2. **Barter**: talk to vendor B while holding vendor A's item in the `hand` slot. Check `look.hand` inside `Vendor.talkTo()`.
  3. **Conditions**: Taiwan-time windows (reuse the reversed crowd schedule, e.g. only in the quiet hours 19–22), "come back on another day" (needs per-vendor last-visit date), or two online players at the stall together (presence already exists in `multiplayer.js`).
- Rare global daily limits (a single Supabase counter) are allowed later as decoration only, not as the main system.

### 6.2 One-time reset
- Ships **in the same release** as the new gift rules. Resetting earlier is pointless: players would re-collect everything under the old free rules.
- **Wipe everything the player owns, no partial stripping** (user decision): delete `look`, `outfit`, `closet`, `unlocked`. Everyone starts over with a fresh random look, like a first visit.
- Keep per-device preferences (`muted`, `director`, `joySwap`, quality, and the `photo` settings — its `look` is a camera grading index, not a possession) — they are not possessions.
- Driven by the save version number (§6.3): no `save` key, or an old version → wipe once, then write the new `save`.
- No announcement and no mirror hint line.

### 6.3 Save structure (phase 1 — required, same release)
- Merge into one `localStorage` key `save`: `{ v, look, closet, unlocked, visits }` (no `trade` field: barter is checked against the worn `look.hand` at talk time)
  - `visits`: per-vendor last talk date (Taiwan date string)
- First release: old keys are wiped (§6.2), not migrated. From then on, any `save` format change is migrated on load and **written back immediately** (fixes §1.2 item 2).
- Call `navigator.storage.persist()` once (best effort; reduces eviction, Safari's 7-day script-storage purge is a key reason backups are needed).
- Keep per-device conveniences (`muted`, `director`, `joySwap`, quality) out of `save`.

### 6.4 Save code (phase 2)
- Full save → compact string, with a version byte and a short checksum. The checksum only catches typos; **no anti-cheat** (single-player collection, forging only affects the forger).
- Two URL forms with different meaning — never mix them:
  - `#look=<code>` — **try-on only**: applies the outfit; parts the receiver hasn't unlocked fall back to defaults; never touches `unlocked` / `trade` / `visits`. Safe to auto-sync into the URL (§4.2).
  - `#save=<code>` — **full restore** of the player's own save. Never auto-synced into the address bar. Ask before overwriting an existing save that has more unlocks.
- Mirror drawer: copy / paste for the full save code (includes closet).
- Cloud login (phase 3) is deferred until an account is needed for other reasons (e.g. a real merch shop).

### 6.5 Postcard as save carrier
Messaging apps (LINE, IG, Messenger) recompress images and strip metadata; postcards are already JPEG 0.92 (`photo.js` `card.toBlob`). So the save must be **visible on the image**:

| Method | Original file | After LINE | After screenshot |
| :--- | :--- | :--- | :--- |
| JPEG metadata (COM segment) | yes | stripped | lost |
| Pixel steganography | yes | broken | mostly broken |
| **Printed QR / seal** | yes | yes | yes |

- Stamp a vermilion seal in a corner of the postcard; it is a QR code with dot / brush-styled modules (keep enough contrast). Draw it with the house style ([`js/glyphs.js`](file:///g:/煉金畫廊/js/glyphs.js) for any surrounding marks).
- The QR content is a full URL (`https://…/#look=…` or `#save=…`), so a phone camera scan opens the site directly.
- In-site "從明信片讀取": pick an image from the album → decode. Try the JPEG COM segment first (exact, also written), fall back to QR.
- Decoder: jsQR in `vendor/` (~45 KB min), loaded lazily only when the user opens the reader. `BarcodeDetector` is not available on iOS Safari, so it cannot be the only path.
- Capacity: the postcard carries only **current look + face + unlocked + trade/visits** (~50 chars, ~110 with a painted face). The closet goes through the menu save code only — a full closet would make the seal too large.
- Two postcard modes:
  - **寄給朋友** → seal contains `#look=` (try-on only; the friend still has to earn items in Haishi themselves).
  - **寄給自己** → seal contains `#save=` (backup).

### 6.6 Execution checklist (replaces §5 when implementing)
- [x] (done 2026-11-01: `getSave`/`putSave` in looks.js, `GIFTS` gates `need`/`night`/`again` + `Vendor.gate`) Phase 1 (with the new gift rules): `save` object + version, one-time wipe of old possession keys (look / outfit / closet / unlocked), migration + write-back for later versions, `storage.persist()`.
- [x] Vendor gift tiers (two-player condition not done): barter via `look.hand`, time / revisit / two-player conditions, data in `GIFTS`.
- [x] (done 2026-11-01, `js/savecode.js`: 1 char per field in looks.js list order, `A…` look / `S…` save, 2-char checksum, `~` separates save parts so it is fragment-safe; face stays decimal RLE; hash handled in `main.js loadLook`; copy/paste on the mirror's 衣櫃 page) Phase 2: save codec (§3 recommendations still apply: bit-packing body + Base64 RLE face), checksum, `#look=` / `#save=` handling, copy/paste UI.
- [x] (done 2026-11-01) Postcard, as built — differs from §6.5 in these ways:
  - Both QR codes are **postage stamps** (perforated, colored frame, glyph band): 茜紅「海市」+ lantern = `#look=` (寄給朋友); 藍染「行囊」+ moon = `#save=` with closet (寄給自己, 1.5× size). `qrStamp` in `js/postcard.js`; ECC L; modules are joined rounded ink blocks (gaps between dots broke scanning after downscale).
  - **Drawn faces never go into a QR.** They go on **film-edge strips** around the photo (`js/filmcode.js`): light/dark cells on a dark film base with sprocket holes, colour gradient is decoration only, Reed-Solomon (40%), deflate-raw. 寄給朋友: bottom strip only (current face, omitted if no face). 寄給自己: four strips — bottom = current look, top/left/right = closet 1/2/3 (empty strip when no face). Face too big → strip printed empty, tip tells the player to use 複製碼.
  - Reader `readPostcard(file)` locates strips from the card's proportions (`guessFilm`), so cropped images / screenshots lose the faces (QR still works). Mirror 衣櫃 page has 從明信片讀取.
  - Measured with jsQR on synthetic cards: everything passes at original size and at 1280 px long edge (LINE); portrait 寄給自己 faces fail at ≤960 px.
- [ ] Postcard seal (original plan, superseded by the line above): QR rendering in seal style, 寄給朋友 / 寄給自己 modes, COM segment, lazy jsQR reader.
- [ ] Tests: codec round-trip, truncated / malformed codes fall back safely, `#look=` never changes unlocks, reset runs exactly once, QR survives JPEG recompression at quality ~0.7 and a downscale to 50%.

## 7. Mirror selfie save (decided 2026-11-01, not built yet)

Supersedes the mirror-drawer parts of §6.4 and §6.5. **Haishi is untouched**: postcards, the 茜紅 friend stamp and the 藍染 行囊 stamp keep working exactly as now.

### 7.1 Decisions
- The mirror's 衣櫃 page keeps **image-only** save/load. Remove 複製存檔碼 / 複製連結 / 貼上存檔碼 from the UI.
- Old carriers stay readable forever: Haishi postcards (both stamp kinds, film edges) and `#save=` / `#look=` links.
- Taking a selfie at the mirror **is** saving. One choice before the shutter: **with the full code** (save + closet + drawn faces) or **a plain photo** (no code). No friend/try-on variant at the mirror.
- The code only has to be read by this game's own reader, never by a phone camera. It does not have to be a standard QR: free to be deformed, abstract, on-theme.
- The reflection is **mirrored left-right**, like a real mirror.

### 7.2 The eye
- A floating dark eye takes the picture and is in the picture: the mirror is fake (the mirror camera looks from the glass back at the player, `player.mirrorCamera`), so the eye floats by the player's shoulder with its pupil facing the glass. In the photo it stares straight at the viewer, like a phone in a real mirror selfie.
- Flow: 衣櫃 page → 請眼睛拍一張 → drawer closes → the glass ripples, the eye rises out of it and circles to the shoulder → the pupil contracts three times (countdown, no digits; emotes allowed meanwhile) → a blink is the shutter, the glass flashes → the eye sinks back → preview: 收進相簿 / 重拍.
- Look: not pure black (see scene colour rules) — blue-violet charcoal ball, gold iris, lids, a wisp of smoke behind; idles with a slow bob, gaze follows the player.
- Saving the file: phone → `navigator.share({ files })` (iOS 儲存影像 into Photos), fallback download; desktop → download.
- Reading: 從照片讀取 (album picker); desktop also drag-and-drop onto the window and Ctrl+V paste.

### 7.3 Payload
- Full save text today: ~155 chars (look + 3 closet looks + all unlocks + visits). Drawn faces: deflate-raw, typically 100–400 bytes each, up to 4 (worn + closet).
- Plan: pack the save body as binary (not the text alphabet) + version + Reed-Solomon; faces in a second, separately-corrected region so a damaged face region never blocks the save itself (same split as stamp vs film edge).

### 7.4 Open: code visual (to choose from the design canvas)
Candidates, all readable only by our reader:
1. **Iris code** — the eye's iris drawn large on the frame: concentric rings cut into light/dark arcs; the pupil plus a gold ring is the finder (circles survive scaling).
2. **Frame runes** — the arched mirror frame's border carries brush-tick cells (the filmcode engine, restyled), diamond marks at the corners as finders.
3. **Constellation** — dots on a hidden hex grid inside a round field, three larger guide stars as finders.
Working recommendation: iris holds the save, frame runes hold the faces.

### 7.5 Checklist
- [ ] Remove copy/paste/link buttons from 行囊; keep 從照片讀取 (+ drag/drop, paste on desktop).
- [ ] Eye model + idle, rise/return animation, pupil countdown, blink shutter, flash.
- [ ] Selfie render from the mirror camera, flipped, eye placed at shoulder facing the glass; hide UI and passers-by.
- [ ] Photo layout: arched mirror frame, date plate (glyphs.js), code regions.
- [ ] Binary save packing + RS; encoder/decoder for the chosen code; reader tries the new code first, then the old postcard path.
- [ ] Tests: round-trip at original size, after JPEG 0.7, after 50 % downscale, after a phone screenshot crop.
