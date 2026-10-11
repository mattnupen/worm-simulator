import type { Lesson } from './lesson';

/**
 * "Who eats worms?": the predators topic students chose. Facts and their exact supporting
 * sentences are in docs/codev/research/predators.md (checked 2026-10-11).
 *
 * Careful with the mole: the famous "worms flee up from a digging mole" study (Catania 2008) was a
 * native Florida worm, not the nightcrawler. A nightcrawler's sourced escape is the other way:
 * zipping back down its burrow. The lesson teaches that contrast; a game that has nightcrawlers
 * flee up must label it "Game choice".
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
      kind: 'sort',
      title: 'How do they find you?',
      question: 'Tap each hunter: does it find worms mostly by looking and listening, or by feeling and touching?',
      groups: ['Looks and listens', 'Feels and touches'],
      cards: [
        {
          name: 'American robin',
          group: 0,
          fact: {
            kind: 'fact',
            text: 'Robins often find worms by standing still and staring at the ground with their head tipped to one side.',
            source: 'allaboutbirds-robin',
            verified: true,
          },
        },
        {
          name: 'American woodcock',
          group: 1,
          fact: {
            kind: 'fact',
            text: 'A woodcock pushes its long bill into the soil. The bill can feel a worm moving underground.',
            source: 'mndnr-woodcock',
            verified: true,
          },
        },
        {
          name: 'Star-nosed mole',
          group: 1,
          fact: {
            kind: 'fact',
            text: 'Its nose is a star of 22 fleshy fingers. It may have the best sense of touch of any mammal.',
            source: 'adw-star-nosed-mole',
            verified: true,
          },
        },
      ],
    },
    {
      kind: 'predict',
      title: 'The worm-eating bird',
      question: 'Woodcocks live in the woods of northeastern Minnesota. How much of a woodcock\'s food do you think is earthworms?',
      options: ['Just a little', 'About half, or even more', 'None at all'],
      reveal: [
        {
          kind: 'fact',
          text: 'Earthworms are about half to almost all (50 to 90 percent) of a woodcock\'s food.',
          source: 'adw-woodcock',
          verified: true,
        },
      ],
    },
    {
      kind: 'sense',
      title: 'Something is digging',
      cue: 'thump',
      cueText: 'The ground shakes under you: thump, thump, thump.',
      question: 'You are a nightcrawler with your tail in your burrow. What do you do?',
      options: ['Zip back down my burrow', 'Crawl up and out', 'Stay perfectly still'],
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
      reminder: { kind: 'ui', text: 'Then open the Google Form from Canvas to vote and share your design ideas.' },
    },
  ],
};
