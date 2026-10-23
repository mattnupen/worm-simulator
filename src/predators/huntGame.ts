import type * as THREE from 'three';
import type { Crawl } from '../game/crawl';
import type { BurrowGame } from '../underground/burrowGame';
import type { ActionKind } from '../ui/actionPrompt';
import { createHuntHud, type HuntHud } from '../ui/huntHud';
import { playHuntSound } from '../ui/huntSound';
import { litterTopHeight } from '../surface/litterDepth';
import { leaveBelow } from '../underground/burrowLetGo';
import { slabU } from '../underground/slab';
import { HUNT, createHunt, endGrab, resetHunt, robinIn, robinShown, stepHunt, type HuntInput, type HuntPhase, type HuntState } from './hunt';
import { huntPose } from './huntPose';
import { huntOutcome, nextLength, type HuntOutcome } from './huntOutcome';
import { GUSTS, HuntShadow, SHIVER_S, gust, lookUp } from './huntEffects';
import { HeldWorm } from './heldWorm';
import { HuntGrab } from './huntGrab';
import { HUNT_NOTES } from './huntNotes';
import { readWorm } from './huntPlace';
import { Robin } from './robin';
import { Wobble } from './wobble';

/** What the page does for the hunt's endings that start a new life (main.ts). */
export interface HuntHost {
  /**
   * The robin got the whole worm (spec 3 and 5) where it stood at (x, z), facing `heading`.
   * `action`: the Action level held now, so a new life started from here doesn't read it as a press.
   */
  onWholeWorm(action: boolean, x: number, z: number, heading: number): void;
  /** Too short: start again at full length in "your burrow". `action` as for onWholeWorm. */
  startAgain(action: boolean): void;
  /** prefers-reduced-motion, read as each warning, tug or grab starts (no leaf shiver, no wobble). */
  reducedMotion(): boolean;
}

/** The cut to the side view as it grabs on the surface: the screen dims as it strikes, then clears over this long (s). */
const CUT_CLEAR_S = 0.4;
const STRIKE_DIM = 0.55;

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * The robin hunt in play (V4 spec 1 to 3, revision 1): the robin and its hunt (hunt.ts), on the
 * surface or along the cut for a worm in the top two layers; the grip mini-game (huntGrab.ts) while
 * it holds the worm, seen in the side view (burrowGrab.ts, huntFrame.ts); the warnings, the wobble, the
 * camera's look-up, and what happens after. main.ts steps it each game step on the crawl screen and
 * draws it each frame. Allocates nothing per step or frame.
 */
export class HuntGame {
  readonly robin = new Robin();
  readonly hunt: HuntState;
  readonly grab = new HuntGrab();
  readonly wobble = new Wobble();
  /** The last whole-worm catch came from running out of energy (its note says so after the nest). */
  takenTired = false;
  private readonly hud: HuntHud;
  private readonly shadow: HuntShadow;
  // Number fields start as fractions: a field that first held a whole number had V8 box every fraction written later.
  private readonly input: HuntInput = { catchable: false, under: false, hx: 0.5, hz: 0.5, heading: 0.5 };
  private readonly worm: HeldWorm;
  private last: HuntPhase = 'away';
  private lastT = 0;
  /** The warning's leaf shiver: seconds into it (Infinity when none). */
  private shiverT = Infinity;
  private noteLeft = 0;
  /** A note to show once this one has had its time (null: none). */
  private nextNote: string | null = null;
  /** The end of this life's first grab shows the grip's fact. */
  private hinted = false;
  /** A touch screen, as of the last step (the Tap button shows only there). */
  private touch = false;

