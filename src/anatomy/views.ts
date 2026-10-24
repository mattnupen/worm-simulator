import { RESTING, STRAIGHT, type Pose } from './pose';
import type { SystemId, WallMode } from './model';
import { LENGTH, PEEL, segMid, segStart } from './layout';
import { ANATOMY_UI, type AnatomyPartId } from '../content/anatomy';
import type { Line } from '../content/text';

/**
 * The viewer's preset views: what is shown, how the body lies, and where the camera looks from
 * (millimetres, in the posed model's space).
 */
export interface View {
  id: string;
  /** The button's name (simple words, for a 6th grader). */
  name: Line;
  /** The parts labelled in this view. */
  labels: readonly AnatomyPartId[];
  pose: Pose;
  wall: WallMode;
  systems: readonly SystemId[];
  camera: readonly [number, number, number];
  target: readonly [number, number, number];
  /** Frame the whole posed body, looking from `camera` minus `target` (the direction only). */
  fit?: boolean;
  /**
   * The animated bristle scene (src/anatomy/bristles/) instead of the model: its close-up of one
   * segment, or the whole piece crawling. Camera and target are in that scene's millimetres.
   */
  bristles?: 'close' | 'crawl';
}

const ALL: readonly SystemId[] = ['skin', 'muscles', 'gut', 'blood', 'nerves', 'repro', 'nephridia'];
const INSIDE_CAM = [24, 30, 44] as const;
const INSIDE_TARGET = [23, -1.5, 0] as const;
const PEEL_X = (segStart(PEEL.skin[0]) + segStart(PEEL.skin[1])) / 2;

export const VIEWS: readonly View[] = [
  { id: 'outside', name: ANATOMY_UI.viewOutside, labels: ['prostomium', 'clitellum', 'segments', 'skin'], pose: RESTING, wall: 'solid', systems: ['skin'], camera: [0, 70, 100], target: [0, 0, 0], fit: true },
  { id: 'head', name: ANATOMY_UI.viewHead, labels: ['prostomium', 'setae', 'segments'], pose: STRAIGHT, wall: 'solid', systems: ['skin'], camera: [-9, 5, 11], target: [3.5, 0, 0] },
  { id: 'saddle', name: ANATOMY_UI.viewSaddle, labels: ['clitellum', 'segments'], pose: STRAIGHT, wall: 'solid', systems: ['skin'], camera: [segMid(28), 13, 28], target: [segMid(36), 0, 0] },
  { id: 'tail', name: ANATOMY_UI.viewTail, labels: ['segments', 'setae'], pose: STRAIGHT, wall: 'solid', systems: ['skin'], camera: [LENGTH + 9, 7, 9], target: [LENGTH - 7, 0, 0] },
  { id: 'belly', name: ANATOMY_UI.viewBelly, labels: ['setae'], pose: STRAIGHT, wall: 'solid', systems: ['skin'], camera: [segMid(24), -38, 26], target: [segMid(26), 0, 0] },
  { id: 'inside', name: ANATOMY_UI.viewInside, labels: ['pharynx', 'brain', 'hearts', 'seminalVesicles', 'gizzard', 'intestine', 'nerveCord', 'septa'], pose: STRAIGHT, wall: 'cut', systems: ALL, camera: INSIDE_CAM, target: INSIDE_TARGET },
  { id: 'gut', name: ANATOMY_UI.viewGut, labels: ['pharynx', 'esophagus', 'calciferous', 'crop', 'gizzard', 'intestine'], pose: STRAIGHT, wall: 'cut', systems: ['skin', 'gut'], camera: INSIDE_CAM, target: INSIDE_TARGET },
  { id: 'blood', name: ANATOMY_UI.viewBlood, labels: ['hearts', 'dorsalVessel', 'ventralVessel'], pose: STRAIGHT, wall: 'cut', systems: ['skin', 'gut', 'blood'], camera: INSIDE_CAM, target: INSIDE_TARGET },
  { id: 'nerves', name: ANATOMY_UI.viewNerves, labels: ['brain', 'nerveCord', 'nerves'], pose: STRAIGHT, wall: 'cut', systems: ['skin', 'gut', 'nerves'], camera: INSIDE_CAM, target: INSIDE_TARGET },
  { id: 'repro', name: ANATOMY_UI.viewRepro, labels: ['seminalVesicles', 'receptacles', 'ovaries'], pose: STRAIGHT, wall: 'cut', systems: ['skin', 'repro'], camera: [16, 10, 26], target: [17, -0.8, 0] },
  { id: 'muscles', name: ANATOMY_UI.viewMuscles, labels: ['skin', 'circular', 'longitudinal'], pose: STRAIGHT, wall: 'solid', systems: ['skin', 'muscles'], camera: [PEEL_X - 6, 16, 22], target: [PEEL_X, 0, 0] },
  { id: 'nephridia', name: ANATOMY_UI.viewNephridia, labels: ['nephridia', 'septa'], pose: STRAIGHT, wall: 'cut', systems: ['skin', 'muscles', 'nephridia'], camera: INSIDE_CAM, target: INSIDE_TARGET },
  { id: 'bristles', name: ANATOMY_UI.viewBristles, labels: [], pose: STRAIGHT, wall: 'solid', systems: [], camera: [0.6, -4.1, 7], target: [0, -4.6, 0], bristles: 'close' },
  { id: 'crawl', name: ANATOMY_UI.viewCrawl, labels: [], pose: STRAIGHT, wall: 'solid', systems: [], camera: [4, 1, 27], target: [4, -1.2, 0], bristles: 'crawl' },
  { id: 'ghost', name: ANATOMY_UI.viewGhost, labels: ['pharynx', 'gizzard', 'hearts', 'nerveCord'], pose: STRAIGHT, wall: 'ghost', systems: ['skin', 'gut', 'blood', 'nerves', 'repro'], camera: [30, 30, 70], target: [30, 0, 0] },
];

/** The view by id; the whole worm when none is asked for. */
export const viewById = (id: string | null): View => VIEWS.find((v) => v.id === id) ?? VIEWS.find((v) => v.id === 'outside')!;
