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
    /** labeled gridlines only — no graph-paper noise */
    yTicks: [80, 90, 100, 110] as number[],
    /** wk 14 is told by its annotation; a 13+14 tick pair would crowd */
    xTicks: [1, 6, 13, 19, 26] as number[],
    dotWeeks: [1, 13, 14, 19, 26] as number[],
    yPx: (v: number) => yAt(frame, v),
    line: linePath(frame),
    area: areaPath(frame),
};

export { STORY, LANDMARKS, readout };
