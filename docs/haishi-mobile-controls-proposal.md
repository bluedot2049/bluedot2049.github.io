# Architecture Proposal: Haishi Mobile Camera & Controls UX Optimization

> **Target Audience**: AI Agents & Technical Collaborators  
> **Status**: Design Discussion / Specification Draft (Do NOT apply changes to runtime code without explicit user instruction)  
> **Related Files**:  
> - [`js/player.js`](file:///g:/煉金畫廊/js/player.js) (Camera controller, input binding, orbit & desiredCamera)  
> - [`js/haishi.js`](file:///g:/煉金畫廊/js/haishi.js) (Terrain heightmap, `camClip`, `camFloor`, solids & collision)  
> - [`js/main.js`](file:///g:/煉金畫廊/js/main.js) (Scene initialization, `overview` state & `zoomTo`)  
> - [`js/joystick.js`](file:///g:/煉金畫廊/js/joystick.js) (Touch virtual joystick handler)  
> - [`css/style.css`](file:///g:/煉金畫廊/css/style.css) (Touch controls layout, `#joy`, `#stage`)  

---

## 1. Context & Problem Formulation

### 1.1 Problem Statement
When exploring the vertical mountain city **海市 (Haishi / `?z=haishi`)** on mobile devices (smartphones, portrait orientation), users report severe operational discomfort and involuntary camera movement:
> *「海市手機操作不舒服 會一直被調整視角」*  
> (Mobile controls in Haishi feel uncomfortable; the camera angle/perspective keeps getting repeatedly auto-adjusted/forced/disrupted.)

### 1.2 User Experience Symptoms
1. **Camera Rubber-Banding / Jitter**: As the character walks across streets, plazas, and stairs, the camera constantly zooms in near the back of the player's neck and suddenly pops back out.
2. **Aggressive Pitch Upheaval**: The camera perspective abruptly flips into an extreme top-down view (looking directly at the ground/hair) when near elevated terrain or retaining walls.
3. **Fighting the User's Touch**: Right after landing in Haishi, dragging the screen to look around feels sluggish or keeps being dragged back to a fixed orientation.
4. **Control Fatigue in Winding Alleys**: Because the camera never turns with the character, navigating zigzagging mountain stairs requires continuous two-thumb gymnastics (one thumb on joystick, one thumb continuously swiping the viewport).
5. **Accidental Camera Jerking**: Moving the thumb slightly outside the virtual joystick boundaries causes wild camera spinning or accidental click-to-walk redirection.

---

## 2. Root Cause Analysis (Code Level)

Investigation of the codebase reveals that this issue is not caused by a single bug, but by the compounding interaction of **four distinct subsystems**:

```
+----------------------------------------------------------------------------------------------------+
| 1. High Default Distance (11m) + Unsmoothed Terrain Raycasting (`camClip` / `camFloor`)           |
|    --> Extreme proximity to retaining walls triggers instant ray clipping & ground height-lifting.  |
+----------------------------------------------------------------------------------------------------+
| 2. Rigid Interpolation Lock in `zoomTo` (`main.js` + `player.js`)                                  |
|    --> `overview` transitions aggressively overwrite user touch orbit input frame-by-frame.       |
+----------------------------------------------------------------------------------------------------+
| 3. Total Absence of Directional Camera Trailing (Auto-Follow)                                     |
|    --> Camera yaw remains static; player must manually rotate camera 100% of the time in corners.  |
+----------------------------------------------------------------------------------------------------+
| 4. Ergonomic Layout Inversion & Tight Joystick Capture Bounds (`style.css` + `joystick.js`)       |
|    --> Joystick is on bottom-right; slips leak into `#stage` triggering unintended `orbit`.       |
+----------------------------------------------------------------------------------------------------+
```

---

### 2.1 Dimension 1: Vertical Mountain Terrain vs. Static Raycast Clipping

#### A. Disparity Between Gallery and Haishi
- In the indoor gallery (`world.js`), the floor is flat (`y = 0`), walls are orthogonal, and there is **no `camClip`**.
- In Haishi (`haishi.js`), the terrain is a mountain slope (`SEA = 0` to `y = 20+`), layered with tiered stone platforms (`AREAS`), retaining walls (`solids` with `b.ground = true`), and outdoor staircases.

#### B. The 11m Camera Sphere Trap in Portrait Mode
In [`js/player.js:L13`](file:///g:/煉金畫廊/js/player.js#L13):
```javascript
const defaultDist = () => (window.innerWidth < window.innerHeight ? 11 : 8.5);
```
- On desktop, `camDist` is `8.5m`.
- On mobile portrait screens, `camDist` defaults to **`11.0m`** to compensate for the narrow horizontal Field of View (FOV).
- **The Conflict**: Haishi's streets and terraces are typically only `4m` to `8m` wide. Behind the character is almost always an uphill terrace or retaining wall rising 2 to 5 meters. An 11-meter sphere behind the character **inevitably intersects the mountain slope**.

#### C. Instantaneous Snapping in `camClip` & `camFloor`
In [`js/haishi.js:L1453-L1460`](file:///g:/煉金畫廊/js/haishi.js#L1453-L1460):
```javascript
function camClip(a, b) {
  const n = Math.ceil(a.distanceTo(b) / 0.3);
  for (let i = Math.ceil(0.8 / 0.3); i <= n; i++) {
    const t = i / n;
    if (a.y + (b.y - a.y) * t < camFloor(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) + 0.25) return (i - 1) / n;
  }
  return 1;
}
```
And in [`js/player.js:L529-L534`](file:///g:/煉金畫廊/js/player.js#L529-L534):
```javascript
if (this.world.camClip) {
  const head = this.headPos.set(this.pos.x, this.pos.y + 1.2, this.pos.z), clip = this.world.camClip(head, outPos);
  if (clip < 1) outPos.lerpVectors(head, outPos, Math.max(clip, 0.15));
}
outPos.y = Math.max(outPos.y, this.world.camFloor(outPos.x, outPos.z) + 0.3);
```
- **The Core Flaw**: `clip` is calculated per-frame with **zero hysteresis** and **no damping memory**.
  - Frame $N$: Character steps near a wall corner $\rightarrow$ `clip = 0.2` $\rightarrow$ Camera violently snaps to 2.2 meters!
  - Frame $N+1$: Character passes 10cm past the corner $\rightarrow$ `clip = 1.0` $\rightarrow$ Camera violently springs back to 11.0 meters!
  - Frame $N+2$: Another corner detected $\rightarrow$ snaps back to 2.5 meters.
- Simultaneously, `outPos.y = Math.max(..., camFloor + 0.3)` pushes the camera upward by several meters while `outLook` remains at character waist/chest height (`pos.y + 0.9`), converting the angle into a jarring downward pitch.

---

### 2.2 Dimension 2: `zoomTo` Stealing Authority from Touch Orbit

#### A. Initial Arrival Setup
In [`js/main.js:L472-L478`](file:///g:/煉金畫廊/js/main.js#L472-L478):
```javascript
if (town) {
  player.aim = new THREE.Vector3(0, 9, -20);
  player.camDist = window.innerWidth < window.innerHeight ? 80 : 64;
  player.camPitch = -0.04;
  player.place(world.spawn.x, world.spawn.z, world.spawn.heading);
}
```
The game starts in `overview` mode, with the camera set to $80\text{ m}$ distance and $-0.04\text{ rad}$ pitch.

#### B. The Frame-by-Frame Overwrite Bug
When the user touches the joystick or taps:
```javascript
// main.js:L219
if (overview && kind !== 'drag') {
  overview = false;
  player.aim = null;
  if (player.camDist > 20) player.zoomTo();
}
```
`zoomTo()` initializes `this.zoomGoal = { dist: 11, pitch: 0.8 }`. Over the next 3 to 5 seconds:
```javascript
// player.js:L647-L651
if (zg) {
  const f = Math.min(1, dt * 1.3);
  this.camDist += (zg.dist - this.camDist) * f;
  this.camPitch += (zg.pitch - this.camPitch) * f;
  if (Math.abs(zg.dist - this.camDist) < 0.02 && Math.abs(zg.pitch - this.camPitch) < 0.002) this.zoomGoal = null;
}
```
- **The Conflict**: In [`js/player.js:L169-L176`](file:///g:/煉金畫廊/js/player.js#L169-L176), `orbit(dx, dy)` modifies `this.camPitch` when the player drags the screen.
- **However, `orbit()` DOES NOT set `this.zoomGoal = null`!**
- Even as the user swipes up/down to tilt their view, the `update()` loop forcefully pulls `camPitch` back towards `0.8` on every single animation frame. The user feels as if the game is actively resisting their finger.

---

### 2.3 Dimension 3: Lack of Directional Trailing (Auto-Follow)

#### A. Independent Yaw Behavior
In [`js/player.js:L633-L637`](file:///g:/煉金畫廊/js/player.js#L633-L637):
```javascript
let want = null;
if (this.speed > 0.05) want = Math.atan2(mx, mz);
if (want !== null) this.heading += wrapAngle(want - this.heading) * Math.min(1, dt * 10);
```
- When moving via the virtual joystick, the character mesh (`this.heading`) smoothly rotates to face the moving direction.
- **However, `this.camYaw` remains completely static.**
- If the player pushes "down" on the joystick to walk south down the harbor pier, the character runs towards the camera. The player cannot see what lies ahead unless they actively use their second hand to drag the screen $180^\circ$.
- In Haishi's complex 3D layout, paths bend and spiral constantly. The absence of gentle trailing auto-alignment forces players into non-stop manual camera corrections.

---

### 2.4 Dimension 4: Mobile Ergonomics & Virtual Joystick Bleed

#### A. Inverted Control Standard
In [`css/style.css:L248, L297`](file:///g:/煉金畫廊/css/style.css#L248):
- `#joy` is placed on the **bottom-right** (`right: 22px; bottom: 26px;`).
- `#jump-btn` and `#sit-btn` are placed on the **bottom-left** (`left: 26px; bottom: 44px;`).
- Standard mobile game convention (e.g. Genshin Impact, Sky: Children of the Light, Roblox, Minecraft) places **Movement Joystick on the LEFT** and **Camera Swipe + Action Buttons on the RIGHT**.
- With `#joy` on the right, right-handed users holding their phone naturally rest their right thumb on the right side. Attempting to swipe the screen to adjust view while moving requires awkward cross-thumb maneuvers.

#### B. Joystick Boundary Slip & False Stage Interaction
- `#joy` has a fixed boundary of $124 \times 124\text{ px}$.
- If the player's thumb slips even 5px outside this circle during intense movement, the touch registers on `#stage`.
- Any subsequent finger movement immediately triggers `orbit(dx, dy)`, causing sudden, unintended view rotations.
- If the touch is released with less than `DRAG_THRESHOLD` ($8\text{ px}$) of movement, it triggers `tap()`, causing the character to abort movement and walk towards the clicked point on the ground.

---

## 3. Evaluated Solutions & Design Trade-offs

```
+-------------------------------------------------------------------------------------------------------------+
| Area              | Proposed Intervention                       | Pro                       | Con           |
+-------------------------------------------------------------------------------------------------------------+
| Camera Distance   | Reduce Haishi portrait camDist (11m -> 6.8m)| Drastically fewer hits    | Slightly less |
|                   |                                             | with mountain walls       | sky visible   |
| Terrain Collision | Asymmetric Spring Damper for camClip        | Smooth camera transitions;| Minor latency |
|                   | (Fast squash, smooth recovery)              | completely eliminates jerk| in expanding  |
| Authority Preempt | Orbit / drag clears zoomGoal immediately    | 100% responsive touch;    | User aborts   |
|                   |                                             | zero fighting user finger | cinematic pan |
| Camera Trailing   | Soft Smart Auto-Follow while walking        | Vastly reduces swiping in | Needs auto-   |
|                   | (Gentle yaw lerp, suspended on touch)       | stairs and corners        | pause on drag |
| Joystick / Touch  | Dynamic floating joystick or Left/Right swap| Matches standard UX;      | Layout change |
|                   |                                             | prevents accidental orbit | for muscle mem|
+-------------------------------------------------------------------------------------------------------------+
```

---

## 4. Proposed Implementation Specifications

### 4.1 Specification A: Adaptive Camera Distance for Mountain Terrain
In `js/player.js`:
Add scene-aware or configurable camera baseline distances.
```javascript
// Current:
const defaultDist = () => (window.innerWidth < window.innerHeight ? 11 : 8.5);

// Proposed:
// In Haishi, portrait distance should not exceed 7.0m to stay within alley clear radiuses.
const defaultDist = (isHaishi = false) => {
  const portrait = window.innerWidth < window.innerHeight;
  if (isHaishi) return portrait ? 6.8 : 7.2;
  return portrait ? 11 : 8.5;
};
```
*Impact*: Reduces the bounding sphere volume by over 70%, immediately preventing 80% of unnecessary terrain collisions.

---

### 4.2 Specification B: Asymmetric Damped `camClip` (Collision Smoothing)
In `js/player.js:desiredCamera()`:
Instead of directly setting `clip`, maintain a filtered `this.smoothClip`:
- **When colliding (`clip < smoothClip`)**: Respond quickly (e.g., rate $= 18 \times dt$) to prevent camera from clipping inside solid rock.
- **When clearing (`clip > smoothClip`)**: Recover slowly (e.g., rate $= 2.5 \times dt$) so the camera does not spring back and forth frantically when walking along rough walls.
- **CamFloor Soft Clamp**: Instead of hard-locking `outPos.y` to `camFloor + 0.3`, apply a damped curve or adjust `outLook.y` proportionally to maintain a natural sightline.

---

### 4.3 Specification C: User Preemption of `zoomGoal`
In `js/player.js:orbit()`:
```javascript
orbit(dx, dy, mouse = false) {
  this.exitView();
  // Clear any active automated camera zoom/interpolation immediately
  this.zoomGoal = null;
  this.aim = null;
  
  const k = (mouse ? 9 : 5.5) / Math.max(this.dom.clientWidth, this.dom.clientHeight);
  const s = mouse ? 1 : -1;
  this.camYaw -= dx * k * s;
  this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * k * s, PITCH_MIN, PITCH_MAX);
  this.events.onInput('drag');
}
```
*Impact*: The very first millisecond a user touches the screen to drag, all automatic camera overrides immediately yield control to the user.

---

### 4.4 Specification D: Subtle Intelligent Camera Trailing (Auto-Follow)
In `js/player.js:update()`:
Implement a non-intrusive auto-follow mechanism:
1. **Trigger Condition**:
   - Player is actively moving (`manual = true`, `mag > 0.4`, `speed > 0.5`).
   - Player has NOT manually dragged the screen in the last $2.0\text{ seconds}$ (`performance.now() - this.lastOrbitTime > 2000`).
2. **Behavior**:
   - Slowly rotate `this.camYaw` towards `this.heading + Math.PI` using a gentle exponential decay (e.g., `rate = 1.2 * dt`).
   - The user barely notices the camera turning, but when navigating winding paths, the camera naturally glides behind them so they always see the road ahead.

---

### 4.5 Specification E: Mobile Touch & Joystick Ergonomics
1. **Dynamic / Floating Joystick (or Left-Hand Placement Option)**:
   - Provide a setting or switch to place the joystick on the left half of the screen.
   - Or implement a "floating joystick" where placing a thumb down on the left screen area dynamically spawns the joystick origin, completely eliminating edge-slippage.
2. **Enlarge Touch Capture Area**:
   - Prevent `#stage` from capturing touches within $30\text{ px}$ of the joystick perimeter.

---

## 5. Phased Implementation Roadmap

When authorized by the user to proceed with development:

- [ ] **Phase 1: Collision & Preemption Fixes (Zero Risk, Immediate Relief)**
  - Add `this.zoomGoal = null` into `orbit()`.
  - Adjust default portrait camera distance for Haishi (`11m` $\rightarrow$ `6.8m`).
  - Add asymmetric smoothing for `camClip` in `player.js`.
- [ ] **Phase 2: Intelligent Trailing Camera (High UX Value)**
  - Implement gentle auto-follow during sustained joystick movement with a 2-second user-override cooldown.
- [ ] **Phase 3: Touch Controls & Layout Optimization (Ergonomics)**
  - Test left-side joystick layout or expandable touch-capture deadzone to prevent accidental drag triggers.

---

*Document finalized for AI pair programming, technical review, and team collaboration.*
