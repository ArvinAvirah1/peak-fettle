// Precomputed geometry for the hero cover chart. Pure + deterministic so the
// server-rendered markup and the client hydration agree byte-for-byte.

import {
    STORY,
    LANDMARKS,
    readout,
    linePath,
    areaPath,
    yAt,
    type ChartFrame,
} from '@/lib/story';
import { yTicksFor } from '@/lib/units';

const frame: ChartFrame = {
    width: 1440,
    height: 420,
    left: 64,
    right: 28,
    top: 24,
    bottom: 36,
    yMin: 78,
    yMax: 112,
    wkMin: 1,
    wkMax: 26,
};

export const HERO_FRAME = {
    ...frame,
    /**
     * Labeled gridlines only — no graph-paper noise.
     *
     * The y domain stays in kilograms whatever the reader's unit; `yTicksFor`
     * hands back round numbers in their unit, each carrying the kilogram value
     * it plots at, so the two axes share one scale.
     */
    yTicks: yTicksFor,
    /** wk 14 is told by its annotation; a 13+14 tick pair would crowd */
    xTicks: [1, 6, 13, 19, 26] as number[],
    dotWeeks: [1, 13, 14, 19, 26] as number[],
    yPx: (v: number) => yAt(frame, v),
    line: linePath(frame),
    area: areaPath(frame),
};

export { STORY, LANDMARKS, readout };