  constructor(
    scene: THREE.Scene, root: HTMLElement, private readonly crawl: Crawl, private readonly game: BurrowGame,
    private readonly host: HuntHost, private readonly rand: () => number = Math.random,
    firstIn: number | null = null, tapTarget: HTMLElement | null = null,
  ) {
    this.hunt = createHunt(rand);
    if (firstIn !== null) robinIn(this.hunt, firstIn);
    scene.add(this.robin.mesh);
    this.worm = new HeldWorm(game, this.robin);
    this.shadow = new HuntShadow(scene);
    this.hud = createHuntHud(root);
    // A tap or click on the game itself is a tap too (the Energy panel and the button as well).
    const tap = (e: PointerEvent): void => {
      if (e.button === 0 && this.hunt.phase === 'grab') this.grab.tap();
    };
    tapTarget?.addEventListener('pointerdown', tap);
    this.hud.panel.addEventListener('pointerdown', tap);
  }

  /** The robin holds the worm (or it is sliding back down its hole): no crawling or digging. */
  get held(): boolean {
    return this.hunt.phase === 'grab' || this.worm.sliding;
  }

  /**
   * The Action prompt while the robin holds the worm: on a touch screen the Tap button ('grip'),
   * with a keyboard none (null: Space is the tap, and the grab shows no instructions). Undefined
   * when not held: the game's own.
   */
  get prompt(): ActionKind | null | undefined {
    if (this.hunt.phase !== 'grab') return undefined;
    return this.touch ? 'grip' : null;
  }

  /** A short line for `seconds` (the hooks' notes, too); `then`: a note to follow it for 7 s. */
  note(text: string, seconds: number, then: string | null = null): void {
    this.hud.note(text);
    this.noteLeft = seconds;
    this.nextNote = then;
  }

  /**
   * One game step. `active`: on the crawl screen and playing (not paused, the speed test, a menu);
   * otherwise nothing moves and the HUD steps aside. `action`: the Action level (held, not pressed).
   */
  step(dt: number, active: boolean, action: boolean, touch: boolean): void {
    this.touch = touch;
    if (!active) {
      this.grab.step(dt, action, false, this.rand);
      this.hud.warn(false, false);
      this.hud.grip(null);
      return;
    }
    const h = this.hunt;
    const g = this.game;
    const w = this.input;
    this.wobble.step(dt);
    readWorm(g, h, w);
    const ev = stepHunt(h, dt, w, this.rand);
    if (ev === 'warn') this.warned();
    else if (ev === 'grab') this.grabbed();
    if (h.phase !== this.last && (h.phase === 'leave' || h.phase === 'carry')) playHuntSound('leave');
    // It lands: the wobble.
    if (h.phase === 'arrive' && this.lastT < HUNT.flyIn && h.t >= HUNT.flyIn) this.wobble.kick(this.host.reducedMotion());
    this.last = h.phase;
    this.lastT = h.t;

    const tap = this.grab.step(dt, action, h.phase === 'grab', this.rand);
    if (tap === 'grip') playHuntSound('good');
    else if (tap === 'pull') {
      // Each pull reads without colour or words: the robin's yank, the wobble, the sound, and for screen readers "Robin pulls!".
      playHuntSound('tug');
      this.wobble.kick(this.host.reducedMotion());
      this.hud.pulled();
    }
    const r = this.grab.grip;
    const end: HuntOutcome | null = h.phase === 'grab' && r.result !== 'none' ? huntOutcome(r.result, this.rand(), g.wormLength) : null;
    huntPose(h, this.grab.look, litterTopHeight, this.robin.pose);
    // The side view frames the robin hunting a worm underground (and holding it).
    g.robinU = g.mode.mode !== 'surface' && g.slab && robinShown(h) && (h.under || this.held) ? slabU(g.slab, h.x, h.z) : NaN;
    if (end) this.finish(end, action);
    // The worm's head in the bill, the rest down its hole; after, sliding back down it.
    else if (h.phase === 'grab') this.worm.follow(dt);
    if (this.worm.sliding) this.worm.slide(dt);
    // The surface strike dims toward the cut; the cut clears.
    g.cutDip = h.phase === 'strike' && !w.under ? STRIKE_DIM * ease(h.t / HUNT.strike) : Math.max(0, g.cutDip - dt / CUT_CLEAR_S);
    this.hud.grip(h.phase === 'grab' ? r : null);
    this.hud.warn(h.phase === 'arrive' || h.phase === 'stare' || h.phase === 'dash' || h.phase === 'strike', w.under);
    lookUp(this.crawl, h, this.robin.pose, dt, g.mode.mode === 'surface');
    if (this.shiverT < SHIVER_S) {
      // The wingbeats' puffs: the loose leaves by the worm hop and turn.
      const n = Math.floor((this.shiverT + dt) * GUSTS) - Math.floor(this.shiverT * GUSTS);
      if (g.mode.mode === 'surface' && n > 0) gust(this.crawl.hero, Math.floor(this.shiverT * GUSTS));
      this.shiverT += dt;
    }
    if (this.noteLeft > 0) {
      this.noteLeft -= dt;
      if (this.noteLeft <= 0 && this.nextNote !== null) this.note(this.nextNote, 7);
      else if (this.noteLeft <= 0) this.hud.note(null);
    }
  }

