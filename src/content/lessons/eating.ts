import type { Lesson } from './lesson';

/**
 * "How do worms eat?": V4's topic (Matt, 2026-10-21): eating and getting energy, with some worm
 * anatomy. The hook ties it to V4's robin: the food (fallen leaves) is up top, and that is where
 * robins hunt. Facts and their exact supporting sentences are in docs/codev/research/eating.md
 * (checked 2026-10-21).
 *
 * Careful with the leaf order: Worm Watch's ranking (basswood, then sugar maple, then oak) is for
 * nightcrawlers, so the cards say nightcrawlers. The body tour's diagram is a drawing made in code,
 * labelled as one; the photos are real (CC BY 4.0 from iNaturalist, credited on screen).
 */
export const EATING: Lesson = {
  id: 'eating',
  title: 'How do worms eat?',
  steps: [
    {
      // The round's form asks this same question again, word for word (/mnt/project-files/v4/v4-google-form.md).
      kind: 'guess',
      title: 'Guess first!',
      question: 'An earthworm grabs a bite of leaf. How does it break the leaf into tiny bits?',
      options: ['It chews it with tiny teeth', 'It grinds it inside its body, with bits of sand', 'It sucks out the juice and leaves the rest'],
      answer: 1,
      reveal: [
        {
          kind: 'fact',
          text: 'Earthworms have no teeth. A strong muscle inside them, the gizzard, grinds food up with grains of sand and soil.',
          source: 'sciencelearn-earthworm',
          verified: true,
        },
      ],
    },
    {
      kind: 'story',
      title: 'A forest full of food',
      lines: [
        {
          kind: 'fact',
          text: 'Without worms, fallen leaves break down slowly. They pile up into a thick, spongy layer called duff.',
          source: 'mndnr-earthworms',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'Invading earthworms eat the leaves that make the duff.',
          source: 'mndnr-earthworms',
          verified: true,
        },
        { kind: 'ui', text: 'To a worm like you, that leaf layer is dinner.' },
      ],
      photo: {
        file: 'nightcrawler',
        name: 'Nightcrawler',
        alt: 'A pink-brown nightcrawler with an orange band on its body lies among dead brown leaves on dark soil at night, next to a coin.',
        credit: 'Photo: Jay Maudsley, iNaturalist, CC BY 4.0',
      },
    },
    {
      kind: 'sense',
      title: 'Food up top',
      cue: 'robin',
      scene: 'It\'s early morning. You stretch out of your burrow, reaching for one more leaf.',
      cueText: 'A shadow sweeps over you. Then hop, hop, hop… stop. Something big is standing very still, right next to you.',
      question: 'Why does a worm come up here at all, when hunters are around?',
      options: ['To get food: fallen leaves', 'To get a drink of water', 'To warm up in the sun'],
      answer: 0,
      reveal: [
        {
          kind: 'fact',
          text: 'Nightcrawlers come up on damp nights to find food. They drag bits of dead plants down into their burrow to eat.',
          source: 'csu-nightcrawlers',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'They rarely leave the burrow all the way. They search as far as their stretched-out body can reach.',
          source: 'csu-nightcrawlers',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'Robins often find worms by standing still and staring at the ground with their head tipped to one side.',
          source: 'allaboutbirds-robin',
          verified: true,
        },
        { kind: 'ui', text: 'The food is up top. So are the hunters.' },
      ],
      more: {
        title: 'Leaf piles called middens',
        lines: [
          {
            kind: 'fact',
            text: 'As a nightcrawler pulls leaves down into its burrow, the leaf stems pile up at the opening.',
            source: 'wormwatch-ecogroups',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'It also leaves its poop, called casts, around the opening. This pile of casts and leaf bits is called a midden.',
            source: 'wormwatch-ecogroups',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Each burrow has just one nightcrawler, so counting middens is a way to count the worms.',
            source: 'wormwatch-ecogroups',
            verified: true,
          },
        ],
        video: { title: 'Worms pull leafs underground to eat them.', channel: 'Get Wild', url: 'https://www.youtube.com/watch?v=00GpoMJWt1s' },
      },
      photo: {
        file: 'robin',
        name: 'American robin',
        alt: 'An American robin stands in green grass holding a pink earthworm in its yellow beak.',
        credit: 'Photo: Emily Bradford, iNaturalist, CC BY 4.0',
      },
    },
    {
      kind: 'body',
      title: 'Follow the leaf',
      intro: 'Watch a nightcrawler eat: first from outside, then from inside its body.',
      outside: {
        kind: 'fact',
        text: 'On damp nights, a nightcrawler reaches out of its burrow and drags bits of dead leaves into it to eat.',
        source: 'csu-nightcrawlers',
        verified: true,
      },
      stops: [
        {
          part: 'mouth',
          name: 'Mouth',
          fact: {
            kind: 'fact',
            text: 'The mouth is in the first segment. A fleshy lobe on top can close the mouth or reach out to feel around.',
            source: 'esb-biology',
            verified: true,
          },
        },
        {
          part: 'pharynx',
          name: 'Pharynx',
          fact: {
            kind: 'fact',
            text: 'The worm pushes its pharynx out of its mouth to grab food. Then it pulls the food back in and wets it with spit.',
            source: 'sciencelearn-earthworm',
            verified: true,
          },
        },
        {
          part: 'crop',
          name: 'Crop',
          fact: {
            kind: 'fact',
            text: 'The crop stores the food for a short time.',
            source: 'usbg-earthworms',
            verified: true,
          },
        },
        {
          part: 'gizzard',
          name: 'Gizzard',
          fact: {
            kind: 'fact',
            text: 'Worms have no teeth. In the gizzard, strong muscles and grains of sand grind the food up.',
            source: 'sciencelearn-earthworm',
            verified: true,
          },
        },
        {
          part: 'intestine',
          name: 'Intestine',
          fact: {
            kind: 'fact',
            text: 'In the intestine, digestive juices break the food down so the body can take it in.',
            source: 'sciencelearn-earthworm',
            verified: true,
          },
        },
        {
          part: 'casts',
          name: 'Back end',
          fact: {
            kind: 'fact',
            text: 'What is left comes out of the back end. Worm poop is called casts.',
            source: 'usbg-earthworms',
            verified: true,
          },
        },
      ],
      midden: {
        kind: 'fact',
        text: 'Leaf stems and casts pile up around the burrow. This pile is called a midden.',
        source: 'wormwatch-ecogroups',
        verified: true,
      },
      more: {
        title: 'More of your body',
        lines: [
          {
            kind: 'fact',
            text: 'Most earthworms have five "hearts" that pump blood around the body.',
            source: 'sciencelearn-earthworm',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Just behind the pharynx, five loops (the hearts) wrap around the esophagus, the tube that leads to the crop.',
            source: 'hst-dissection',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'The intestine is one long tube, from the gizzard all the way to the back end.',
            source: 'hst-dissection',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Thin walls called septa separate the worm\'s segments inside.',
            source: 'carolina-dissection',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'An earthworm breathes through its thin skin.',
            source: 'usbg-earthworms',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Its skin has to stay damp, or the worm dries out.',
            source: 'esb-biology',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Every segment but the first has eight tiny bristles that help the worm grip.',
            source: 'esb-biology',
            verified: true,
          },
        ],
        video: { title: 'Earthworm digestive system', channel: 'MooMooMath and Science', url: 'https://www.youtube.com/watch?v=K8rAvIf5GZQ' },
      },
    },
    {
      kind: 'meet',
      title: 'Picky eaters',
      intro: 'Nightcrawlers are picky about leaves. Tap "Find out" on each one.',
      cards: [
        {
          name: 'Basswood',
          photo: {
            file: 'basswood',
            name: 'Basswood leaf',
            alt: 'One big, heart-shaped basswood leaf with a toothed edge, bright green in the sun.',
            credit: 'Photo: Carolyn Koehn, iNaturalist, CC BY 4.0',
          },
          fact: {
            kind: 'fact',
            text: 'Nightcrawlers eat basswood leaves first.',
            source: 'wormwatch-trees',
            verified: true,
          },
        },
        {
          name: 'Sugar maple',
          photo: {
            file: 'sugar-maple',
            name: 'Sugar maple leaves',
            alt: 'Red-orange sugar maple leaves with pointed lobes on a branch in fall.',
            credit: 'Photo: Sam Kieschnick, iNaturalist, CC BY 4.0',
          },
          fact: {
            kind: 'fact',
            text: 'Sugar maple leaves come next.',
            source: 'wormwatch-trees',
            verified: true,
          },
        },
        {
          name: 'Red oak',
          photo: {
            file: 'red-oak',
            name: 'Red oak leaf',
            alt: 'A fallen brown red oak leaf with pointed lobes lying on white snow.',
            credit: 'Photo: Norma Malinowski, iNaturalist, CC BY 4.0',
          },
          fact: {
            kind: 'fact',
            text: 'Oak leaves get eaten last, once the others are gone.',
            source: 'wormwatch-trees',
            verified: true,
          },
        },
        {
          name: 'White pine',
          photo: {
            file: 'white-pine',
            name: 'White pine cone and needles',
            alt: 'A white pine cone lying on a thick mat of fallen orange-brown pine needles.',
            credit: 'Photo: Bria Abeles-Allison, iNaturalist, CC BY 4.0',
          },
          fact: {
            kind: 'fact',
            text: 'Worms don\'t like to eat needles from trees like pines. So pine forests may hold the fewest worms.',
            source: 'wormwatch-trees',
            verified: true,
          },
        },
      ],
      more: {
        title: 'Not just leaves',
        lines: [
          {
            kind: 'fact',
            text: 'Scientists found that this order matches how healthy each kind of leaf is to eat.',
            source: 'wormwatch-trees',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Earthworms eat dead and rotting plants and animals. They may even like eating fungi best.',
            source: 'esb-food',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'One kind of worm lives only in the leaf layer. It eats mostly the fungi and bacteria growing there.',
            source: 'wormwatch-ecogroups',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Other worms swallow soil. They digest the bits of dead plants and tiny living things in it.',
            source: 'wormwatch-ecogroups',
            verified: true,
          },
        ],
        video: { title: 'Worms! - time lapse footage of Rothamsted wormery', channel: 'AHDB Cereals & Oilseeds', url: 'https://www.youtube.com/watch?v=oYSrOSKDSH8' },
      },
    },
    {
      kind: 'predict',
      title: 'Big appetite',
      question: 'A forest has lots of nightcrawlers. How many of the leaves that fall each year can they eat?',
      options: ['Just a few', 'About half', 'All of them'],
      answer: 2,
      reveal: [
        {
          kind: 'fact',
          text: 'Lots of nightcrawlers can eat all the leaves that fall in a forest in a year.',
          source: 'wormwatch-ecogroups',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'New leaves get eaten fast, so the thick leaf layer never builds back up.',
          source: 'wormwatch-soil',
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
          text: 'Where worms move in, they eat the leaf layer and mix it into the soil below.',
          source: 'wormwatch-soil',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'Big trees survive. But many tree seedlings, ferns and wildflowers that grow in the duff don\'t make it.',
          source: 'mndnr-earthworms',
          verified: true,
        },
        {
          kind: 'fact',
          text: 'Robins depend on earthworms. Where worms spread, robins could spread too.',
          source: 'mnbirdatlas-robin',
          verified: true,
        },
        { kind: 'ui', text: 'Some species win and some lose.' },
      ],
      more: {
        title: 'Worms and the soil',
        lines: [
          {
            kind: 'fact',
            text: 'In a forest with worms, the new top layer of soil is made mostly of worm casts.',
            source: 'wormwatch-soil',
            verified: true,
          },
          {
            kind: 'fact',
            text: 'Worms let the plant food in leaves out faster than plants can use it. In the end, plants have less of some foods they need.',
            source: 'wormwatch-soil',
            verified: true,
          },
        ],
        video: { title: 'Great Lakes Worm Watch: Invasive Earthworms', channel: 'UMN Natural Resources Research Institute', url: 'https://www.youtube.com/watch?v=BpMvZCeep54' },
      },
    },
    {
      // Game design thinking (Matt, 2026-10-21, from Liz England's "The Door Problem"): designers
      // ask lots of small questions about one thing, then decide, and know why. These questions
      // match the form's design section (docs/codev/game-design-thinking.md). No claims here.
      kind: 'story',
      title: 'Think like a game designer',
      lines: [
        { kind: 'ui', text: 'Game designers ask lots of questions, then decide. Even a door in a game needs answers: Can you open it? How do you know? What happens next?' },
        { kind: 'ui', text: 'Your worm needs food. So ask: What can my worm eat, and how do I know it\'s food?' },
        { kind: 'ui', text: 'How does my worm eat it? What happens when it eats, or when it doesn\'t?' },
        { kind: 'ui', text: 'Should it work like a real worm, or be changed to be more fun? Why?' },
        { kind: 'ui', text: 'Who is the game for? What makes you and your classmates want to keep playing?' },
      ],
    },
    {
      kind: 'mission',
      title: 'Your mission',
      notice: { kind: 'ui', text: 'Mission: Play like a game designer. Look for food your worm could eat, and notice where it is. Then decide how eating should work in the game, and why.' },
      short: { kind: 'ui', text: 'Mission: Find food to eat.' },
      reminder: { kind: 'ui', text: 'After you play, your last quest is to vote in the Google Form.' },
    },
  ],
};
