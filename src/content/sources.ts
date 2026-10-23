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
  /** A short name for tight spaces, like under a lesson fact ("All About Birds"). */
  readonly short?: string;
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
  | 'hale-2005'
  | 'mnbirdatlas-robin'
  | 'allaboutbirds-robin'
  | 'mndnr-woodcock'
  | 'adw-woodcock'
  | 'mndnr-moles'
  | 'adw-star-nosed-mole'
  | 'csu-nightcrawlers'
  | 'nuutinen-2014'
  | 'catania-2008'
  | 'mndnr-shrews'
  | 'mndnr-garter-snake'
  | 'mndnr-american-toad'
  | 'adw-red-backed-salamander'
  | 'msu-robins-hear'
  | 'journeynorth-robin-tug'
  | 'allaboutbirds-woodcock'
  | 'scott-2023'
  | 'mndnr-redbelly-snake'
  | 'uw-ground-beetles'
  | 'esb-cut-in-two'
  | 'cornell-robin-nestcam'
  | 'wormwatch-trees'
  | 'sciencelearn-earthworm'
  | 'usbg-earthworms'
  | 'esb-biology'
  | 'esb-food'
  | 'carolina-dissection'
  | 'hst-dissection'
  | 'purdue-corn-leaves'
  | 'naturewatch-wormfacts'
  | 'sciencelearn-outside'
  | 'lander-lumbricus'
  | 'naturespot-terrestris'
  | 'smith-1917';

