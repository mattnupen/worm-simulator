import type { PhotoFile } from './lesson';
import robin from './photos/robin.jpg';
import woodcock from './photos/woodcock.jpg';
import mole from './photos/mole.jpg';
import shrew from './photos/shrew.jpg';
import garterSnake from './photos/garter-snake.jpg';
import toad from './photos/toad.jpg';
import salamander from './photos/salamander.jpg';

/**
 * Each lesson photo as the image the page shows. The build inlines them (vite-plugin-singlefile),
 * so they load with no network. Real photos, CC BY 4.0 from iNaturalist; each one's page is in
 * docs/codev/research/predators.md. Keep each file under about 90 KB (Chromebook load time).
 */
export const PHOTO_URLS: Readonly<Record<PhotoFile, string>> = {
  robin, woodcock, mole, shrew, 'garter-snake': garterSnake, toad, salamander,
};
