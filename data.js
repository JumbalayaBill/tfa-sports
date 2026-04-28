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
        worldRecord: 30.00,
        maxScore: 30,         // 3 × 10m top = hard cap
        totalRungs: 20,
        ladderHeight: 10.0,  // meters
    },
    {
        id: 'boot',
        name: 'Boot Throwing',
        description: 'Hurl a boot and land it on the chopping block! Add spin for bonus points, but watch the wind!',
        icon: 'boot',
        category: 'field',
        attempts: 3,
        unit: 'pts',
        lowerIsBetter: false,
        controls: [
            { keys: 'SPACE (tap)', desc: 'Stop the needle to set spin' },
            { keys: 'SPACE (hold)', desc: 'Charge power, release to throw' },
        ],
        worldRecord: 300,
        maxScore: 400,        // ~135 pts/attempt with max spin + distance (seagull excluded — bonus can push above 100)
    },
    {
        id: 'rockSkip',
        name: 'Rock Skipping',
        description: 'Skip a stone across the lake! Set your angle, power up your throw, then tap with perfect timing on each bounce!',
        icon: 'rockSkip',
        category: 'field',
        attempts: 3,
        unit: 'm',
        lowerIsBetter: false,
        controls: [
            { keys: 'SPACE (tap)', desc: 'Set angle, then tap each bounce' },
            { keys: 'SPACE (hold)', desc: 'Charge power, release to throw' },
        ],
        worldRecord: 85.00,
        maxScore: 275,        // ~91m/attempt with 21 perfect skips chained
    },
    {
        id: 'soccer',
        name: 'Soccer Over House',
        description: 'Kick a soccer ball over the house and sprint to the other side to catch it! Clear the roof, run fast, and make the catch!',
        icon: 'soccer',
        category: 'field',
        attempts: 3,
        unit: 'pts',
        lowerIsBetter: false,
        controls: [
            { keys: 'SPACE', desc: 'Set kick angle and charge power' },
            { keys: 'LEFT / RIGHT', desc: 'Sprint around house, then position for catch' },
        ],
        worldRecord: 400,
        maxScore: 450,        // ~150 pts/attempt with perfect kick/sprint/catch + wind
    },
    {
        id: 'bottleThrow',
        name: 'Bottle Throw',
        description: 'Spin a bottle and land it with the right number of full rotations! 5 levels: 1, 2, 3, 4, 5 rotations. Watch out for wind and bumblebees!',
        icon: 'bottleThrow',
        category: 'field',
        attempts: 3,
        unit: 'pts',
        lowerIsBetter: false,
        controls: [
            { keys: 'SPACE (tap)', desc: 'Stop the needle to set spin rate' },
            { keys: 'SPACE (hold)', desc: 'Charge power, release to throw' },
        ],
        worldRecord: 600,
        maxScore: 900,        // 300 pts/attempt × 3 attempts = 900 (perfect-precision clear of all 5 levels per attempt)
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

// --- Avatar customization options ---
const AVATAR_OPTIONS = {
    skinTone: [
        { id: 'light',    name: 'Light',    color: '#F5D0B0' },
        { id: 'medium',   name: 'Medium',   color: '#E8B89D' },
        { id: 'tan',      name: 'Tan',      color: '#C4956A' },
        { id: 'brown',    name: 'Brown',    color: '#8D5E3C' },
        { id: 'dark',     name: 'Dark',     color: '#5C3A1E' },
    ],
    hair: [
        { id: 'short',    name: 'Short',    color: null },
        { id: 'spiky',    name: 'Spiky',    color: null },
        { id: 'long',     name: 'Long',     color: null },
        { id: 'mohawk',   name: 'Mohawk',   color: null },
        { id: 'bald',     name: 'Bald',     color: null },
        { id: 'afro',     name: 'Afro',     color: null },
    ],
    hairColor: [
        { id: 'black',    name: 'Black',    color: '#1A1A1A' },
        { id: 'brown',    name: 'Brown',    color: '#4A3728' },
        { id: 'blonde',   name: 'Blonde',   color: '#D4A843' },
        { id: 'red',      name: 'Red',      color: '#A63D20' },
        { id: 'white',    name: 'White',    color: '#E0DDD5' },
        { id: 'blue',     name: 'Blue',     color: '#2979FF' },
        { id: 'pink',     name: 'Pink',     color: '#E91E90' },
    ],
    shirt: [
        { id: 'tshirt',   name: 'T-Shirt',  color: null },
        { id: 'tank',     name: 'Tank Top',  color: null },
        { id: 'jersey',   name: 'Jersey',    color: null },
        { id: 'hoodie',   name: 'Hoodie',    color: null },
    ],
    shirtColor: [
        { id: 'red',      name: 'Red',      color: '#E53935' },
        { id: 'blue',     name: 'Blue',     color: '#1E88E5' },
        { id: 'green',    name: 'Green',    color: '#43A047' },
        { id: 'yellow',   name: 'Yellow',   color: '#FDD835' },
        { id: 'white',    name: 'White',    color: '#F5F5F5' },
        { id: 'black',    name: 'Black',    color: '#333333' },
        { id: 'orange',   name: 'Orange',   color: '#F4511E' },
        { id: 'purple',   name: 'Purple',   color: '#7B1FA2' },
    ],
    shorts: [
        { id: 'short',    name: 'Short',    color: null },
        { id: 'long',     name: 'Long',     color: null },
    ],
    shortsColor: [
        { id: 'blue',     name: 'Blue',     color: '#1565C0' },
        { id: 'black',    name: 'Black',    color: '#222222' },
        { id: 'white',    name: 'White',    color: '#EEEEEE' },
        { id: 'red',      name: 'Red',      color: '#C62828' },
        { id: 'green',    name: 'Green',    color: '#2E7D32' },
    ],
    shoes: [
        { id: 'sneakers', name: 'Sneakers', color: null },
        { id: 'boots',    name: 'Boots',    color: null },
        { id: 'cleats',   name: 'Cleats',   color: null },
    ],
    shoesColor: [
        { id: 'white',    name: 'White',    color: '#F5F5F5' },
        { id: 'black',    name: 'Black',    color: '#222222' },
        { id: 'red',      name: 'Red',      color: '#E53935' },
        { id: 'blue',     name: 'Blue',     color: '#1565C0' },
        { id: 'gold',     name: 'Gold',     color: '#FFD700' },
    ],
    accessory: [
        { id: 'none',       name: 'None',       color: null },
        { id: 'headband',   name: 'Headband',   color: null },
        { id: 'sunglasses', name: 'Sunglasses', color: null },
        { id: 'wristband',  name: 'Wristbands', color: null },
        { id: 'cape',       name: 'Cape',       color: null },
    ],
    accessoryColor: [
        { id: 'red',      name: 'Red',      color: '#E53935' },
        { id: 'blue',     name: 'Blue',     color: '#1E88E5' },
        { id: 'gold',     name: 'Gold',     color: '#FFD700' },
        { id: 'white',    name: 'White',    color: '#F5F5F5' },
        { id: 'black',    name: 'Black',    color: '#333333' },
        { id: 'green',    name: 'Green',    color: '#43A047' },
    ],
};

const DEFAULT_AVATAR = {
    skinTone: 'medium',
    hair: 'short',
    hairColor: 'brown',
    shirt: 'tshirt',
    shirtColor: 'red',
    shorts: 'short',
    shortsColor: 'blue',
    shoes: 'sneakers',
    shoesColor: 'white',
    accessory: 'none',
    accessoryColor: 'red',
};

// --- Default save data ---
const DEFAULT_SAVE = {
    records: {},    // eventId -> { score, playerName, date }
    gamesPlayed: 0,
    avatar: null,   // will use DEFAULT_AVATAR if null
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
    throw:      { type: 'noise', duration: 0.2, freq: 300, decay: 0.1, gain: 0.25 },
    woosh:      { type: 'sine', duration: 0.3, freqStart: 600, freqEnd: 200, gain: 0.15 },
    thunk:      { type: 'noise', duration: 0.12, freq: 150, decay: 0.06, gain: 0.35 },
    miss:       { type: 'noise', duration: 0.25, freq: 100, decay: 0.15, gain: 0.2 },
    charge:     { type: 'sine', duration: 0.06, freqStart: 400, freqEnd: 500, gain: 0.1 },
    // Rock Skipping sounds
    skip:       { type: 'sine', duration: 0.08, freqStart: 1800, freqEnd: 2400, gain: 0.2 },
    skipPerfect:{ type: 'sine', duration: 0.12, freqStart: 2200, freqEnd: 3000, gain: 0.25 },
    plop:       { type: 'sine', duration: 0.35, freqStart: 300, freqEnd: 80, gain: 0.3 },
    splash:     { type: 'noise', duration: 0.1, freq: 800, decay: 0.05, gain: 0.15 },
    // Soccer Over House sounds
    kick:       { type: 'noise', duration: 0.15, freq: 250, decay: 0.08, gain: 0.35 },
    crowdGasp:  { type: 'noise', duration: 0.5, freq: 500, decay: 0.3, gain: 0.2 },
    roofBonk:   { type: 'sine', duration: 0.25, freqStart: 300, freqEnd: 100, gain: 0.4 },
    sprint:     { type: 'noise', duration: 0.04, freq: 800, decay: 0.02, gain: 0.08 },
    catch:      { type: 'sine', duration: 0.3, freqStart: 600, freqEnd: 900, gain: 0.25 },
    ballBounce: { type: 'sine', duration: 0.1, freqStart: 500, freqEnd: 300, gain: 0.15 },
};
