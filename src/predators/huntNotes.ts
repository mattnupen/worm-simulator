import { TEXT, shown, type Line } from '../content/text';
import { sourceName } from '../content/sources';

/** A line as the hunt's note shows it: a fact names its source after it. */
function noted(line: Line): string {
  return line.kind === 'fact' ? `${line.text} (${sourceName(line.source)})` : shown(line);
}

const tired = noted(TEXT.huntTired);

/**
 * The hunt's notes (V4 spec 2 and 3), each put together once at load so a step never builds a
 * string. Every line comes from src/content/text.ts.
 */
export const HUNT_NOTES = {
  /** After the first grab of a life: why the robin has to tug. */
  grip: noted(TEXT.huntGripFact),
  escaped: noted(TEXT.huntEscaped),
  broke: noted(TEXT.huntBroke),
  tooShort: noted(TEXT.huntTooShort),
  taken: noted(TEXT.huntTaken),
  /** The same endings when the energy ran out. */
  brokeTired: `${tired} ${noted(TEXT.huntBroke)}`,
  tooShortTired: `${tired} ${noted(TEXT.huntTooShort)}`,
  takenTired: `${tired} ${noted(TEXT.huntTaken)}`,
} as const;
