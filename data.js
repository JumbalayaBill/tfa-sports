/* ======================================================
   TFA SPORTS - Game Data & Configuration
   ====================================================== */

// --- Countries (player can represent one) ---
const COUNTRIES = [
    { id: 'nor', name: 'Norway',        flag: ['#EF2B2D','#002868','#FFFFFF'] },
    { id: 'swe', name: 'Sweden',        flag: ['#006AA7','#FECC00','#FECC00'] },
    { id: 'usa', name: 'USA',           flag: ['#B22234','#3C3B6E','#FFFFFF'] },
    { id: 'gbr', name: 'Great Britain', flag: ['#CF142B','#00247D','#FFFFFF'] },
    { id: 'ger', name: 'Germany',       flag: ['#000000','#DD0000','#FFCE00'] },
    { id: 'fra', name: 'France',        flag: ['#002395','#FFFFFF','#ED2939'] },
    { id: 'jpn', name: 'Japan',         flag: ['#FFFFFF','#BC002D','#FFFFFF'] },
    { id: 'bra', name: 'Brazil',        flag: ['#009C3B','#FFDF00','#002776'] },
    { id: 'ken', name: 'Kenya',         flag: ['#000000','#BB0000','#006600'] },
    { id: 'aus', name: 'Australia',     flag: ['#00008B','#FFFFFF','#FF0000'] },
    { id: 'jam', name: 'Jamaica',       flag: ['#009B3A','#000000','#FED100'] },
    { id: 'can', name: 'Canada',        flag: ['#FF0000','#FFFFFF','#FF0000'] },
];

// --- Events ---
const EVENTS = [
    {
        id: 'ladder',
        name: 'Ladder Climbing',
        description: 'Climb a freestanding ladder to the top without tipping over! The higher you go, the harder it gets to keep your balance.',
        icon: 'ladder',
        category: 'field',
        attempts: 3,
        unit: 'm',
        lowerIsBetter: false,
        controls: [
            { keys: 'LEFT / RIGHT', desc: 'Alternate to climb up' },
            { keys: 'Balance', desc: 'Keep alternating evenly - uneven presses tilt the ladder!' },
        ],
        worldRecord: 10.00,
        totalRungs: 20,
        ladderHeight: 10.0,  // meters
    },
];

// --- Medal point values ---
const MEDAL_POINTS = {
    gold: 10,
    silver: 7,
    bronze: 5,
    fourth: 3,
    other: 1,
};

// --- Visual constants ---
const COLORS = {
    sky:            '#4A90D9',
    skyDark:        '#1B3A5C',
    grass:          '#4CAF50',
    grassDark:      '#388E3C',
    track:          '#D2691E',
    trackLine:      '#FFFFFF',
    sand:           '#F4D03F',
    water:          '#2196F3',
    waterDark:      '#1565C0',
    stadium:        '#8D6E63',
    crowd:          '#795548',
    skin:           '#E8B89D',
    skinDark:       '#C4956A',
    shirt:          '#E53935',
    shorts:         '#1565C0',
    gold:           '#FFD700',
    silver:         '#C0C0C0',
    bronze:         '#CD7F32',
    scoreboard:     '#1A1A2E',
    scoreText:      '#FFD700',
    hudBg:          'rgba(0, 0, 0, 0.7)',
    hudText:        '#FFFFFF',
};

// --- Athlete sprite frame data (simplified pixel art) ---
const ATHLETE = {
    width: 24,
    height: 40,
    // Frame definitions will be used by the renderer
    // Each event may define its own animation frames
};

// --- Default save data ---
const DEFAULT_SAVE = {
    records: {},    // eventId -> { score, playerName, date }
    gamesPlayed: 0,
};

// --- Sound definitions (Web Audio API synthesis) ---
const SOUNDS = {
    crowd:      { type: 'noise', duration: 1.0, freq: 400, decay: 0.8, gain: 0.15 },
    whistle:    { type: 'sine', duration: 0.4, freqStart: 800, freqEnd: 1200, gain: 0.3 },
    fanfare:    { type: 'square', duration: 0.8, notes: [523, 659, 784, 1047], noteLen: 0.2 },
    foul:       { type: 'square', duration: 0.5, freqStart: 400, freqEnd: 200, gain: 0.3 },
    medal:      { type: 'square', duration: 1.2, notes: [523, 659, 784, 1047, 1047], noteLen: 0.24 },
    tick:       { type: 'sine', duration: 0.05, freqStart: 1000, freqEnd: 1000, gain: 0.2 },
    climbStep:  { type: 'noise', duration: 0.06, freq: 600, decay: 0.03, gain: 0.15 },
    creak:      { type: 'sine', duration: 0.2, freqStart: 180, freqEnd: 120, gain: 0.12 },
    fall:       { type: 'noise', duration: 0.6, freq: 200, decay: 0.4, gain: 0.4 },
    victory:    { type: 'square', duration: 1.0, notes: [523, 659, 784, 1047, 1319], noteLen: 0.2 },
};
