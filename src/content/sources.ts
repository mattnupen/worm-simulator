/**
 * Every source a student-facing fact may cite (science honesty, CLAUDE.md; V2 spec 2b). A fact in
 * src/content/text.ts names one of these by its id, and the build fails without it
 * (tests/unit/content.test.ts). Seeded from docs/codev/research/mn-forest-floor.md; `checked` is
 * the date someone last opened the page and read what the fact says. Re-check a source, and
 * update `checked`, before a new fact cites it.
 */
export interface Source {
  /** The page's title, as the publisher gives it. */
  readonly title: string;
  readonly publisher: string;
  readonly url: string;
  /** When it was last checked: YYYY-MM-DD. */
  readonly checked: string;
}

export type SourceId =
  | 'mndnr-humus'
  | 'mndnr-earthworms'
  | 'wormwatch-forest'
  | 'wormwatch-soil'
  | 'wormwatch-ecogroups'
  | 'wormwatch-vertebrates'
  | 'wormwatch-invertebrates'
  | 'umn-earthworm-problems'
  | 'hale-2005';

export const SOURCES: Readonly<Record<SourceId, Source>> = {
  'mndnr-humus': {
    title: 'Humus Types',
    publisher: 'Minnesota DNR, Division of Forestry',
    url: 'https://files.dnr.state.mn.us/forestry/ecssilviculture/forms_worksheet/humus-types.pdf',
    checked: '2026-10-04',
  },
  'mndnr-earthworms': {
    title: 'Earthworms',
    publisher: 'Minnesota DNR',
    url: 'https://www.dnr.state.mn.us/invasives/terrestrialanimals/earthworms/index.html',
    checked: '2026-10-04',
  },
  'wormwatch-forest': {
    title: 'About the Forest',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/forest-ecology/about-forest',
    checked: '2026-10-04',
  },
  'wormwatch-soil': {
    title: 'Soil and Worms',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/soil-and-forest-floor/soil-and-worms',
    checked: '2026-10-04',
  },
  'wormwatch-ecogroups': {
    title: 'Earthworm Ecological Groups',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    url: 'https://wormwatch.d.umn.edu/worm-id/earthworm-ecological-groups',
    checked: '2026-10-07',
  },
  'wormwatch-vertebrates': {
    title: 'Vertebrate Animals',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/animals/vertebrate-animals',
    checked: '2026-10-04',
  },
  'wormwatch-invertebrates': {
    title: 'Macroinvertebrate Animals',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/animals/macroinvertebrate-animals',
    checked: '2026-10-04',
  },
  'umn-earthworm-problems': {
    title: 'European earthworms cause big problems in North American forests',
    publisher: 'University of Minnesota',
    url: 'https://twin-cities.umn.edu/news-events/european-earthworms-cause-big-problems-north-american-forests',
    checked: '2026-10-04',
  },
  'hale-2005': {
    title: 'Exotic European earthworm invasion dynamics in northern hardwood forests of Minnesota, USA',
    publisher: 'Hale, Frelich, Reich and Pastor, Ecological Applications (2005)',
    url: 'https://esajournals.onlinelibrary.wiley.com/doi/abs/10.1890/03-5345',
    checked: '2026-10-04',
  },
};
