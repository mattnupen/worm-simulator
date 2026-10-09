# V2 emergency fix: 3D tunnels and a body that stays in them

Serves **V2 · Underground** as an emergency fix (Matt, 2026-10-08). V2 was frozen today and
students get it on Monday 2026-10-12. This work re-cuts `/v2/` with
`npm run release -- 2 --emergency-fix` once Matt approves the root build. It builds on the V2
spec (`2026-10-04-v2-underground-design.md`, sections 6 and 10, and as-built section 14).

## 1. Problems (Matt's playtest)

1. **Tunnels are flat.** A tunnel is paint on the flat cut face (`cutFaceGlsl.ts`: a darker
   "hollow" colour where the soil grid is open). The worm lies in the cut's plane, so its back
   half is hidden behind the paint. Matt wants a real 3D hole: it looks better, and it opens the
   way to later interactions (things in the walls, critters in side tunnels).
2. **The body cuts corners.** The body is a follow-the-leader chain (`burrowBack.ts` `drawLink`,
   called from `burrowTrail.ts` `trailBody`). A chain pulled from its front always cuts the
   inside of a bend. After a sharp turn followed by a straight run, the body slides across undug
   soil instead of following its tunnel.

## 2. Decisions (Matt, 2026-10-08)

| Question | Answer |
|---|---|
| Which build | Emergency fix to V2 (both parts) |
| How the 3D tunnel is built | A real carved half-pipe. The face has a hole, and a real 3D wall behind it |
| How the body stays in the tunnel | It rides the head's recorded trail |
| What the walls look like | Each layer's own soil, darker deeper in, lit rim. Castings are lumps on the floor |
| Approach (of three) | A depth map with fine 3D tiles (section 4) |
| Fallback if Low misses its gate | A coarser tunnel mesh on Low (Claude's default; Matt didn't object) |

## 3. Body: ride the head's trail

### 3.1 Behaviour
- The game records the head's path for the whole visit to a slab. That path is the trail.
  - The trail is recorded through a **pursuit point**: a point that follows the head at most
    `TRAIL_LAG` (0.1 u) behind it, a tractrix. That rounds the head's sharp corners (sliding
    along a stone, a turn on the spot) to a radius of about 0.1 u.
  - Every trail point is within 0.1 u of where the head then was. The head dug a disc of
    `TUNNEL_R` (0.14 u) there, so **every trail point lies in the open tunnel**.
- **Chain on a rail:** each body point sits on the trail, behind the one ahead of it. The
  straight-line distance to that point is exactly its link length, `SPACING` (0.22 u). The
  search walks back along the trail from the point ahead to the first crossing. The links are
  exact, so the body can never shrink.
  - Why it isn't arc length: 5ede96b put points at arc length and smoothed them, and the body
    shrank to 58% where the trail folded (3d1f515 reverted it). Here no point is averaged.
- **The body is only ever in the tunnel.** All points are on the trail, and a 0.22 u chord across
  a corner rounded to 0.1 u stays inside a 0.14 u tunnel. This holds on hairpins, loops and when
  it crosses an older tunnel.
- When the trail is seeded from a pose whose links are not exactly `SPACING`, each link keeps its
  seeded length and eases to `SPACING` as the worm moves. That way, nothing pops on arrival.
- The bend limits of the chain (`MAX_BEND` 0.6) go away. The body bends as sharply as its
  tunnel. Where the head's path turned sharply, the body shows that bend, now rounded. The new
  tests bound how sharp it gets from measured values, and "in the tunnel" comes first.
