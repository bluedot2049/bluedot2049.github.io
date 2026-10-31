# Architecture Proposal: Avatar Persistence & Ultra-Compact Codec

> **Target Audience**: AI Agents & Technical Collaborators  
> **Status**: Design Discussion / Draft (Do NOT apply changes to runtime code without explicit user instruction)  
> **Related Files**: [`js/looks.js`](file:///g:/煉金畫廊/js/looks.js), [`js/main.js`](file:///g:/煉金畫廊/js/main.js), [`js/creator.js`](file:///g:/煉金畫廊/js/creator.js)

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