  /** Each drawn frame: the robin's mesh and its shadow, from the last step's pose. */
  frame(): void {
    this.robin.update();
    this.shadow.follow(this.hunt, this.robin.pose);
  }

  /** The robin's wobble on the camera, as posed this frame (cutScene.ts shake). */
  shake(camera: THREE.Camera): void {
    this.wobble.apply(camera);
  }

  /** The robin and its shadow out of sight now (the nest scene takes the robin over). */
  hide(): void {
    this.robin.pose.visible = false;
    this.robin.update();
    this.shadow.hide();
    this.wobble.stop();
    this.hud.warn(false, false);
    this.hud.grip(null);
  }

  /** A new life (or the speed test's reset): no robin, no grab, the hint again on the next grab. */
  reset(): void {
    resetHunt(this.hunt, this.rand);
    this.last = 'away';
    this.lastT = 0;
    this.grab.start();
    this.worm.sliding = false;
    this.shiverT = Infinity;
    this.hinted = false;
    this.nextNote = null;
    this.game.robinU = NaN;
    this.game.cutDip = 0;
    this.crawl.lookUp = 0;
    this.robin.pose.visible = false;
    this.shadow.hide();
    this.wobble.stop();
    this.hud.warn(false, false);
    this.hud.grip(null);
  }

  private warned(): void {
    playHuntSound('arrive');
    if (!this.host.reducedMotion()) this.shiverT = 0;
  }

  /** The robin has the worm: into the side view (from the surface, a cut that clears), the grip from its lead-in. No note over it. */
  private grabbed(): void {
    this.grab.start();
    if (this.worm.grab(this.hunt, this.grab.look)) this.game.cutDip = 1;
    this.hud.note(null);
    this.noteLeft = 0;
    this.nextNote = null;
  }

  /** The grip's fact after this life's first grab (null after that). */
  private fact(): string | null {
    if (this.hinted) return null;
    this.hinted = true;
    return HUNT_NOTES.grip;
  }

  /** The mini-game's ending (spec 3). */
  private finish(end: HuntOutcome, action: boolean): void {
    const h = this.hunt;
    const g = this.game;
    const tired = this.grab.grip.tired;
    switch (end) {
      case 'escaped':
        endGrab(h, 'escaped');
        playHuntSound('escape');
        this.worm.letGo();
        this.note(HUNT_NOTES.escaped, 2.5, this.fact());
        break;
      case 'broke':
        endGrab(h, 'broke');
        g.setWormLength(nextLength(g.wormLength) ?? 1);
        this.worm.letGo();
        this.note(tired ? HUNT_NOTES.brokeTired : HUNT_NOTES.broke, 5, this.fact());
        break;
      case 'tooShort':
        endGrab(h, 'broke');
        // A new life (the hunt resets), then its note and the grip's fact.
        this.host.startAgain(action);
        this.note(tired ? HUNT_NOTES.tooShortTired : HUNT_NOTES.tooShort, 5, this.fact());
        break;
      case 'taken':
        endGrab(h, 'taken');
        this.takenTired = tired;
        leaveBelow(g);
        this.host.onWholeWorm(action, h.x, h.z, h.yaw);
        break;
    }
  }
}