- **Backing up** pins the head's exact place as the trail's end, then moves the tail's place on
  the trail backward by `BACK_SPEED × dt`. Every other point, the head included, is placed
  forward from the one behind it, as a chain on the rail. It stops when the tail reaches the trail's start
  (the tunnel's end: "a worm's tail does not dig"). The existing stuck test (`moved <
  STUCK_SHARE × …`) ends backing there, as now.
- **Going forward after backing** cuts the trail at the head's place and appends the new path.
  The old branch's tunnel stays in the soil grid; only the record is cut.
- The head's own motion (steering, `MIN_TURN_R`, `holdBend`, `keepOut`, speeds) is unchanged.

### 3.2 Seeding
- When the sink ends (`arriveBelow` in `burrowMoves.ts`, both the normal and the `snap` speed-test
  path), the trail is seeded with the body's own points, from tail to head. Those points are
  already dug (`digPoint` for every point).
- A new slab resets the trail.

### 3.3 Data
- New pure module `src/underground/bodyTrail.ts`: preallocated `Float64Array`s of u, v and
  cumulative arc length. It allocates nothing per step.
  - The trail's last point is the live pursuit point. It is committed, and a new live point
    begun, once it is at least `TRAIL_STEP` (0.02 u) from the point before it.
  - Capacity is 8192 points, about 160 u of path. When the trail is full, the oldest half is
    dropped (copyWithin). The body needs only the last 3.3 u; older points serve backing.
  - API: `seedTrail(t, u, v)` (from a body pose, head first), `followHead(t, u, v)` (after the
    head moves forward: cut at the head's place if it had backed, move the pursuit point,
    commit), `poseBehind(t, u, v)` (points 1 to 15 from the head, back along the trail),
    `backAlong(t, u, v, step)` (pin the head, move the tail back, place the rest forward).
    The trail lives on the `Burrower` (`b.trail`), and `placeBurrower` seeds it.
- `burrowTrail.ts` `trailBody` calls `poseBody`. The chain (`linkOut`, `drawLink`, `lastBend`,
  `MAX_BEND`, `SLACK`, `BEND_EASE`) is deleted. In `burrowBack.ts`, `backUp`'s tail search
  (`TAIL_TURNS`, `nearOpen`, `FEEL_BACK`) is replaced by `retreat` plus `poseBody`. `keepOut`
  stays, for the head.
- `castTail`'s side offsets (`CAST_SIDE`), which were for a tail lying beside its tunnel, can
  shrink to straight behind. The plan decides; behaviour must not regress (never seal a tunnel).

## 4. Tunnel: a real carved half-pipe

### 4.1 The idea
Every tunnel is centred in the cut's plane, so the back halves of all the tunnels together form
one surface: a depth behind the face for each point (u, v). The game keeps that depth as data,
and the renderer draws it as fine mesh tiles pushed back into the soil. Crossings, castings, and
the digs on the way down and up all come from one source, as everything underground does now.

### 4.2 Data: the hollow map (soil grid)
- A new field in `SoilGrid`: `hollow: Uint8Array` at `HOLLOW_RES` = 4 samples per grid cell
  (0.025 u). That is 640 × 544 bytes. Each byte is the depth behind the face, 0 to 255 for
  0 to `HOLLOW_MAX`.
  - `HOLLOW_MAX` is 0.16 u: just over `TUNNEL_R`, so a casting's lumps and any dig with a radius
    up to 0.16 fit.
- `digDiscAt` also carves: within radius r of the centre, each sample becomes the larger of its
  own value and `√(r² − d²)`. That is a round profile, so the tunnel is a half circle in
  cross-section. It skips air and solid cells, as the open cells do.
- `castBlobAt` also fills: in each cell it fills, the hollow samples drop to a lumpy level, from a
  fixed hash and a broad bump, about 30–55% of `TUNNEL_R`. A later dig through the casting raises
  them again (max).
- The hollow has its own dirty rectangle (fine columns and rows), so the renderer rewrites only
  the tiles a dig touched.
- `fillSoilGrid` zeroes it for each new slab.
- **The open cells stay the truth for gameplay** (speed, eating, emerge, castings). The hollow is
  for drawing, and for later interactions.

### 4.3 Drawing: hollow tiles (one draw)
- New module `src/underground/hollowMesh.ts`. One `THREE.Mesh` with a single geometry holds a
  **pool of tiles**, each 0.5 u × 0.5 u. That is 32 × 28 = 896 tiles over the playable grid, all
  preallocated at load. **It is one draw call** (the budget is 40).
  - Each tile is a regular grid of `TILE_QUADS` × `TILE_QUADS` quads. The default is 12
    (1/24 u spacing, about 7 quads across a tunnel). Low may use 8 if it misses its gate
    (section 7).
  - Vertex attributes: position, normal, `aPlane` (u, v), and `aBoundsA` and `aBoundsB` (the
    column's layer boundaries, interpolated from the slab's 0.125 u columns when a tile is
    claimed). The indices are prebuilt for every slot (Uint32).
- **Claiming tiles.** When the hollow's dirty rows are uploaded, any tile covering a non-zero
  sample, or an open grid cell (the face's hole reaches about one cell past the dig), is claimed
  into the next free slot. A slot's vertices are written once in full, and only its depths and
  normals change after that. The draw range covers the slots in use. A new slab frees every
  slot.
- **Updating.** For each dirty fine row, the tiles it touches are rewritten. Each vertex's depth
  is read bilinearly from the hollow map, and its normal comes from central differences. The
  vertex is placed at `slabPoint(u, v) − n × max(ε, depth)`, where n is the slab's normal toward
  the camera's side and ε = 0.004 u. Outside tunnels the tile lies just behind the face, hidden.
  Each rewritten tile adds one update range per attribute. Nothing allocates per step: the
  ranges are fixed per slot, as `cutFace.ts` does per row.
- The mesh is built at load and added to the underground group, so `warmShaders` compiles it.
  Going down and coming up only show and hide it.

### 4.4 Shading
- **One soil colour, two draws.** The layer colouring in `CUT_FRAGMENT` (the noise read, the
  three tiles, the boundaries, moss, damp, mixed rim, castings colour, depth dimming, the far-end
  fades, the grade) moves into a shared GLSL chunk, `soilColour(...)`. The face and the hollow
  both call it, so the layers carry straight in over the rim with no seam.
- **The face** cuts a hole where its existing crisp edge (`open`, the smoothstep on the softened
  bore) passes 0.5 (`discard`). The painted "hollow" block (the far-half shadow, roof and floor
  shading) is deleted. The pressed-wall line and the mixed rim just outside the hole stay.
- **The hollow wall** adds real light on top of `soilColour`:
  - a wrap-lit Lambert term from a light toward the camera's side and above, with the face's
    own light colour, so the floor catches light and the roof is in shadow;
  - darkening with depth, toward about 45% at `TUNNEL_R`: "darker deeper in";
  - a deep soil brown, never black (the V2 spec rule stays);
  - castings: the grid's casting colour paints the raised lumps.
- Software GL rule (visual-quality brief): straight-line code costs every pixel of a draw. The
  face's `discard` is one compare. The face loses the hollow block, so it should get cheaper.
  The hollow draws after the face (render order) and has no `discard`, so tile pixels behind the
  face fail the depth test early.

### 4.5 The worm, stones, roots and life
- The worm stays at w = 0 in the cut. Its back half now shows, lying in the groove.
- Stones and roots half sunk in the face are unchanged. Where a tunnel runs next to one, its
  buried half may show in the tunnel wall, which is fine.
- The cut camera, the labels, the hint card and the moves in and out are unchanged.

## 5. Non-negotiables check
- **Science:** no new student-facing text. A burrow is round in cross-section, so the half-pipe
  matches reality.
- **Accessibility:** nothing flashes. Tunnels read by depth and shading, not colour alone.
- **Performance:** one extra draw, no shader compiles after load, no per-step allocation.
  Section 7 has the gates.
- **No network, privacy:** unaffected.

## 6. Testing
- **Unit tests (written first for the pure modules):**
  - `bodyTrail`:
    - every body point lies in open cells after a scripted hairpin, a tight loop, sharp turns
      against a stone, and a crossing of an older tunnel (the regression for Matt's report);
    - the arc spacing is 0.22 u (± 1e-6);
    - backing reaches the trail's start and stops;
    - going forward after backing cuts and appends;
    - when full, the trail drops its oldest half and keeps the last 3.3 u exact;
    - no allocation per step.
  - Hollow map: the profile of a single dig is `√(r² − d²)` (to byte precision); max-combine;
    castings lower it and a later dig restores it; air and solids stay at 0; the dirty rows are
    tracked.
  - Hollow tiles (CPU part): tiles are claimed for every non-zero sample and open cell; slots are
    freed on a new slab; a vertex's depth matches the map; normals point toward the camera's side
    on flat ground.
  - The existing `burrowBody`, `burrowBack`, `burrowMotion`, `burrowTunnel` and `burrowGame`
    tests are updated where they assert chain behaviour, keeping their intent: in the tunnel,
    never folded, never trapped.
- **E2E tests:** the existing underground suite (keyboard, touch, reduced motion, zero compiles,
  zero network), plus a check that the hollow mesh is drawn and the draw count stays at 40 or
  under.
- **Perf gates:** `npm run build && node scripts/perf-gates.mjs 4`, every preset, surface and
  underground (the `?dig=1` speed test digs a scripted tunnel).
- **Screenshots:** a tunnel in Wide and Close views, a crossing, a casting, and a hairpin with the
  body in its tunnel. Saved to `docs/codev/versions/v02-underground/`.

## 7. Performance fallback
If underground Low misses its gate, Low uses `TILE_QUADS` 8: the same shader and geometry,
uploaded at a coarser spacing, chosen at load from the preset (no recompile). If any other preset
misses, Claude reports to Matt before releasing.

## 8. Release (emergency fix)
1. Unit tests, e2e tests and perf gates pass.
2. Under the dated V2 heading in `CHANGELOG.md`, a "Fixed" entry for students says:
   - tunnels are real holes now;
   - your worm's body stays inside its tunnel on sharp turns.
   It is noted as an emergency fix with its date.
3. `docs/codev/versions/v02-underground.md`: a dated note that the snapshot was re-cut, and why.
   V2 spec section 14: an as-built note pointing here.
4. Fast-forward merge to `main`, push, and check that wormsimulator.com serves the new root build.
5. **Matt approves the root build.** Then run `npm run release -- 2 --emergency-fix`, commit and
   push `releases/v2/index.html`, and check that `wormsimulator.com/v2/` serves it.
6. Rendering changed, so a student Chromebook check is needed before Monday (Matt).

## 9. Out of scope
- Any new interactions in the tunnel (things in the walls, side critters). This only makes them
  possible.
- Saving tunnels, which are still session only.
- Changing how fast the head turns.
