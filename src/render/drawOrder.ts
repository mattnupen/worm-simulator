/**
 * Opaque draw order (three sorts by renderOrder before depth). The top of the litter is drawn after
 * everything lying on it, so the depth test skips ground pixels the leaves already cover; the worm's
 * pocket (V2 spec 8.2: the worm, the leaves round it and the floor under them, all below the top of
 * the litter) is drawn after the top, so the depth test skips all of it but what the hole shows.
 */
/** The top of the litter: the terrain mesh. */
export const GROUND_ORDER = 5;
/** In the pocket: the worm, the detail and hero leaves round it. */
export const POCKET_ORDER = 6;
/** The floor under them (largest, and behind them all). */
export const FLOOR_ORDER = 7;
