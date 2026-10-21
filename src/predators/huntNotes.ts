import { TEXT, shown, type Line } from '../content/text';
import { sourceName } from '../content/sources';

/** A line as the hunt's note shows it: a fact names its source after it. */
function noted(line: Line): string {
  return line.kind === 'fact' ? `${line.text} (${sourceName(line.source)})` : shown(line);
}

/**
 * The hunt's notes (V4 spec 2 and 3), each put together once at load so a step never builds a
 * string. Every line comes from src/content/text.ts.
 */
export const HUNT_NOTES = {
  /** The first grab of a life: why the robin has to tug, and the timing game's label. */
  grip: `${noted(TEXT.huntGripFact)} ${noted(TEXT.huntTimingChoice)}`,
  escaped: noted(TEXT.huntEscaped),
  broke: noted(TEXT.huntBroke),
  tooShort: `${noted(TEXT.huntTooShort)} ${noted(TEXT.huntNewLife)}`,
  taken: `${noted(TEXT.huntTaken)} ${noted(TEXT.huntNewLife)}`,
} as const;
