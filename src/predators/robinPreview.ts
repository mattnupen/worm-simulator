import type * as THREE from 'three';
import type { GameParams } from '../game/params';
import { UNITS_PER_CM } from '../surface/realScale';
import { litterTopHeight } from '../surface/litterDepth';
import { Robin } from './robin';
import { demoPose } from './robinDemo';

/**
 * `?robin=1` (robinDemo.ts): the robin joins the scene and plays its preview loop ahead of the
 * worm, from where the worm was on the first crawl frame. Students never load it.
 */
export class RobinPreview {
  private readonly robin = new Robin();
  private anchor: { x: number; z: number; heading: number } | null = null;

  constructor(scene: THREE.Scene, private readonly params: Pick<GameParams, 'robinAt' | 'robinTurn' | 'robinDist' | 'robinCam'>) {
    scene.add(this.robin.mesh);
  }

  /** Poses it for game time `seconds`, on the crawl screen only. */
  frame(seconds: number, crawling: boolean, head: { x: number; z: number }, heading: number): void {
    if (!crawling) {
      this.robin.pose.visible = false;
      this.robin.update();
      return;
    }
    this.anchor ??= { x: head.x, z: head.z, heading };
    const a = this.anchor;
    const t = this.params.robinAt ?? seconds;
    demoPose(t, a.x, a.z, a.heading, this.params.robinDist, litterTopHeight, this.robin.pose);
    this.robin.pose.yaw += (this.params.robinTurn * Math.PI) / 180;
    this.robin.update();
  }

  /** `?robinCam=`: the camera looks at the robin from that angle round it (0: face on), at its eye height. */
  aim(camera: THREE.PerspectiveCamera): void {
    const deg = this.params.robinCam;
    if (deg === null || !this.robin.pose.visible) return;
    const p = this.robin.pose;
    const a = p.yaw + (deg * Math.PI) / 180;
    const cy = p.y + (p.lift + 9) * UNITS_PER_CM;
    camera.position.set(p.x + Math.sin(a) * 7, cy + 0.6, p.z + Math.cos(a) * 7);
    camera.lookAt(p.x, cy, p.z);
    camera.updateMatrixWorld();
  }
}