export const SOURCES: Readonly<Record<SourceId, Source>> = {
  'mndnr-humus': {
    title: 'Humus Types',
    publisher: 'Minnesota DNR, Division of Forestry',
    short: 'Minnesota DNR',
    url: 'https://files.dnr.state.mn.us/forestry/ecssilviculture/forms_worksheet/humus-types.pdf',
    checked: '2026-10-04',
  },
  'mndnr-earthworms': {
    title: 'Earthworms',
    publisher: 'Minnesota DNR',
    url: 'https://www.dnr.state.mn.us/invasives/terrestrialanimals/earthworms/index.html',
    checked: '2026-10-21',
  },
  'wormwatch-forest': {
    title: 'About the Forest',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    short: 'Great Lakes Worm Watch',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/forest-ecology/about-forest',
    checked: '2026-10-04',
  },
  'wormwatch-soil': {
    title: 'Soil and Worms',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    short: 'Great Lakes Worm Watch',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/soil-and-forest-floor/soil-and-worms',
    checked: '2026-10-21',
  },
  'wormwatch-ecogroups': {
    title: 'Earthworm Ecological Groups',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    short: 'Great Lakes Worm Watch',
    url: 'https://wormwatch.d.umn.edu/worm-id/earthworm-ecological-groups',
    checked: '2026-10-21',
  },
  'wormwatch-vertebrates': {
    title: 'Vertebrate Animals',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    short: 'Great Lakes Worm Watch',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/animals/vertebrate-animals',
    checked: '2026-10-04',
  },
  'wormwatch-invertebrates': {
    title: 'Macroinvertebrate Animals',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    short: 'Great Lakes Worm Watch',
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
    short: 'Hale and others (2005)',
    url: 'https://esajournals.onlinelibrary.wiley.com/doi/abs/10.1890/03-5345',
    checked: '2026-10-04',
  },
  'mnbirdatlas-robin': {
    title: 'American Robin',
    publisher: 'Minnesota Breeding Bird Atlas',
    url: 'https://mnbirdatlas.org/species/american-robin/',
    checked: '2026-10-11',
  },
  'allaboutbirds-robin': {
    title: 'American Robin Life History',
    publisher: 'Cornell Lab of Ornithology, All About Birds',
    short: 'All About Birds',
    url: 'https://www.allaboutbirds.org/guide/American_Robin/lifehistory',
    checked: '2026-10-11',
  },
  'mndnr-woodcock': {
    title: 'American Woodcock',
    publisher: 'Minnesota DNR',
    url: 'https://dnr.state.mn.us/birds/woodcock.html',
    checked: '2026-10-11',
  },
  'adw-woodcock': {
    title: 'Scolopax minor (American woodcock)',
    publisher: 'Animal Diversity Web, University of Michigan',
    short: 'Animal Diversity Web',
    url: 'https://animaldiversity.org/accounts/Scolopax_minor/',
    checked: '2026-10-11',
  },
  'mndnr-moles': {
    title: 'Moles',
    publisher: 'Minnesota DNR',
    url: 'https://www.dnr.state.mn.us/mammals/moles.html',
    checked: '2026-10-11',
  },
  'adw-star-nosed-mole': {
    title: 'Condylura cristata (star-nosed mole)',
    publisher: 'Animal Diversity Web, University of Michigan',
    short: 'Animal Diversity Web',
    url: 'https://animaldiversity.org/accounts/Condylura_cristata/',
    checked: '2026-10-11',
  },
  'csu-nightcrawlers': {
    title: 'Nightcrawlers',
    publisher: 'Colorado State University, Arthropods of Colorado',
    short: 'Colorado State University',
    url: 'https://webdoc.agsci.colostate.edu/bspm/arthropodsofcolorado/Nightcrawlers.pdf',
    checked: '2026-10-21',
  },
  'nuutinen-2014': {
    title: 'Dew-worms in white nights',
    publisher: 'Nuutinen and others, Soil Biology and Biochemistry (2014)',
    short: 'Nuutinen and others (2014)',
    url: 'https://knowledge.lancashire.ac.uk/id/eprint/13694/',
    checked: '2026-10-11',
  },
  'catania-2008': {
    title: 'Worm grunting, fiddling, and charming',
    publisher: 'Catania, PLoS ONE (2008)',
    short: 'Catania (2008)',
    url: 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0003472',
    checked: '2026-10-11',
  },
  'mndnr-shrews': {
    title: 'Shrews',
    publisher: 'Minnesota DNR',
    url: 'https://www.dnr.state.mn.us/mammals/shrews.html',
    checked: '2026-10-12',
  },
  'mndnr-garter-snake': {
    title: 'Common Gartersnake (Thamnophis sirtalis), Snakes and Lizards of Minnesota',
    publisher: 'Minnesota DNR',
    url: 'https://files.dnr.state.mn.us/natural_resources/animals/reptiles_amphibians/snakes/gartersnake_fs.pdf',
    checked: '2026-10-12',
  },
  'mndnr-american-toad': {
    title: 'American toad',
    publisher: 'Minnesota DNR',
    url: 'https://www.dnr.state.mn.us/reptiles_amphibians/frogs_toads/toads/american.html',
    checked: '2026-10-12',
  },
  'adw-red-backed-salamander': {
    title: 'Plethodon cinereus (Eastern Red-backed Salamander)',
    publisher: 'Animal Diversity Web, University of Michigan',
    short: 'Animal Diversity Web',
    url: 'https://animaldiversity.org/accounts/Plethodon_cinereus/',
    checked: '2026-10-12',
  },
  'msu-robins-hear': {
    title: 'Can robins hear worms?',
    publisher: 'Montana State University Library, Acoustic Atlas',
    short: 'Montana State University',
    url: 'https://www.lib.montana.edu/acoustic-atlas/acoustic-atlas-blog/posts/can-robins-hear-worms.html',
    checked: '2026-10-12',
  },
  'journeynorth-robin-tug': {
    title: 'Robin: Tugging Out Worms',
    publisher: 'Journey North',
    url: 'https://journeynorth.org/tm/robin/tug_out_worms2.html',
    checked: '2026-10-12',
  },
  'allaboutbirds-woodcock': {
    title: 'American Woodcock Life History',
    publisher: 'Cornell Lab of Ornithology, All About Birds',
    short: 'All About Birds',
    url: 'https://www.allaboutbirds.org/guide/American_Woodcock/lifehistory',
    checked: '2026-10-12',
  },
  'scott-2023': {
    title: 'Non-native earthworms increase the abundance and diet quality of a common woodland salamander in its northern range',
    publisher: 'Scott, Bradley and Bourgault, Biological Invasions (2023)',
    short: 'Scott and others (2023)',
    url: 'https://link.springer.com/article/10.1007/s10530-023-03168-3',
    checked: '2026-10-12',
  },
  'mndnr-redbelly-snake': {
    title: 'Redbelly Snake',
    publisher: 'Minnesota DNR',
    url: 'https://www.dnr.state.mn.us/reptiles_amphibians/redbellysnake.html',
    checked: '2026-10-12',
  },
  'uw-ground-beetles': {
    title: 'Ground Beetles (Carabidae)',
    publisher: 'University of Wisconsin–Madison Extension',
    short: 'UW–Madison Extension',
    url: 'https://hort.extension.wisc.edu/articles/ground-beetles/',
    checked: '2026-10-12',
  },
  'esb-cut-in-two': {
    title: 'If I cut an earthworm in two will it grow into two earthworms?',
    publisher: 'Earthworm Society of Britain',
    url: 'https://www.earthwormsoc.org.uk/FAQchop',
    checked: '2026-10-21',
  },
  // V4 nest scene: the Cornell Lab's live robin nest cam talk. Its captions show "Adult robin flies
  // in and lands on the nest with worms in its beak" and feeding the three nestlings, and the
  // NestWatch speaker says robins eat "earthworms and other small, soft insects", feeding chicks more
  // whole insects as they grow. Journey North's "Baby Robins" (Laura Erickson) says the same plainly:
  // "By five days of age, the nestlings get earthworms that parents break into small mouthfuls."
  'cornell-robin-nestcam': {
    title: "Questions About Nesting Birds? Live From A Robin's Nest, We've Got Answers",
    publisher: 'Cornell Lab of Ornithology, Bird Academy',
    short: 'Cornell Lab',
    url: 'https://academy.allaboutbirds.org/live-event/questions-about-nesting-birds-live-from-a-robins-nest-weve-got-answers/',
    checked: '2026-10-21',
  },
  'wormwatch-trees': {
    title: 'Trees',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    short: 'Great Lakes Worm Watch',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/plants/trees',
    checked: '2026-10-21',
  },
  'sciencelearn-earthworm': {
    title: 'Inside of an earthworm',
    publisher: 'Science Learning Hub, University of Waikato',
    short: 'Science Learning Hub',
    url: 'https://www.sciencelearn.org.nz/image_maps/24-inside-of-an-earthworm',
    checked: '2026-10-21',
  },
  'usbg-earthworms': {
    title: 'Earthworms Science Page: Earthworms are adapted for living in soil',
    publisher: 'United States Botanic Garden',
    short: 'U.S. Botanic Garden',
    url: 'https://www.usbg.gov/sites/default/files/images/earthworm_science_page.pdf',
    checked: '2026-10-21',
  },
  'esb-biology': {
    title: 'Earthworm Biology',
    publisher: 'Earthworm Society of Britain',
    url: 'https://www.earthwormsoc.org.uk/earthworm-biology',
    checked: '2026-10-21',
  },
  'esb-food': {
    title: 'What do earthworms eat?',
    publisher: 'Earthworm Society of Britain',
    url: 'https://www.earthwormsoc.org.uk/node/61',
    checked: '2026-10-21',
  },
  'carolina-dissection': {
    title: 'Earthworm Dissection',
    publisher: 'Carolina Biological Supply Company',
    short: 'Carolina Biological',
    url: 'https://knowledge.carolina.com/discipline/life-science/anatomy-and-physiology/earthworm-dissection/',
    checked: '2026-10-22',
  },
  'hst-dissection': {
    title: 'Earthworm Dissection Guide',
    publisher: 'Home Science Tools Learning Center',
    short: 'Home Science Tools',
    url: 'https://learning-center.homesciencetools.com/article/earthworm-dissection/',
    checked: '2026-10-22',
  },
  'purdue-corn-leaves': {
    title: 'Do Earthworms Eat Corn Leaves?',
    publisher: 'Purdue University Extension, Pest&Crop newsletter',
    short: 'Purdue Extension',
    url: 'https://extension.entm.purdue.edu/newsletters/pestandcrop/article/do-earthworms-eat-corn-leaves',
    checked: '2026-10-23',
  },
  'naturewatch-wormfacts': {
    title: 'Worm facts',
    publisher: 'WormWatch, NatureWatch Canada',
    short: 'NatureWatch',
    url: 'https://www.naturewatch.ca/wormwatch/how-to-guide/worm-facts/',
    checked: '2026-10-23',
  },
  'sciencelearn-outside': {
    title: 'Outside of an earthworm',
    publisher: 'Science Learning Hub, University of Waikato',
    short: 'Science Learning Hub',
    url: 'https://www.sciencelearn.org.nz/image_maps/27-outside-of-an-earthworm',
    checked: '2026-10-23',
  },
  'lander-lumbricus': {
    title: 'Lumbricus terrestris (Invertebrate Anatomy OnLine)',
    publisher: 'Richard Fox, Lander University',
    short: 'Lander University',
    url: 'https://lanwebs.lander.edu/faculty/rsfox/invertebrates/lumbricus.html',
    checked: '2026-10-23',
  },
  'naturespot-terrestris': {
    title: 'Lumbricus terrestris (Common Earthworm)',
    publisher: 'NatureSpot',
    short: 'NatureSpot',
    url: 'https://www.naturespot.org/node/2100',
    checked: '2026-10-23',
  },
  'smith-1917': {
    title: 'North American Earthworms of the Family Lumbricidae in the Collections of the United States National Museum',
    publisher: 'Frank Smith, Proceedings of the U.S. National Museum (Smithsonian)',
    short: 'Smithsonian',
    url: 'https://repository.si.edu/server/api/core/bitstreams/cf771886-b7c0-4fde-9b42-d442bc41c98e/content',
    checked: '2026-10-23',
  },
};

/** The name to show under a fact: the short name if the source has one. */
export function sourceName(id: SourceId): string {
  return SOURCES[id].short ?? SOURCES[id].publisher;
}
