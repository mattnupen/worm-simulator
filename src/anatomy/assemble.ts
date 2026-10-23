import type * as THREE from 'three';
import type { AnatomyMaterials } from './materials';
import type { Mesher } from './mesher';
import type { Part, SystemId } from './model';
import { buildCutWall, buildSetae, buildSkin } from './skin';
import { buildGut } from './gut';
import { buildBlood } from './blood';
import { buildNerves } from './nerves';
import { buildRepro } from './repro';
import { buildNephridia } from './nephridia';
import { buildMuscles } from './muscles';
import { buildSection } from './section';

type Add = (system: SystemId, part: Part, m: Mesher, material: THREE.Material, patch?: boolean, fine?: boolean) => void;

/**
 * Every part of the model, built and handed to `add` with its system, its place in the cutaway
 * (model.ts, Part) and its material. `full` false: the game's light outside-only worm.
 */
export function assemble(add: Add, mat: AnatomyMaterials, full: boolean): void {
  const skin = buildSkin(full ? 112 : 24, (n) => (full ? (n < 60 ? 14 : 10) : 3));
  if (!full) {
    // The game's worm: the outside only, merged into one mesh and one plain material (one draw).
    for (const part of [skin.near, skin.rest, skin.patch]) skin.far.append(part);
    add('skin', 'all', skin.far, mat.skinGame);
  } else {
    add('skin', 'far', skin.far, mat.skin);
    add('skin', 'near', skin.near, mat.skin);
    add('skin', 'rest', skin.rest, mat.skin);
    add('skin', 'rest', skin.patch, mat.skin, true);
    const setae = buildSetae();
    add('skin', 'far', setae.far, mat.setae);
    add('skin', 'near', setae.near, mat.setae);
    add('skin', 'rest', setae.rest, mat.setae);
    add('skin', 'rest', setae.patch, mat.setae, true);
    add('skin', 'cut', buildCutWall(skin.xs), mat.wall);
    add('skin', 'cut', skin.caps, mat.wall);
    const mu = buildMuscles();
    add('muscles', 'far', mu.far, mat.muscle);
    add('muscles', 'near', mu.near, mat.muscle);
    add('muscles', 'rest', mu.rest, mat.muscle);
    add('muscles', 'far', mu.septaFar, mat.septa);
    add('muscles', 'near', mu.septaNear, mat.septa);
    add('muscles', 'rest', mu.septaRest, mat.septa);
    add('muscles', 'far', mu.strandsFar, mat.muscle);
    add('muscles', 'near', mu.strandsNear, mat.muscle);
    const sec = buildSection();
    add('skin', 'cut', sec.cavity, mat.wall);
    add('gut', 'cut', sec.gut, mat.gut);
    add('blood', 'cut', sec.blood, mat.blood);
    add('nerves', 'cut', sec.nerves, mat.nerve);
    const gut = buildGut(48, 0.08, 0.3);
    add('gut', 'all', gut.all, mat.gut);
    add('gut', 'all', gut.frontFar, mat.gut);
    add('gut', 'shut', gut.frontNear, mat.gut);
    add('gut', 'open', gut.frontOpen, mat.gut);
    add('gut', 'far', gut.far, mat.gut);
    add('gut', 'near', gut.near, mat.gut);
    add('gut', 'cut', gut.cut, mat.gut);
    const blood = buildBlood();
    add('blood', 'all', blood.inner, mat.blood);
    add('blood', 'all', blood.fine, mat.blood, false, true);
    add('blood', 'near', blood.fineNear, mat.blood, false, true);
    // The hearts stay whole in the cutaway: only the body wall is cut.
    add('blood', 'all', blood.heartsFar, mat.blood);
    add('blood', 'all', blood.heartsNear, mat.blood);
    add('blood', 'far', blood.far, mat.blood, false, true);
    add('blood', 'near', blood.near, mat.blood, false, true);
    add('blood', 'rest', blood.rest, mat.blood, false, true);
    const nerves = buildNerves();
    add('nerves', 'all', nerves.inner, mat.nerve);
    add('nerves', 'far', nerves.far, mat.nerve, false, true);
    add('nerves', 'near', nerves.near, mat.nerve, false, true);
    add('nerves', 'rest', nerves.rest, mat.nerve, false, true);
    const repro = buildRepro();
    add('repro', 'all', repro.inner, mat.repro);
    add('repro', 'far', repro.innerFar, mat.repro);
    add('repro', 'near', repro.innerNear, mat.repro);
    add('repro', 'all', repro.sacs, mat.reproSac);
    add('repro', 'far', repro.far, mat.repro);
    add('repro', 'near', repro.near, mat.repro);
    const neph = buildNephridia();
    add('nephridia', 'far', neph.far, mat.nephridia);
    add('nephridia', 'near', neph.near, mat.nephridia);
    add('nephridia', 'rest', neph.rest, mat.nephridia);
  }
}
