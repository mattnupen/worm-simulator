import type { Lesson } from './lesson';

/**
 * "Who eats worms?": the predators topic students chose. Facts and their exact supporting
 * sentences are in docs/codev/research/predators.md (checked 2026-10-11).
 *
 * Careful with the mole: the famous "worms flee up from a digging mole" study (Catania 2008) was a
 * native Florida worm, not the nightcrawler. A nightcrawler's sourced escape is the other way:
 * zipping back down its burrow. The lesson teaches that contrast; a game that has nightcrawlers
 * flee up must label it "Game choice".
 *
 * Photos are real (Matt, 2026-10-12): CC BY 4.0 from iNaturalist, credited on screen. Their pages
 * are in docs/codev/research/predators.md.
 */
export const PREDATORS: Lesson = {
  id: 'predators',
  title: 'Who eats worms?',
  steps: [
    {
      kind: 'story',
      title: 'A new snack in the forest',
      lines: [
        {
          kind: 'fact',
          text: 'For about 11,000 years after the glaciers melted, Minnesota\'s forests grew with no earthworms at all.',
          source: 'mndnr-earthworms',
          verified: true,
        },
        { kind: 'ui', text: 'Now worms like you live here. And some animals have found a new snack.' },
      ],
    },
    {
      kind: 'sense',
      title: 'Something is hunting',
      cue: 'robin',
      scene: 'It\'s morning. You poke your front end out of your burrow to grab a leaf.',
      cueText: 'A shadow sweeps over you. Then hop, hop, hop… stop. Something big is standing very still, right next to you.',
      question: 'It found you without touching the ground. How?',
      options: ['By looking and listening', 'By smelling you', 'By feeling the ground shake'],
      reveal: [
        {
          kind: 'fact',
          text: 'Robins often find worms by standing still and staring at the ground with their head tipped to one side.',
          source: 'allaboutbirds-robin',
          verified: true,
        },
      ],
      photo: {
        file: 'robin',
        name: 'American robin',
        alt: 'An American robin stands in green grass holding a pink earthworm in its yellow beak.',
        credit: 'Photo: Emily Bradford, iNaturalist, CC BY 4.0',
      },
    },
    {
      kind: 'predict',
      title: 'The worm-eating bird',
      question: 'This is a woodcock. It lives in the woods of northeastern Minnesota. How much of its food do you think is earthworms?',
      options: ['Just a little', 'About half, or even more', 'None at all'],
      reveal: [
        {
          kind: 'fact',
          text: 'Earthworms are about half to almost all (50 to 90 percent) of a woodcock\'s food.',
          source: 'adw-woodcock',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'A woodcock pushes its long bill into the soil. The bill can feel a worm moving underground.',
          source: 'mndnr-woodcock',
          verified: true,
        },
      ],
      photo: {
        file: 'woodcock',
        name: 'American woodcock',
        alt: 'An American woodcock, a round brown bird with a very long bill, stands on dead leaves and pine needles on the forest floor.',
        credit: 'Photo: M. R. Spiegelman, iNaturalist, CC BY 4.0',
      },
    },
    {
      kind: 'sense',
      title: 'Something is digging',
      cue: 'thump',
      cueText: 'The ground shakes under you: thump, thump, thump.',
      question: 'You are a nightcrawler with your tail in your burrow. What do you do?',
      options: ['Zip back down my burrow', 'Crawl up and out', 'Stay perfectly still'],
      photo: {
        file: 'mole',
        name: 'Star-nosed mole',
        alt: 'A star-nosed mole seen from above, with a pink star-shaped nose of 22 fleshy tentacles and two big pink paws for digging.',
        credit: 'Photo: Dan MacNeal, iNaturalist, CC BY 4.0',
      },
      reveal: [
        {
          kind: 'fact',
          text: 'When a nightcrawler is disturbed, it pulls back down into its burrow very fast.',
          source: 'csu-nightcrawlers',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'The star-nosed mole\'s nose is a star of 22 fleshy fingers. It may have the best sense of touch of any mammal.',
          source: 'adw-star-nosed-mole',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'In a Florida forest, a different kind of worm does the opposite: it crawls up out of the ground when a mole digs nearby.',
          source: 'catania-2008',
          verified: true,
        },
      ],
    },
    {
      kind: 'sort',
      title: 'Who else hunts worms?',
      question: 'Birds and moles aren\'t the only hunters. For each animal, guess: does it eat worms?',
      groups: ['Eats worms', 'Does not eat worms'],
      cards: [
        {
          name: 'Northern short-tailed shrew',
          group: 0,
          photo: {
            file: 'shrew',
            name: 'Northern short-tailed shrew',
            alt: 'A dark gray northern short-tailed shrew with tiny eyes and a pointed snout creeps through grass and dead leaves.',
            credit: 'Photo: Dustin Snider, iNaturalist, CC BY 4.0',
          },
          fact: {
            kind: 'fact',
            text: 'Shrews live all over Minnesota. They eat insects, earthworms, and even small mammals.',
            source: 'mndnr-shrews',
            verified: true,
          },
        },
        {
          name: 'Common garter snake',
          group: 0,
          photo: {
            file: 'garter-snake',
            name: 'Common garter snake',
            alt: 'A common garter snake, black with yellow stripes, lies coiled on dead leaves on the forest floor.',
            credit: 'Photo: Daniella Marie, iNaturalist, CC BY 4.0',
          },
          fact: {
            kind: 'fact',
            text: 'Garter snakes eat frogs, toads, salamanders, earthworms, insects and fish.',
            source: 'mndnr-garter-snake',
            verified: true,
          },
        },
        {
          name: 'American toad',
          group: 0,
          photo: {
            file: 'toad',
            name: 'American toad',
            alt: 'A bumpy brown American toad with golden eyes sits on a rock beside wet mud and grass.',
            credit: 'Photo: Liren Varghese, iNaturalist, CC BY 4.0',
          },
          fact: {
            kind: 'fact',
            text: 'The American toad is the most common toad in Minnesota. It eats insects, worms and snails.',
            source: 'mndnr-american-toad',
            verified: true,
          },
        },
        {
          name: 'Red-backed salamander',
          group: 0,
          photo: {
            file: 'salamander',
            name: 'Eastern red-backed salamander',
            alt: 'A small, thin eastern red-backed salamander with a reddish-orange stripe down its dark back crawls across a rotting log.',
            credit: 'Photo: Rose Zappa, iNaturalist, CC BY 4.0',
          },
          fact: {
            kind: 'fact',
            text: 'Red-backed salamanders eat spiders, insects, snails, earthworms and other small animals.',
            source: 'adw-red-backed-salamander',
            verified: true,
          },
        },
      ],
    },
    {
      kind: 'sense',
      title: 'Safe time to feed',
      cue: 'shadow',
      cueText: 'A bird\'s shadow passes over the leaves.',
      question: 'When do you think nightcrawlers come up to feed?',
      options: ['On sunny afternoons', 'On dark, damp nights', 'Any time at all'],
      reveal: [
        {
          kind: 'fact',
          text: 'Nightcrawlers come up to feed on damp nights, and they rarely leave their burrow all the way.',
          source: 'csu-nightcrawlers',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'In one study, light at night cut the number of nightcrawlers coming up by about half.',
          source: 'nuutinen-2014',
          verified: true,
        },
      ],
    },
    {
      kind: 'story',
      title: 'The forest changed',
      lines: [
        {
          kind: 'fact',
          text: 'Robins depend on earthworms. Where worms spread, robins could spread too.',
          source: 'mnbirdatlas-robin',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'Scientists are finding that worms may help salamanders in some ways and hurt them in others.',
          source: 'wormwatch-vertebrates',
          verified: true,
        },
        { kind: 'ui', text: 'Some species win and some lose.' },
      ],
    },
    {
      kind: 'mission',
      title: 'Your mission',
      notice: { kind: 'ui', text: 'While you play, notice: where could your worm hide from a robin, a woodcock or a mole?' },
      reminder: { kind: 'ui', text: 'After you play, your last quest is to vote in the Google Form from Canvas.' },
    },
  ],
};
