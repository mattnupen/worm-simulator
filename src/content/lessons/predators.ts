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
      // The round's form asks this same question again, word for word (docs/codev/versions/v03-predators.md).
      kind: 'guess',
      title: 'Guess first!',
      question: 'Early in the morning, a nightcrawler is partly out of its burrow. A robin hops close. What does the nightcrawler do?',
      options: ['It pulls back down its burrow fast', 'It crawls out and wiggles away', 'It stays still on top of the ground'],
      answer: 0,
      reveal: [
        {
          kind: 'fact',
          text: 'When a nightcrawler is disturbed, it pulls back down into its burrow very fast.',
          source: 'csu-nightcrawlers',
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
      answer: 0,
      reveal: [
        {
          kind: 'fact',
          text: 'Robins often find worms by standing still and staring at the ground with their head tipped to one side.',
          source: 'allaboutbirds-robin',
          verified: true,
        },
      ],
      more: {
        title: 'How robins hunt',
        lines: [
          {
            kind: 'fact',
            text: 'In an experiment, robins could find hidden worms just by listening. They found fewer when they couldn\'t hear.',
            source: 'msu-robins-hear',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'A worm holds on with tiny bristles called setae, so a robin has to tug hard to pull it out.',
            source: 'journeynorth-robin-tug',
            verified: true,
          },
        ],
        video: { title: 'Nature\'s Tug of War: Bird vs. Worm', channel: 'NEWS CENTER Maine', url: 'https://www.youtube.com/watch?v=suvWIkHZdeo' },
      },
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
      answer: 1,
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
      more: {
        title: 'How woodcocks hunt',
        lines: [
          {
            kind: 'fact',
            text: 'The tip of a woodcock\'s bill can bend, so it can grab a worm deep in the soil.',
            source: 'allaboutbirds-woodcock',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Woodcocks sometimes rock back and forth as they walk. The shaking may make worms move underground.',
            source: 'allaboutbirds-woodcock',
            verified: true,
          },
        ],
        video: { title: 'American Woodcock foraging', channel: 'Cornell Lab of Ornithology', url: 'https://www.youtube.com/watch?v=swHtEAEfGXM' },
      },
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
      scene: 'You are a nightcrawler, resting at the top of your burrow.',
      cueText: 'The ground shakes under you: thump, thump, thump.',
      question: 'What do you do?',
      options: ['Zip back down my burrow', 'Crawl up and out', 'Stay perfectly still'],
      answer: 0,
      more: {
        title: 'Shaking the ground',
        lines: [
          {
            kind: 'fact',
            text: 'Wood turtles and herring gulls shake the ground to make worms come up.',
            source: 'catania-2008',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'In Florida, people collect bait worms by rubbing a stake stuck in the ground. Scientists found this feels like a digging mole, so the worms flee up.',
            source: 'catania-2008',
            verified: true,
          },
        ],
        video: { title: 'This weird trick will help you summon an army of worms', channel: 'TED-Ed', url: 'https://www.youtube.com/watch?v=RDA64eUoxag' },
      },
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
      kind: 'meet',
      title: 'More worm hunters',
      intro: 'Birds and moles aren\'t the only hunters. Tap "Find out" to meet four more.',
      more: {
        title: 'Even more worm eaters',
        lines: [
          {
            kind: 'fact',
            text: 'The redbelly snake lives all over Minnesota. It eats insects, earthworms and slugs.',
            source: 'mndnr-redbelly-snake',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Many ground beetles hunt at night, and earthworms are common prey for them.',
            source: 'uw-ground-beetles',
            verified: true,
          },
        ],
      },
      cards: [
        {
          name: 'Northern short-tailed shrew',
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
      scene: 'You stretch out of your burrow, looking for a leaf to eat.',
      cueText: 'A bird\'s shadow passes over the leaves.',
      question: 'When do you think nightcrawlers come up to feed?',
      options: ['On sunny afternoons', 'On dark, damp nights', 'Any time at all'],
      answer: 1,
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
        {
          kind: 'fact',
          text: 'Adult salamanders can eat worms, a new food that can help them have more young.',
          source: 'wormwatch-vertebrates',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'But worms also eat the damp layer of fallen leaves where salamanders hide and hunt.',
          source: 'scott-2023',
          verified: true,
        },
        { kind: 'ui', text: 'Some species win and some lose.' },
      ],
      more: {
        title: 'Worms and salamanders',
        lines: [
          {
            kind: 'fact',
            text: 'Salamanders have no lungs. They breathe through their skin, which has to stay damp.',
            source: 'wormwatch-vertebrates',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'The leaf layer keeps the ground damp and gives salamanders cover. Worms eat that layer, so the forest floor gets thinner.',
            source: 'scott-2023',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Young salamanders can\'t eat worms. The tiny bugs they eat can drop a lot when worms move in.',
            source: 'wormwatch-vertebrates',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'In Quebec, Canada, forests with more worms had more salamanders, and bigger ones. Worms were most of their food there.',
            source: 'scott-2023',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'So scientists are still working it out: in some forests worms help salamanders, and in others they hurt them.',
            source: 'wormwatch-vertebrates',
            verified: true,
          },
        ],
        video: { title: 'All Minnesota worms are invasive, but which ones do you need to worry about?', channel: 'WCCO - CBS Minnesota', url: 'https://www.youtube.com/watch?v=uc4WfLa4vsk' },
      },
    },
    {
      kind: 'mission',
      title: 'Your mission',
      notice: { kind: 'ui', text: 'Mission: Think about which predators are hunting in this forest, and how your worm senses them and escapes being eaten.' },
      short: { kind: 'ui', text: 'Mission: Escape the predators!' },
      reminder: { kind: 'ui', text: 'After you play, your last quest is to vote in the Google Form.' },
    },
  ],
};
