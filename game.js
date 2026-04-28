/* ======================================================
   TFA SPORTS - Game Engine
   ====================================================== */

// ---- Save System ----
const Save = {
    key: 'tfa-sports-save',

    load() {
        try {
            const raw = localStorage.getItem(this.key);
            return raw ? JSON.parse(raw) : { ...DEFAULT_SAVE };
        } catch (e) {
            return { ...DEFAULT_SAVE };
        }
    },

    save(data) {
        try {
            localStorage.setItem(this.key, JSON.stringify(data));
        } catch (e) { /* silently fail */ }
    },

    updateRecord(eventId, score, playerName, lowerIsBetter) {
        const data = this.load();
        if (!data.records) data.records = {};
        const existing = data.records[eventId];
        const isBetter = !existing ||
            (lowerIsBetter ? score < existing.score : score > existing.score);
        if (isBetter) {
            data.records[eventId] = {
                score,
                playerName,
                date: new Date().toISOString().slice(0, 10),
            };
            this.save(data);
            return true;
        }
        return false;
    },

    incrementGamesPlayed() {
        const data = this.load();
        data.gamesPlayed = (data.gamesPlayed || 0) + 1;
        this.save(data);
    },

    // Update the all-around "Grand Score" record. combinedScore is the sum of
    // (event_score / world_record) * 100 over all events played in one game.
    updateTotalRecord(combinedScore, eventCount, eventIds, playerName) {
        const data = this.load();
        const existing = data.totalRecord;
        if (!existing || combinedScore > existing.combinedScore) {
            data.totalRecord = {
                combinedScore,
                eventCount,
                eventIds,
                playerName,
                date: new Date().toISOString().slice(0, 10),
            };
            this.save(data);
            return true;
        }
        return false;
    },

    getTotalRecord() {
        const data = this.load();
        return data.totalRecord || null;
    },
};

// ---- SFX Module (Web Audio API) ----
const SFX = {
    ctx: null,

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    play(soundId) {
        this.init();
        this.resume();
        const def = SOUNDS[soundId];
        if (!def || !this.ctx) return;

        const now = this.ctx.currentTime;
        const gain = this.ctx.createGain();
        gain.connect(this.ctx.destination);
        gain.gain.setValueAtTime(def.gain || 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + def.duration);

        if (def.type === 'noise') {
            const bufferSize = this.ctx.sampleRate * def.duration;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(gain);
            source.start(now);
            source.stop(now + def.duration);
        } else if (def.notes) {
            // Play a sequence of notes (fanfare)
            def.notes.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                osc.type = def.type || 'square';
                osc.frequency.setValueAtTime(freq, now + i * def.noteLen);
                const noteGain = this.ctx.createGain();
                noteGain.gain.setValueAtTime(def.gain || 0.2, now + i * def.noteLen);
                noteGain.gain.exponentialRampToValueAtTime(0.001, now + (i + 1) * def.noteLen);
                osc.connect(noteGain);
                noteGain.connect(this.ctx.destination);
                osc.start(now + i * def.noteLen);
                osc.stop(now + (i + 1) * def.noteLen);
            });
        } else {
            const osc = this.ctx.createOscillator();
            osc.type = def.type || 'sine';
            osc.frequency.setValueAtTime(def.freqStart || 440, now);
            if (def.freqEnd) {
                osc.frequency.linearRampToValueAtTime(def.freqEnd, now + def.duration);
            }
            osc.connect(gain);
            osc.start(now);
            osc.stop(now + def.duration);
        }
    },
};

// ---- UI Module ----
const UI = {
    activeScreen: 'screen-title',

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            this.activeScreen = screenId;
        }

        // Trigger screen-specific setup
        if (screenId === 'screen-player-select') this.setupPlayerSelect();
        if (screenId === 'screen-event-select') this.setupEventSelect();
        if (screenId === 'screen-practice-select') this.setupPracticeSelect();
        if (screenId === 'screen-records') this.setupRecords();
        if (screenId === 'screen-leaderboard') Leaderboard.showLeaderboardScreen();
        if (screenId === 'screen-avatar') AvatarEditor.init();
    },

    setupPlayerSelect() {
        const container = document.getElementById('player-names-container');
        const countBtns = document.querySelectorAll('.player-count-btn');

        // Player count buttons
        countBtns.forEach(btn => {
            btn.onclick = () => {
                countBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                Game.playerCount = parseInt(btn.dataset.count);
                this.renderPlayerInputs();
            };
        });

        this.renderPlayerInputs();
    },

    renderPlayerInputs() {
        const container = document.getElementById('player-names-container');
        let html = '';
        for (let i = 0; i < Game.playerCount; i++) {
            const existing = Game.players[i];
            const name = existing ? existing.name : `PLAYER ${i + 1}`;
            const countryId = existing ? existing.countryId : COUNTRIES[i % COUNTRIES.length].id;
            html += `
                <div class="player-input-row">
                    <label>P${i + 1}</label>
                    <input type="text" class="player-name-input" maxlength="12"
                           value="${name}" data-index="${i}" placeholder="PLAYER ${i + 1}">
                    <select class="player-country-select" data-index="${i}">
                        ${COUNTRIES.map(c =>
                            `<option value="${c.id}" ${c.id === countryId ? 'selected' : ''}>${c.name}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
        }
        container.innerHTML = html;

        // Sync inputs to Game.players
        container.querySelectorAll('.player-name-input').forEach(input => {
            input.addEventListener('input', () => {
                const idx = parseInt(input.dataset.index);
                if (!Game.players[idx]) Game.players[idx] = {};
                Game.players[idx].name = input.value || `PLAYER ${idx + 1}`;
            });
        });
        container.querySelectorAll('.player-country-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const idx = parseInt(sel.dataset.index);
                if (!Game.players[idx]) Game.players[idx] = {};
                Game.players[idx].countryId = sel.value;
            });
        });

        // Initialize Game.players
        for (let i = 0; i < Game.playerCount; i++) {
            if (!Game.players[i]) Game.players[i] = {};
            const nameInput = container.querySelector(`.player-name-input[data-index="${i}"]`);
            const countrySelect = container.querySelector(`.player-country-select[data-index="${i}"]`);
            Game.players[i].name = nameInput.value || `PLAYER ${i + 1}`;
            Game.players[i].countryId = countrySelect.value;
            Game.players[i].totalPoints = Game.players[i].totalPoints || 0;
        }
    },

    setupEventSelect() {
        const list = document.getElementById('event-list');
        list.innerHTML = EVENTS.map(ev => `
            <div class="event-card" data-event="${ev.id}">
                <div class="event-card-icon">${this.getEventIcon(ev.icon)}</div>
                <div class="event-card-info">
                    <h3>${ev.name}</h3>
                    <p>${ev.description}</p>
                </div>
                <div class="event-card-toggle">
                    <input type="checkbox" id="ev-${ev.id}" checked>
                    <label for="ev-${ev.id}"></label>
                </div>
            </div>
        `).join('');
    },

    getEventIcon(icon) {
        const icons = {
            ladder:      '<div class="pixel-icon">&#128508;</div>',
            boot:        '<div class="pixel-icon">&#129406;</div>',
            rockSkip:    '<div class="pixel-icon">&#127754;</div>',
            soccer:      '<div class="pixel-icon">&#9917;</div>',
            bottleThrow: '<div class="pixel-icon">&#127870;</div>',
        };
        return icons[icon] || '<div class="pixel-icon">?</div>';
    },

    setupRecords() {
        const list = document.getElementById('records-list');
        const saveData = Save.load();
        const eventRows = EVENTS.map(ev => {
            const rec = saveData.records ? saveData.records[ev.id] : null;
            return `
                <div class="record-row">
                    <span class="record-event">${ev.name}</span>
                    <span class="record-score">${rec ? rec.score.toFixed(2) + ' ' + ev.unit : '---'}</span>
                    <span class="record-player">${rec ? rec.playerName : ''}</span>
                    <span class="record-date">${rec ? rec.date : ''}</span>
                </div>
            `;
        }).join('');
        const grand = saveData.totalRecord;
        const grandMax = grand ? grand.eventCount * 100 : '-';
        const grandRow = `
            <div class="record-row record-row-grand">
                <span class="record-event">GRAND SCORE (${grand ? grand.eventCount : '-'} events)</span>
                <span class="record-score">${grand ? grand.combinedScore + ' / ' + grandMax : '---'}</span>
                <span class="record-player">${grand ? grand.playerName : ''}</span>
                <span class="record-date">${grand ? grand.date : ''}</span>
            </div>
        `;
        list.innerHTML = eventRows + grandRow;
    },

    setupPracticeSelect() {
        const list = document.getElementById('practice-event-list');
        list.innerHTML = EVENTS.map(ev => `
            <div class="event-card practice-event-card" onclick="Game.startPractice('${ev.id}')">
                <div class="event-card-icon">${this.getEventIcon(ev.icon)}</div>
                <div class="event-card-info">
                    <h3>${ev.name}</h3>
                    <p>${ev.description}</p>
                </div>
                <div class="event-card-toggle">
                    <span class="practice-arrow">▶</span>
                </div>
            </div>
        `).join('');
    },

    showFinalSummary({ practiceMode, practiceEventId, playerName, perEvent, combinedScore,
                       maxPossible, newGrandRecord, previousGrandRecord }) {
        document.getElementById('final-summary-title').textContent =
            practiceMode ? 'PRACTICE COMPLETE' : 'FINAL RESULTS';

        const list = document.getElementById('final-summary-list');
        list.innerHTML = perEvent.map(e => `
            <div class="final-summary-row">
                <span class="final-summary-event">${e.name}</span>
                <span class="final-summary-score">${e.score.toFixed(2)} ${e.unit}</span>
                <span class="final-summary-pi">${e.eventPoints} / 100</span>
            </div>
        `).join('');

        // Grand score box (hide in practice — single event doesn't need a "grand" total)
        const grandBox = document.getElementById('final-summary-grand-box');
        if (practiceMode) {
            grandBox.classList.add('hidden');
        } else {
            grandBox.classList.remove('hidden');
            document.getElementById('final-summary-grand-score').textContent =
                `${combinedScore} / ${maxPossible}`;
            const msgEl = document.getElementById('final-summary-grand-message');
            if (newGrandRecord) {
                const prev = previousGrandRecord
                    ? `previous best ${previousGrandRecord.combinedScore}` : 'first record set';
                msgEl.textContent = `NEW RECORD! (${prev})`;
                msgEl.className = 'final-summary-grand-message new-record';
            } else if (previousGrandRecord) {
                msgEl.textContent = `Best: ${previousGrandRecord.combinedScore} / ${maxPossible} by ${previousGrandRecord.playerName}`;
                msgEl.className = 'final-summary-grand-message';
            } else {
                msgEl.textContent = '';
                msgEl.className = 'final-summary-grand-message';
            }
        }

        // Action buttons differ per mode
        const actions = document.getElementById('final-summary-actions');
        if (practiceMode) {
            actions.innerHTML = `
                <button class="btn btn-secondary" onclick="UI.showScreen('screen-practice-select')">PICK EVENT</button>
                <button class="btn btn-primary" onclick="Game.startPractice('${practiceEventId}')">PRACTICE AGAIN</button>
                <button class="btn btn-secondary" onclick="UI.showScreen('screen-title')">MAIN MENU</button>
            `;
        } else {
            actions.innerHTML = `
                <button class="btn btn-primary" onclick="UI.showScreen('screen-title')">MAIN MENU</button>
                <button class="btn btn-secondary" onclick="UI.showScreen('screen-records')">VIEW RECORDS</button>
            `;
        }

        this.showScreen('screen-final-summary');
    },

    showEventIntro(event) {
        document.getElementById('event-intro-name').textContent = event.name;
        document.getElementById('event-intro-desc').textContent = event.description;
        const controlsEl = document.getElementById('event-intro-controls');
        controlsEl.innerHTML = event.controls.map(c =>
            `<div class="control-row"><span class="key">${c.keys}</span> <span>${c.desc}</span></div>`
        ).join('');
        this.showScreen('screen-event-intro');
    },

    updateHUD(state) {
        document.getElementById('hud-event-name').textContent = state.eventName || '';
        document.getElementById('hud-player-name').textContent = state.playerName || '';
        document.getElementById('hud-score').textContent = state.score || '';
        document.getElementById('hud-timer').textContent = state.timer || '';
        document.getElementById('hud-attempt').textContent = state.attempt || '';
    },

    showPrompt(text) {
        const el = document.getElementById('game-prompt');
        el.textContent = text;
        el.classList.remove('hidden');
    },

    hidePrompt() {
        document.getElementById('game-prompt').classList.add('hidden');
    },

    showResult({ title, score, unit, message, time, attemptLabel, scores, totalScore, totalAttempts }) {
        document.getElementById('result-title').textContent = title;
        document.getElementById('result-attempt-label').textContent = attemptLabel || '';
        document.getElementById('result-score').textContent =
            typeof score === 'number' ? score.toFixed(2) : score;
        document.getElementById('result-unit').textContent = unit || '';
        document.getElementById('result-time').textContent = time || '';
        document.getElementById('result-message').textContent = message || '';
        document.getElementById('result-ranking').innerHTML = '';

        // Total box with breakdown
        const totalBox = document.getElementById('result-total-box');
        if (scores && scores.length > 0 && totalAttempts > 1) {
            totalBox.classList.remove('hidden');

            // Build breakdown rows
            const breakdown = document.getElementById('result-breakdown');
            let rows = '';
            for (let i = 0; i < totalAttempts; i++) {
                const s = scores[i];
                const isCurrent = i === scores.length - 1;
                const isFuture = i >= scores.length;
                const cls = isCurrent ? 'current' : isFuture ? 'future' : '';
                const label = 'Attempt ' + (i + 1);
                const val = isFuture ? '---' :
                    (isCurrent ? '+ ' : '') + s.toFixed(2) + ' ' + unit;
                rows += `<div class="result-breakdown-row ${cls}">
                    <span>${label}</span><span>${val}</span>
                </div>`;
            }
            breakdown.innerHTML = rows;

            document.getElementById('result-total-score').textContent = totalScore.toFixed(2);
            document.getElementById('result-total-unit').textContent = unit;
        } else {
            totalBox.classList.add('hidden');
        }

        this.showScreen('screen-result');
    },

    showStandings(eventName, standings) {
        document.getElementById('standings-event-name').textContent = eventName + ' - STANDINGS';
        const table = document.getElementById('standings-table');
        table.innerHTML = standings.map((s) => {
            const medalClass = s.rank === 0 ? 'gold' : s.rank === 1 ? 'silver' : s.rank === 2 ? 'bronze' : '';
            return `
                <div class="standings-row ${medalClass}">
                    <span class="standings-rank">${s.rank + 1}</span>
                    <span class="standings-name">${s.name}</span>
                    <span class="standings-score">${s.score.toFixed(2)} ${s.unit}</span>
                    <span class="standings-points">+${s.points} pts</span>
                </div>
            `;
        }).join('');
        this.showScreen('screen-standings');
    },
};

// ---- Avatar Renderer (draws the athlete with customization) ----
const AvatarRenderer = {
    getAvatar() {
        const save = Save.load();
        return save.avatar || { ...DEFAULT_AVATAR };
    },

    getOption(category, id) {
        return AVATAR_OPTIONS[category].find(o => o.id === id) || AVATAR_OPTIONS[category][0];
    },

    // Draw a full avatar at (x, y) where y is the foot position, scale multiplier
    draw(ctx, x, y, scale, frame, avatar) {
        const av = avatar || this.getAvatar();
        const s = scale || 1;
        const skinColor = this.getOption('skinTone', av.skinTone).color;
        const hairCol = this.getOption('hairColor', av.hairColor).color;
        const shirtCol = this.getOption('shirtColor', av.shirtColor).color;
        const shortsCol = this.getOption('shortsColor', av.shortsColor).color;
        const shoesCol = this.getOption('shoesColor', av.shoesColor).color;
        const accCol = this.getOption('accessoryColor', av.accessoryColor).color;

        const f = frame || 0;
        const legAnim = f ? Math.sin(f * 0.5) * 6 * s : 0;
        const armAnim = f ? Math.sin(f * 0.5 + Math.PI) * 4 * s : 0;

        // Cape (behind body)
        if (av.accessory === 'cape') {
            ctx.fillStyle = accCol;
            const capeWave = f ? Math.sin(f * 0.3) * 3 * s : 0;
            ctx.beginPath();
            ctx.moveTo(x - 5 * s, y - 24 * s);
            ctx.lineTo(x + 5 * s, y - 24 * s);
            ctx.lineTo(x + 8 * s + capeWave, y - 2 * s);
            ctx.lineTo(x - 8 * s + capeWave, y - 2 * s);
            ctx.closePath();
            ctx.fill();
        }

        // Shoes
        ctx.fillStyle = shoesCol;
        if (av.shoes === 'boots') {
            ctx.fillRect(x - 5 * s, y - 4 * s + legAnim, 4 * s, 6 * s);
            ctx.fillRect(x + 1 * s, y - 4 * s - legAnim, 4 * s, 6 * s);
        } else if (av.shoes === 'cleats') {
            ctx.fillRect(x - 5 * s, y - 2 * s + legAnim, 5 * s, 4 * s);
            ctx.fillRect(x + 1 * s, y - 2 * s - legAnim, 5 * s, 4 * s);
            // Cleats studs
            ctx.fillStyle = '#999';
            ctx.fillRect(x - 5 * s, y + 1 * s + legAnim, 5 * s, 1 * s);
            ctx.fillRect(x + 1 * s, y + 1 * s - legAnim, 5 * s, 1 * s);
        } else {
            // Sneakers
            ctx.fillRect(x - 5 * s, y - 2 * s + legAnim, 5 * s, 4 * s);
            ctx.fillRect(x + 1 * s, y - 2 * s - legAnim, 5 * s, 4 * s);
        }

        // Legs
        ctx.fillStyle = skinColor;
        const legLen = av.shorts === 'long' ? 6 * s : 10 * s;
        const legStart = av.shorts === 'long' ? y - 10 * s : y - 4 * s;
        ctx.fillRect(x - 4 * s, legStart + legAnim, 3 * s, legLen);
        ctx.fillRect(x + 1 * s, legStart - legAnim, 3 * s, legLen);

        // Shorts
        ctx.fillStyle = shortsCol;
        const shortsH = av.shorts === 'long' ? 12 * s : 6 * s;
        ctx.fillRect(x - 5 * s, y - 10 * s, 10 * s, shortsH);

        // Body / shirt
        ctx.fillStyle = shirtCol;
        if (av.shirt === 'tank') {
            ctx.fillRect(x - 4 * s, y - 24 * s, 8 * s, 14 * s);
            // Shoulder straps
            ctx.fillRect(x - 4 * s, y - 24 * s, 3 * s, 3 * s);
            ctx.fillRect(x + 1 * s, y - 24 * s, 3 * s, 3 * s);
        } else if (av.shirt === 'jersey') {
            ctx.fillRect(x - 5 * s, y - 24 * s, 10 * s, 14 * s);
            // Number "1"
            ctx.fillStyle = '#FFF';
            ctx.font = `bold ${8 * s}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('1', x, y - 14 * s);
        } else if (av.shirt === 'hoodie') {
            ctx.fillRect(x - 6 * s, y - 24 * s, 12 * s, 15 * s);
            // Hood outline
            ctx.strokeStyle = shirtCol === '#333333' ? '#555' : '#00000044';
            ctx.lineWidth = 1 * s;
            ctx.beginPath();
            ctx.arc(x, y - 28 * s, 5 * s, Math.PI, Math.PI * 2);
            ctx.stroke();
        } else {
            // T-shirt
            ctx.fillRect(x - 5 * s, y - 24 * s, 10 * s, 14 * s);
        }

        // Arms
        ctx.fillStyle = skinColor;
        ctx.fillRect(x - 8 * s, y - 22 * s + armAnim, 3 * s, 10 * s);
        ctx.fillRect(x + 5 * s, y - 22 * s - armAnim, 3 * s, 10 * s);

        // Wristbands
        if (av.accessory === 'wristband') {
            ctx.fillStyle = accCol;
            ctx.fillRect(x - 8 * s, y - 14 * s + armAnim, 3 * s, 3 * s);
            ctx.fillRect(x + 5 * s, y - 14 * s - armAnim, 3 * s, 3 * s);
        }

        // Head
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(x, y - 30 * s, 6 * s, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        if (av.hair !== 'bald') {
            ctx.fillStyle = hairCol;
            if (av.hair === 'short') {
                ctx.beginPath();
                ctx.arc(x, y - 33 * s, 6 * s, Math.PI, Math.PI * 2);
                ctx.fill();
            } else if (av.hair === 'spiky') {
                for (let i = -2; i <= 2; i++) {
                    ctx.beginPath();
                    ctx.moveTo(x + i * 3 * s, y - 34 * s);
                    ctx.lineTo(x + i * 3 * s - 2 * s, y - 30 * s);
                    ctx.lineTo(x + i * 3 * s + 2 * s, y - 30 * s);
                    ctx.closePath();
                    ctx.fill();
                }
            } else if (av.hair === 'long') {
                ctx.beginPath();
                ctx.arc(x, y - 33 * s, 6 * s, Math.PI, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(x - 6 * s, y - 33 * s, 3 * s, 12 * s);
                ctx.fillRect(x + 3 * s, y - 33 * s, 3 * s, 12 * s);
            } else if (av.hair === 'mohawk') {
                ctx.fillRect(x - 2 * s, y - 40 * s, 4 * s, 10 * s);
            } else if (av.hair === 'afro') {
                ctx.beginPath();
                ctx.arc(x, y - 33 * s, 9 * s, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Headband
        if (av.accessory === 'headband') {
            ctx.fillStyle = accCol;
            ctx.fillRect(x - 7 * s, y - 32 * s, 14 * s, 2 * s);
        }

        // Sunglasses
        if (av.accessory === 'sunglasses') {
            ctx.fillStyle = '#111';
            ctx.fillRect(x - 5 * s, y - 31 * s, 4 * s, 2 * s);
            ctx.fillRect(x + 1 * s, y - 31 * s, 4 * s, 2 * s);
            ctx.fillRect(x - 1 * s, y - 31 * s, 2 * s, 1 * s);
        }
    },
};

// ---- Avatar Editor ----
const AvatarEditor = {
    current: null,

    init() {
        this.current = { ...DEFAULT_AVATAR, ...(Save.load().avatar || {}) };
        this.buildUI();
        this.renderPreview();
    },

    buildUI() {
        const container = document.getElementById('avatar-options');
        const categories = [
            { key: 'skinTone',       label: 'SKIN TONE',    type: 'color' },
            { key: 'hair',           label: 'HAIR STYLE',   type: 'text' },
            { key: 'hairColor',      label: 'HAIR COLOR',   type: 'color' },
            { key: 'shirt',          label: 'SHIRT',        type: 'text' },
            { key: 'shirtColor',     label: 'SHIRT COLOR',  type: 'color' },
            { key: 'shorts',         label: 'SHORTS',       type: 'text' },
            { key: 'shortsColor',    label: 'SHORTS COLOR', type: 'color' },
            { key: 'shoes',          label: 'SHOES',        type: 'text' },
            { key: 'shoesColor',     label: 'SHOE COLOR',   type: 'color' },
            { key: 'accessory',      label: 'ACCESSORY',    type: 'text' },
            { key: 'accessoryColor', label: 'ACC. COLOR',   type: 'color' },
        ];

        container.innerHTML = categories.map(cat => {
            const options = AVATAR_OPTIONS[cat.key];
            const swatches = options.map(opt => {
                const isActive = this.current[cat.key] === opt.id;
                if (cat.type === 'color' && opt.color) {
                    return `<div class="avatar-swatch ${isActive ? 'active' : ''}"
                                data-cat="${cat.key}" data-id="${opt.id}"
                                style="background:${opt.color}"
                                title="${opt.name}"></div>`;
                } else {
                    return `<div class="avatar-text-btn ${isActive ? 'active' : ''}"
                                data-cat="${cat.key}" data-id="${opt.id}">${opt.name}</div>`;
                }
            }).join('');

            return `<div class="avatar-option-group">
                <label>${cat.label}</label>
                <div class="avatar-swatches">${swatches}</div>
            </div>`;
        }).join('');

        // Click handlers
        container.querySelectorAll('.avatar-swatch, .avatar-text-btn').forEach(el => {
            el.addEventListener('click', () => {
                const cat = el.dataset.cat;
                const id = el.dataset.id;
                this.current[cat] = id;
                // Update active state in this group
                const group = el.closest('.avatar-option-group');
                group.querySelectorAll('.avatar-swatch, .avatar-text-btn').forEach(s => s.classList.remove('active'));
                el.classList.add('active');
                this.renderPreview();
            });
        });
    },

    renderPreview() {
        const canvas = document.getElementById('avatar-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        // Background gradient
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#1A1A2E');
        grad.addColorStop(1, '#16213E');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Floor line
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, H - 40);
        ctx.lineTo(W - 20, H - 40);
        ctx.stroke();

        // Draw large avatar
        AvatarRenderer.draw(ctx, W / 2, H - 42, 3.5, 0, this.current);

        // Label
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PREVIEW', W / 2, 20);
    },

    save() {
        const data = Save.load();
        data.avatar = { ...this.current };
        Save.save(data);
        UI.showScreen('screen-title');
    },
};

// ---- Scene Renderer ----
const Scene = {
    canvas: null,
    ctx: null,

    init() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    },

    resize() {
        if (!this.canvas) return;
        const maxW = 900;
        const w = Math.min(window.innerWidth - 20, maxW);
        const ratio = w / maxW;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = (500 * ratio) + 'px';
    },

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },

    // --- Common scene drawing helpers ---

    drawSky(color) {
        const ctx = this.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, color || COLORS.sky);
        gradient.addColorStop(1, '#87CEEB');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 900, 200);
    },

    drawStadium() {
        const ctx = this.ctx;
        // Stands / crowd
        ctx.fillStyle = COLORS.stadium;
        ctx.fillRect(0, 80, 900, 120);
        // Crowd dots
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * 900;
            const y = 85 + Math.random() * 110;
            const colors = ['#E53935','#1E88E5','#FDD835','#43A047','#F4511E','#FFFFFF'];
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.fillRect(x, y, 3, 4);
        }
    },

    drawTrack(y, height) {
        const ctx = this.ctx;
        ctx.fillStyle = COLORS.track;
        ctx.fillRect(0, y, 900, height);
        // Lane lines
        ctx.strokeStyle = COLORS.trackLine;
        ctx.lineWidth = 1;
        const laneH = height / 4;
        for (let i = 0; i <= 4; i++) {
            ctx.beginPath();
            ctx.moveTo(0, y + i * laneH);
            ctx.lineTo(900, y + i * laneH);
            ctx.stroke();
        }
    },

    drawGrass(y, height) {
        const ctx = this.ctx;
        ctx.fillStyle = COLORS.grass;
        ctx.fillRect(0, y, 900, height);
        // Grass blades
        ctx.strokeStyle = COLORS.grassDark;
        for (let x = 0; x < 900; x += 8) {
            ctx.beginPath();
            ctx.moveTo(x, y + height);
            ctx.lineTo(x + 2, y + height - 6);
            ctx.stroke();
        }
    },

    drawAthlete(x, y, frame, countryColors) {
        AvatarRenderer.draw(this.ctx, x, y, 1, frame);
    },

    drawFinishLine(x, y, height) {
        const ctx = this.ctx;
        const size = 6;
        for (let row = 0; row < height / size; row++) {
            for (let col = 0; col < 2; col++) {
                ctx.fillStyle = (row + col) % 2 === 0 ? '#000' : '#FFF';
                ctx.fillRect(x + col * size, y + row * size, size, size);
            }
        }
    },

    // Render a complete scene based on event type and state
    render(eventId, state) {
        this.clear();
        // Delegate to event-specific renderer if it exists
        if (EventRenderers[eventId]) {
            EventRenderers[eventId](this.ctx, state);
        } else {
            // Default: draw a generic track scene
            this.drawSky();
            this.drawStadium();
            this.drawTrack(250, 150);
            this.drawGrass(400, 100);
        }
    },
};

// ---- Event-Specific Renderers ----
const EventRenderers = {};

// ---- Event Logic Modules ----
const EventLogic = {};

// ============================================================
//  LADDER CLIMBING - Event Implementation
// ============================================================

const LADDER = {
    totalRungs: 20,
    maxHeight: 10.0,        // meters
    baseX: 450,             // center of canvas
    baseY: 460,             // ground level
    rungSpacing: 18,        // pixels between rungs
    ladderWidth: 40,        // pixels wide
    maxTilt: 0.25,          // radians - tighter fall threshold
    gravity: 2.5,           // strong gravity pendulum effect
    tiltPerPress: 0.04,     // bigger tilt impulse per key press
    tiltDamping: 0.97,      // less damping = wobbles persist longer
    heightInstability: 0.18,// steep instability curve at height
    countdownTime: 3,       // seconds before start
};

EventLogic.ladder = {
    init(state) {
        state.phase = 'countdown';
        state.countdown = LADDER.countdownTime;
        state.rung = 0;                // current rung (0 = ground)
        state.tilt = 0;                // current tilt angle in radians (- = left, + = right)
        state.tiltVelocity = 0;        // angular velocity
        state.lastKey = null;           // last directional key pressed
        state.climbReady = true;       // alternation check
        state.score = 0;
        state.timer = 0;
        state.falling = false;
        state.fallTimer = 0;
        state.fallDirection = 0;
        state.reachedTop = false;
        state.frame = 0;
        state.shakeTimer = 0;          // screen shake on fall
        state.windTimer = 0;
        state.windForce = 0;
        state.athleteArmL = 0;         // arm animation offsets
        state.athleteArmR = 0;
        state.climbAnim = 0;           // climb animation progress
        state.sparkles = [];           // victory sparkles
        state.lastPressTime = 0;       // timestamp of last key press
        state.climbSpeed = 0;          // rolling speed metric (decays over time)
        state.stamina = 1.0;           // 1.0 = fresh, 0 = exhausted
    },

    handleInput(state, code, type) {
        if (type !== 'down') return;

        // During countdown, space can be used to skip (or just wait)
        if (state.phase === 'countdown') return;
        if (state.phase !== 'running') return;

        const isLeft = code === 'ArrowLeft';
        const isRight = code === 'ArrowRight';
        if (!isLeft && !isRight) return;

        const direction = isLeft ? 'left' : 'right';
        const now = performance.now();
        const timeSinceLast = now - state.lastPressTime;
        state.lastPressTime = now;

        // Track climbing speed: how fast the player is mashing (lower = faster)
        // Anything under ~120ms between presses is "sprinting"
        const speedBoost = Math.max(0, 1 - timeSinceLast / 200);
        state.climbSpeed = Math.min(1, state.climbSpeed + speedBoost * 0.4);

        // Stamina drains faster the quicker you climb
        // Pressing faster than ~150ms apart burns stamina rapidly
        const staminaDrain = timeSinceLast < 100 ? 0.12 :
                             timeSinceLast < 150 ? 0.07 :
                             timeSinceLast < 250 ? 0.03 : 0.01;
        state.stamina = Math.max(0, state.stamina - staminaDrain);

        // Speed multiplier: climbing fast multiplies all tilt effects
        const speedPenalty = 1 + state.climbSpeed * 3;

        // Exhaustion multiplier: low stamina = shaky hands = more tilt
        const exhaustionPenalty = 1 + (1 - state.stamina) * 2;

        // Must alternate keys to climb
        if (direction !== state.lastKey) {
            // Too exhausted? Can't climb, just wobble
            if (state.stamina <= 0.05) {
                const heightRatio = state.rung / LADDER.totalRungs;
                const heightFactor = 1 + heightRatio * heightRatio * 8;
                const tiltAdd = LADDER.tiltPerPress * 2 * heightFactor * exhaustionPenalty;
                state.tiltVelocity += isLeft ? -tiltAdd : tiltAdd;
                SFX.play('creak');
                state.lastKey = direction;
                return;
            }

            // Successful alternation - climb one rung
            state.rung++;
            state.climbAnim = 1.0;
            state.lastKey = direction;

            // Tilt in the direction pressed, scaled by height + speed + exhaustion
            const heightRatio = state.rung / LADDER.totalRungs;
            const heightFactor = 1 + heightRatio * heightRatio * 8;
            const tiltAdd = LADDER.tiltPerPress * heightFactor * speedPenalty * exhaustionPenalty;
            state.tiltVelocity += isLeft ? -tiltAdd : tiltAdd;

            SFX.play('climbStep');

            // Update score
            state.score = Math.min(
                (state.rung / LADDER.totalRungs) * LADDER.maxHeight,
                LADDER.maxHeight
            );

            // Check if reached top
            if (state.rung >= LADDER.totalRungs) {
                state.reachedTop = true;
                state.phase = 'victory';
                state.victoryTimer = 2.0;
                SFX.play('victory');
            }
        } else {
            // Same key pressed twice - severe tilt penalty!
            const heightRatio = state.rung / LADDER.totalRungs;
            const heightFactor = 1 + heightRatio * heightRatio * 10;
            const tiltAdd = LADDER.tiltPerPress * 4 * heightFactor * speedPenalty;
            state.tiltVelocity += isLeft ? -tiltAdd : tiltAdd;
            SFX.play('creak');
        }
    },

    update(state, dt) {
        state.frame++;

        // --- Countdown phase ---
        if (state.phase === 'countdown') {
            state.countdown -= dt;
            if (state.countdown <= 0) {
                state.phase = 'running';
                state.countdown = 0;
                SFX.play('whistle');
            }
            return;
        }

        // --- Victory phase ---
        if (state.phase === 'victory') {
            state.victoryTimer -= dt;
            state.timer += dt;
            // Add sparkles
            if (state.frame % 4 === 0) {
                state.sparkles.push({
                    x: LADDER.baseX + (Math.random() - 0.5) * 100,
                    y: LADDER.baseY - LADDER.totalRungs * LADDER.rungSpacing - 40 + (Math.random() - 0.5) * 60,
                    vx: (Math.random() - 0.5) * 80,
                    vy: -Math.random() * 60 - 20,
                    life: 1.0,
                });
            }
            state.sparkles.forEach(s => {
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                s.vy += 40 * dt;
                s.life -= dt * 0.8;
            });
            state.sparkles = state.sparkles.filter(s => s.life > 0);

            if (state.victoryTimer <= 0) {
                state.phase = 'done';
            }
            return;
        }

        // --- Falling phase ---
        if (state.phase === 'falling') {
            state.fallTimer += dt;
            state.tilt += state.fallDirection * dt * 2.5;
            state.shakeTimer = Math.max(0, state.shakeTimer - dt);
            if (state.fallTimer > 1.5) {
                state.phase = 'done';
            }
            return;
        }

        // --- Running phase ---
        if (state.phase !== 'running') return;

        state.timer += dt;

        // Climb animation decay
        if (state.climbAnim > 0) {
            state.climbAnim = Math.max(0, state.climbAnim - dt * 8);
        }

        // Climb speed decays over time (if you pause, speed resets)
        state.climbSpeed = Math.max(0, state.climbSpeed - dt * 1.5);

        // Stamina recovers slowly when not pressing (reward patience)
        state.stamina = Math.min(1, state.stamina + dt * 0.15);

        // Wind gusts (stronger and more frequent at height)
        state.windTimer -= dt;
        if (state.windTimer <= 0) {
            const heightRatio = state.rung / LADDER.totalRungs;
            const windStrength = 0.2 + heightRatio * 0.5;
            state.windForce = (Math.random() - 0.5) * 2 * windStrength;
            state.windTimer = 0.8 + Math.random() * 2 * (1 - heightRatio * 0.5);
        }

        // Apply gravity to tilt (exponential with height)
        const heightRatio = state.rung / LADDER.totalRungs;
        const gravityForce = LADDER.gravity * (1 + heightRatio * heightRatio * LADDER.heightInstability * state.rung);
        state.tiltVelocity += state.tilt * gravityForce * dt;

        // Apply wind (scales with height - much worse at the top)
        state.tiltVelocity += state.windForce * dt * (0.2 + heightRatio * 1.5);

        // Apply damping
        state.tiltVelocity *= LADDER.tiltDamping;

        // Update tilt
        state.tilt += state.tiltVelocity * dt;

        // Check for fall
        if (Math.abs(state.tilt) > LADDER.maxTilt) {
            state.phase = 'falling';
            state.fallDirection = state.tilt > 0 ? 1 : -1;
            state.fallTimer = 0;
            state.shakeTimer = 0.3;
            state.foul = false; // not a foul, just fell
            SFX.play('fall');
        }

        // Update HUD
        UI.updateHUD({
            eventName: 'Ladder Climbing',
            playerName: Game.players[Game.currentPlayerIndex]?.name || '',
            score: state.score.toFixed(2) + ' m',
            timer: state.timer.toFixed(1) + 's',
            attempt: Game.practiceMode
                ? 'PRACTICE'
                : (EVENTS[0].attempts > 1
                    ? `ATTEMPT ${Game.currentAttempt + 1}/${EVENTS[0].attempts}`
                    : ''),
        });
    },
};

EventRenderers.ladder = function(ctx, state) {
    const W = 900, H = 500;

    // Screen shake
    let shakeX = 0, shakeY = 0;
    if (state.shakeTimer > 0) {
        shakeX = (Math.random() - 0.5) * 8;
        shakeY = (Math.random() - 0.5) * 8;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // --- Sky ---
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 250);
    skyGrad.addColorStop(0, '#2E86DE');
    skyGrad.addColorStop(1, '#87CEEB');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // --- Clouds ---
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const cloudOffset = (state.frame * 0.3) % W;
    [[100, 40, 60], [350, 60, 45], [650, 30, 55], [820, 70, 40]].forEach(([bx, by, r]) => {
        const cx = (bx + cloudOffset) % (W + 100) - 50;
        ctx.beginPath();
        ctx.arc(cx, by, r, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.6, by - r * 0.2, r * 0.7, 0, Math.PI * 2);
        ctx.arc(cx - r * 0.5, by + r * 0.1, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
    });

    // --- Distant stadium / crowd ---
    ctx.fillStyle = '#6D5D4E';
    ctx.fillRect(0, 160, W, 60);
    // Crowd dots (seeded by frame to avoid flicker - use fixed seed)
    const crowdSeed = 42;
    for (let i = 0; i < 150; i++) {
        const px = ((i * 7 + crowdSeed * 13) % W);
        const py = 163 + ((i * 11 + crowdSeed * 7) % 54);
        const colorIdx = (i * 3 + crowdSeed) % 6;
        const colors = ['#E53935','#1E88E5','#FDD835','#43A047','#F4511E','#FFFFFF'];
        ctx.fillStyle = colors[colorIdx];
        ctx.fillRect(px, py, 3, 4);
    }

    // --- Grass field ---
    const grassGrad = ctx.createLinearGradient(0, 220, 0, H);
    grassGrad.addColorStop(0, '#4CAF50');
    grassGrad.addColorStop(1, '#2E7D32');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, 220, W, H - 220);

    // Grass texture lines
    ctx.strokeStyle = '#388E3C';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, LADDER.baseY + 2);
        ctx.lineTo(x + 3, LADDER.baseY - 4);
        ctx.stroke();
    }

    // --- Ground shadow under ladder ---
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(LADDER.baseX, LADDER.baseY + 5, 60, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- Draw the ladder (rotated by tilt) ---
    ctx.save();
    ctx.translate(LADDER.baseX, LADDER.baseY);
    ctx.rotate(state.tilt);

    const lw = LADDER.ladderWidth;
    const halfW = lw / 2;
    const rungCount = LADDER.totalRungs;
    const rungSpacing = LADDER.rungSpacing;
    const ladderPixelH = rungCount * rungSpacing + 20;

    // Side rails
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-halfW, 0);
    ctx.lineTo(-halfW, -ladderPixelH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, -ladderPixelH);
    ctx.stroke();

    // Rail highlights
    ctx.strokeStyle = '#C49A2A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-halfW + 2, 0);
    ctx.lineTo(-halfW + 2, -ladderPixelH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(halfW - 2, 0);
    ctx.lineTo(halfW - 2, -ladderPixelH);
    ctx.stroke();

    // Rungs
    for (let i = 1; i <= rungCount; i++) {
        const ry = -i * rungSpacing;
        const isCurrentRung = i === state.rung;
        const isBelowAthlete = i <= state.rung;

        ctx.strokeStyle = isBelowAthlete ? '#A07818' : '#8B6914';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-halfW + 3, ry);
        ctx.lineTo(halfW - 3, ry);
        ctx.stroke();

        // Rung highlight
        if (isCurrentRung && state.phase === 'running') {
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-halfW + 3, ry - 1);
            ctx.lineTo(halfW - 3, ry - 1);
            ctx.stroke();
        }
    }

    // --- Draw athlete on ladder ---
    if (state.phase !== 'falling' || state.fallTimer < 0.5) {
        const av = AvatarRenderer.getAvatar();
        const skinColor = AvatarRenderer.getOption('skinTone', av.skinTone).color;
        const shirtCol = AvatarRenderer.getOption('shirtColor', av.shirtColor).color;
        const shortsCol = AvatarRenderer.getOption('shortsColor', av.shortsColor).color;
        const shoesCol = AvatarRenderer.getOption('shoesColor', av.shoesColor).color;
        const hairCol = AvatarRenderer.getOption('hairColor', av.hairColor).color;
        const accCol = AvatarRenderer.getOption('accessoryColor', av.accessoryColor).color;

        const athleteRung = Math.min(state.rung, rungCount);
        const athleteY = -athleteRung * rungSpacing;
        const climbBob = state.climbAnim * -4;
        const onLeft = state.lastKey === 'left';

        // Cape (behind body)
        if (av.accessory === 'cape') {
            ctx.fillStyle = accCol;
            const capeWave = Math.sin(state.frame * 0.15) * 3;
            ctx.beginPath();
            ctx.moveTo(-5, athleteY - rungSpacing * 0.6 + climbBob - 8);
            ctx.lineTo(5, athleteY - rungSpacing * 0.6 + climbBob - 8);
            ctx.lineTo(8 + capeWave, athleteY + 4 + climbBob);
            ctx.lineTo(-8 + capeWave, athleteY + 4 + climbBob);
            ctx.closePath();
            ctx.fill();
        }

        // Feet / shoes on rungs
        ctx.fillStyle = shoesCol;
        const footRung1 = athleteY;
        const footRung2 = athleteY + rungSpacing * 0.4;
        ctx.fillRect(onLeft ? -halfW + 4 : 2, footRung1 - 3 + climbBob, 12, 4);
        ctx.fillRect(onLeft ? 2 : -halfW + 4, footRung2 - 3 + climbBob, 12, 4);

        // Legs
        ctx.strokeStyle = skinColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(onLeft ? -halfW + 10 : 8, footRung1 - 1 + climbBob);
        ctx.lineTo(0, athleteY - rungSpacing * 0.6 + climbBob);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(onLeft ? 8 : -halfW + 10, footRung2 - 1 + climbBob);
        ctx.lineTo(0, athleteY - rungSpacing * 0.6 + climbBob);
        ctx.stroke();

        // Shorts
        const bodyBottom = athleteY - rungSpacing * 0.6 + climbBob;
        ctx.fillStyle = shortsCol;
        ctx.fillRect(-6, bodyBottom - 4, 12, av.shorts === 'long' ? 8 : 5);

        // Body / shirt
        const bodyTop = bodyBottom - 18;
        ctx.fillStyle = shirtCol;
        ctx.fillRect(-6, bodyTop, 12, 14);
        if (av.shirt === 'jersey') {
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('1', 0, bodyTop + 10);
        }

        // Arms gripping rungs above
        ctx.strokeStyle = skinColor;
        ctx.lineWidth = 3;
        const handRungY = athleteY - rungSpacing;
        ctx.beginPath();
        ctx.moveTo(-4, bodyTop + 3);
        ctx.lineTo(onLeft ? -halfW + 6 : halfW - 6, handRungY + climbBob);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(4, bodyTop + 3);
        ctx.lineTo(onLeft ? halfW - 6 : -halfW + 6, handRungY + climbBob);
        ctx.stroke();

        // Wristbands
        if (av.accessory === 'wristband') {
            ctx.fillStyle = accCol;
            ctx.fillRect(onLeft ? -halfW + 4 : halfW - 8, handRungY + climbBob - 2, 4, 3);
            ctx.fillRect(onLeft ? halfW - 8 : -halfW + 4, handRungY + climbBob - 2, 4, 3);
        }

        // Head
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(0, bodyTop - 7, 7, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        if (av.hair !== 'bald') {
            ctx.fillStyle = hairCol;
            if (av.hair === 'short') {
                ctx.beginPath();
                ctx.arc(0, bodyTop - 10, 6, Math.PI, Math.PI * 2);
                ctx.fill();
            } else if (av.hair === 'spiky') {
                for (let i = -2; i <= 2; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * 3, bodyTop - 14);
                    ctx.lineTo(i * 3 - 2, bodyTop - 8);
                    ctx.lineTo(i * 3 + 2, bodyTop - 8);
                    ctx.closePath();
                    ctx.fill();
                }
            } else if (av.hair === 'long') {
                ctx.beginPath();
                ctx.arc(0, bodyTop - 10, 6, Math.PI, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(-6, bodyTop - 10, 3, 10);
                ctx.fillRect(3, bodyTop - 10, 3, 10);
            } else if (av.hair === 'mohawk') {
                ctx.fillRect(-2, bodyTop - 18, 4, 10);
            } else if (av.hair === 'afro') {
                ctx.beginPath();
                ctx.arc(0, bodyTop - 10, 9, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Headband
        if (av.accessory === 'headband') {
            ctx.fillStyle = accCol;
            ctx.fillRect(-7, bodyTop - 9, 14, 2);
        }

        // Sunglasses
        if (av.accessory === 'sunglasses') {
            ctx.fillStyle = '#111';
            ctx.fillRect(-5, bodyTop - 8, 4, 2);
            ctx.fillRect(1, bodyTop - 8, 4, 2);
            ctx.fillRect(-1, bodyTop - 8, 2, 1);
        }
    }

    ctx.restore(); // end ladder rotation

    // --- Falling athlete (detached from ladder after a moment) ---
    if (state.phase === 'falling' && state.fallTimer > 0.3) {
        const fallX = LADDER.baseX + state.fallDirection * state.fallTimer * 120;
        const fallY = LADDER.baseY - (state.rung * rungSpacing) * Math.max(0, 1 - state.fallTimer * 1.5);
        const fallRot = state.fallDirection * state.fallTimer * 4;

        ctx.save();
        ctx.translate(fallX, fallY);
        ctx.rotate(fallRot);

        // Simple tumbling figure using avatar colors
        const fav = AvatarRenderer.getAvatar();
        const fSkin = AvatarRenderer.getOption('skinTone', fav.skinTone).color;
        const fShirt = AvatarRenderer.getOption('shirtColor', fav.shirtColor).color;
        const fShorts = AvatarRenderer.getOption('shortsColor', fav.shortsColor).color;
        ctx.fillStyle = fSkin;
        ctx.beginPath();
        ctx.arc(0, -12, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = fShirt;
        ctx.fillRect(-5, -6, 10, 14);
        ctx.fillStyle = fShorts;
        ctx.fillRect(-5, 4, 10, 4);
        ctx.fillStyle = fSkin;
        ctx.fillRect(-3, 8, 3, 8);
        ctx.fillRect(1, 8, 3, 8);

        ctx.restore();
    }

    // --- Balance meter ---
    const meterX = W - 120;
    const meterY = 250;
    const meterW = 20;
    const meterH = 200;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(meterX - 2, meterY - 2, meterW + 4, meterH + 4);

    // Danger zones (red at extremes)
    const dangerSize = meterH * 0.2;
    ctx.fillStyle = 'rgba(229, 57, 53, 0.5)';
    ctx.fillRect(meterX, meterY, meterW, dangerSize);
    ctx.fillRect(meterX, meterY + meterH - dangerSize, meterW, dangerSize);

    // Safe zone (green in middle)
    ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
    ctx.fillRect(meterX, meterY + dangerSize, meterW, meterH - dangerSize * 2);

    // Tilt indicator
    const tiltNorm = state.tilt / LADDER.maxTilt; // -1 to 1
    const indicatorY = meterY + meterH / 2 + tiltNorm * (meterH / 2);
    const indicatorColor = Math.abs(tiltNorm) > 0.6 ? '#E53935' :
                           Math.abs(tiltNorm) > 0.3 ? '#FFC107' : '#4CAF50';
    ctx.fillStyle = indicatorColor;
    ctx.fillRect(meterX - 4, indicatorY - 4, meterW + 8, 8);

    // Label
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BALANCE', meterX + meterW / 2, meterY - 8);

    // --- Height meter (left side) ---
    const hmX = 30;
    const hmY = 250;
    const hmH = 200;
    const hmW = 16;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(hmX - 2, hmY - 2, hmW + 4, hmH + 4);

    // Fill based on height
    const heightRatio = state.rung / LADDER.totalRungs;
    const fillH = heightRatio * hmH;
    ctx.fillStyle = '#2196F3';
    ctx.fillRect(hmX, hmY + hmH - fillH, hmW, fillH);

    // Markings
    ctx.fillStyle = '#FFF';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    for (let m = 0; m <= 10; m += 2) {
        const my = hmY + hmH - (m / 10) * hmH;
        ctx.fillText(m + 'm', hmX + hmW + 4, my + 3);
        ctx.fillRect(hmX, my, hmW, 1);
    }

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HEIGHT', hmX + hmW / 2, hmY - 8);

    // --- Stamina bar (below height meter) ---
    const stX = hmX - 2;
    const stY = hmY + hmH + 16;
    const stW = hmW + 4;
    const stH = 60;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(stX, stY, stW, stH);

    const stFill = state.stamina * stH;
    const stColor = state.stamina > 0.5 ? '#4CAF50' :
                    state.stamina > 0.2 ? '#FFC107' : '#E53935';
    ctx.fillStyle = stColor;
    ctx.fillRect(stX, stY + stH - stFill, stW, stFill);

    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STA', stX + stW / 2, stY - 3);

    // --- Countdown overlay ---
    if (state.phase === 'countdown') {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, W, H);

        const countNum = Math.ceil(state.countdown);
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 120px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(countNum > 0 ? countNum : 'GO!', W / 2, H / 2);
        ctx.textBaseline = 'alphabetic';

        ctx.fillStyle = '#FFF';
        ctx.font = '18px monospace';
        ctx.fillText('GET READY - ALTERNATE LEFT/RIGHT TO CLIMB!', W / 2, H / 2 + 80);
    }

    // --- Wind indicator ---
    if (state.phase === 'running' && Math.abs(state.windForce) > 0.03) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        const windDir = state.windForce > 0 ? '>>>' : '<<<';
        ctx.fillText('WIND ' + windDir, W / 2, 245);
    }

    // --- Victory sparkles ---
    if (state.sparkles) {
        state.sparkles.forEach(s => {
            ctx.fillStyle = `rgba(255, 215, 0, ${s.life})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 3 + s.life * 3, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // --- Victory text ---
    if (state.phase === 'victory') {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TOP REACHED!', W / 2, 140);
        ctx.font = '20px monospace';
        ctx.fillText(state.score.toFixed(2) + ' m in ' + state.timer.toFixed(1) + 's', W / 2, 175);
    }

    // --- Fall text ---
    if (state.phase === 'falling') {
        ctx.fillStyle = '#E53935';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TIMBER!', W / 2, 140);
    }

    ctx.restore(); // end shake transform
};

// ============================================================
//  BOOT THROWING - Event Implementation
// ============================================================

const BOOT = {
    minDist: 6,             // minimum chopping block distance (meters)
    maxDist: 20,            // maximum distance
    blockWidth: 1.2,        // chopping block width in meters (landing zone)
    maxSpin: 5,             // max spin rotations
    spinNeedleBaseSpeed: 0.8, // needle oscillation base speed
    powerChargeRate: 0.6,   // power charges per second while holding
    flightDuration: 1.2,    // base flight time seconds
    maxWind: 4.0,           // max wind m/s (+ = tailwind, - = headwind)
    gravity: 9.8,
    // Scoring
    basePointsPerMeter: 3,  // base points per meter of distance
    spinMultBase: 1.0,      // spin multiplier = spinMultBase + spins * spinMultPerSpin
    spinMultPerSpin: 0.4,
    // Precision: how far off you can be and still score
    landingTolerance: 0.3,  // extra meters beyond block edge for partial score
};

EventLogic.boot = {
    init(state) {
        state.phase = 'ready';
        state.timer = 0;
        state.frame = 0;
        state.score = 0;

        // Randomize distance and wind
        const attemptNum = (Game.currentAttempt || 0);
        // Distance increases with attempt: attempt 0=easy, 1=medium, 2=hard
        const minD = BOOT.minDist + attemptNum * 3;
        const maxD = Math.min(BOOT.maxDist, minD + 6);
        state.blockDist = minD + Math.random() * (maxD - minD);
        state.blockDist = Math.round(state.blockDist * 10) / 10;

        // Wind: random, stronger on later attempts
        const windRange = BOOT.maxWind * (0.4 + attemptNum * 0.3);
        state.wind = (Math.random() - 0.5) * 2 * windRange;
        state.wind = Math.round(state.wind * 10) / 10;

        // Spin phase - oscillating needle
        state.spin = 0;             // final spin value (0 to maxSpin)
        state.spinNeedle = 0;       // needle position 0-1
        state.spinNeedleDir = 1;    // direction
        state.spinSet = false;

        // Power phase - hold to charge
        state.power = 0;            // 0 to 1 (charges while holding)
        state.powerCharging = false;
        state.powerSet = false;
        state.powerValue = 0;       // locked power

        // Flight phase
        state.bootX = 0;            // 0 to 1 progress
        state.bootArc = 0;          // y offset (arc)
        state.bootAngle = 0;        // rotation
        state.flightTime = 0;
        state.flightTotal = 0;

        // Landing
        state.landingX = 0;         // where boot actually lands (meters)
        state.landed = false;
        state.onBlock = false;
        state.landingScore = 0;
        state.resultTimer = 0;

        // Visual
        state.athleteFrame = 0;
        state.throwAnim = 0;
        state.particles = [];

        // Seagull - random chance to appear (~60%)
        state.seagull = null;
        state.seagullHit = false;
        state.seagullBonus = 0;
        if (Math.random() < 0.6) {
            const fromLeft = Math.random() < 0.5;
            state.seagull = {
                x: fromLeft ? -30 : 930,      // start off-screen
                y: 120 + Math.random() * 100,  // random height in the sky
                dir: fromLeft ? 1 : -1,
                speed: 60 + Math.random() * 50, // px/sec
                wingFrame: 0,
                alive: true,
            };
        }
    },

    handleInput(state, code, type) {
        if (code !== 'Space') return;

        // Ready phase -> start spin gauge
        if (state.phase === 'ready' && type === 'down') {
            state.phase = 'spin';
            SFX.play('charge');
            return;
        }

        // Spin phase - press space to lock the oscillating needle
        if (state.phase === 'spin' && type === 'down') {
            state.spinSet = true;
            // Map needle position to spin zone (same zone layout as renderer)
            const weights = [32, 16, 8, 4, 2, 1];
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            let accum = 0;
            state.spin = 0;
            for (let i = 0; i < weights.length; i++) {
                accum += weights[i];
                if (state.spinNeedle < accum / totalWeight) {
                    state.spin = i;
                    break;
                }
            }
            if (state.spinNeedle >= 1) state.spin = BOOT.maxSpin;
            state.phase = 'power';
            state.power = 0;
            SFX.play('tick');
            return;
        }

        // Power phase - hold to charge, release to set
        if (state.phase === 'power') {
            if (type === 'down') {
                state.powerCharging = true;
            }
            if (type === 'up' && state.powerCharging) {
                state.powerCharging = false;
                state.powerSet = true;
                state.powerValue = state.power;
                state.phase = 'throw';
                state.throwAnim = 1.0;
                SFX.play('throw');
            }
            return;
        }
    },

    update(state, dt) {
        state.frame++;
        state.timer += dt;

        // --- Spin needle oscillation ---
        if (state.phase === 'spin') {
            // Needle bounces back and forth, speed increases over time
            const needleSpeed = 0.8 + state.timer * 0.3;
            state.spinNeedle += state.spinNeedleDir * needleSpeed * dt;
            if (state.spinNeedle >= 1) { state.spinNeedle = 1; state.spinNeedleDir = -1; }
            if (state.spinNeedle <= 0) { state.spinNeedle = 0; state.spinNeedleDir = 1; }
        }

        // --- Power charging ---
        if (state.phase === 'power' && state.powerCharging) {
            state.power = Math.min(1, state.power + BOOT.powerChargeRate * dt);
            if (state.frame % 8 === 0) SFX.play('charge');
        }

        // --- Seagull movement ---
        if (state.seagull && state.seagull.alive) {
            state.seagull.x += state.seagull.dir * state.seagull.speed * dt;
            state.seagull.wingFrame += dt * 6;
            // Gentle bob
            state.seagull.y += Math.sin(state.seagull.wingFrame * 0.7) * 0.3;
        }

        // --- Throw animation (brief windup before flight) ---
        if (state.phase === 'throw') {
            state.throwAnim -= dt * 4;
            if (state.throwAnim <= 0) {
                state.throwAnim = 0;
                state.phase = 'flight';
                // Calculate landing position based on power + wind
                const powerMeters = state.powerValue * (BOOT.maxDist + 4);
                // Wind effect: tailwind (+) pushes boot further, headwind (-) holds it back
                // Scaled so max wind (4 m/s) shifts landing by ~5m
                const windEffect = state.wind * 1.2;
                state.landingX = powerMeters + windEffect;
                // Spin makes landing less precise (wobble)
                const spinWobble = (Math.random() - 0.5) * state.spin * 0.4;
                state.landingX += spinWobble;
                state.landingX = Math.max(0, state.landingX);
                // Flight duration proportional to distance
                state.flightTotal = BOOT.flightDuration * (0.6 + state.powerValue * 0.8);
                state.flightTime = 0;
                SFX.play('woosh');
            }
        }

        // --- Flight ---
        if (state.phase === 'flight') {
            state.flightTime += dt;
            const t = Math.min(1, state.flightTime / state.flightTotal);
            state.bootX = t;
            // Parabolic arc
            state.bootArc = 4 * t * (1 - t);
            // Spin rotation
            state.bootAngle += state.spin * 2 * Math.PI * dt * 1.5;

            // Seagull collision check
            if (state.seagull && state.seagull.alive && !state.seagullHit) {
                // Calculate boot pixel position (same formula as renderer)
                const viewMaxM = BOOT.maxDist + 5;
                const fieldLeft = 80, fieldRight = 860;
                const fieldW = fieldRight - fieldLeft;
                const bootMeters = t * state.landingX;
                const bootPxX = fieldLeft + (bootMeters / viewMaxM) * fieldW;
                const arcHeight = 120 + state.powerValue * 60;
                const bootPxY = 380 - 30 - state.bootArc * arcHeight;

                const dx = bootPxX - state.seagull.x;
                const dy = bootPxY - state.seagull.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 25) {
                    state.seagullHit = true;
                    state.seagull.alive = false;
                    state.seagullBonus = 25;
                    SFX.play('thunk');
                    // Feather particles
                    for (let i = 0; i < 15; i++) {
                        state.particles.push({
                            x: state.seagull.x - bootPxX,
                            y: state.seagull.y - bootPxY,
                            vx: (Math.random() - 0.5) * 100,
                            vy: (Math.random() - 0.5) * 80,
                            life: 1.2,
                            color: '#F5F5F5',
                        });
                    }
                }
            }

            if (t >= 1) {
                state.phase = 'landing';
                state.landed = true;
                // Check if on block
                const blockCenter = state.blockDist;
                const halfBlock = BOOT.blockWidth / 2;
                const dist = Math.abs(state.landingX - blockCenter);
                if (dist <= halfBlock) {
                    // Direct hit!
                    state.onBlock = true;
                    const spinMult = BOOT.spinMultBase + state.spin * BOOT.spinMultPerSpin;
                    state.landingScore = Math.round(state.blockDist * BOOT.basePointsPerMeter * spinMult);
                    SFX.play('thunk');
                } else if (dist <= halfBlock + BOOT.landingTolerance) {
                    // Glancing hit — partial score
                    state.onBlock = true;
                    const closeness = 1 - (dist - halfBlock) / BOOT.landingTolerance;
                    const spinMult = BOOT.spinMultBase + state.spin * BOOT.spinMultPerSpin;
                    state.landingScore = Math.round(state.blockDist * BOOT.basePointsPerMeter * spinMult * closeness * 0.5);
                    SFX.play('thunk');
                } else {
                    state.onBlock = false;
                    state.landingScore = 0;
                    SFX.play('miss');
                }
                state.landingScore += state.seagullBonus;
                state.score = state.landingScore;
                state.resultTimer = state.seagullHit ? 3.0 : 2.5;

                // Landing particles
                for (let i = 0; i < 12; i++) {
                    state.particles.push({
                        x: 0, y: 0,
                        vx: (Math.random() - 0.5) * 80,
                        vy: -Math.random() * 60 - 10,
                        life: 1.0,
                        color: state.onBlock ? '#FFD700' : '#8B6914',
                    });
                }
            }
        }

        // --- Landing result display ---
        if (state.phase === 'landing') {
            state.resultTimer -= dt;
            // Update particles
            state.particles.forEach(p => {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy += 120 * dt;
                p.life -= dt * 1.2;
            });
            state.particles = state.particles.filter(p => p.life > 0);

            if (state.resultTimer <= 0) {
                state.phase = 'done';
            }
        }

        // Update HUD
        let hudScore = '';
        if (state.phase === 'spin') hudScore = 'SPIN: ' + state.spin.toFixed(1);
        else if (state.phase === 'power') hudScore = 'POWER';
        else if (state.phase === 'landing') hudScore = state.onBlock ? state.landingScore + ' pts' : 'MISS!';

        UI.updateHUD({
            eventName: 'Boot Throwing',
            playerName: Game.players[Game.currentPlayerIndex]?.name || '',
            score: hudScore,
            timer: 'Dist: ' + state.blockDist.toFixed(1) + 'm  Wind: ' + (state.wind > 0 ? '+' : '') + state.wind.toFixed(1),
            attempt: Game.practiceMode
                ? 'PRACTICE'
                : (EVENTS.find(e => e.id === 'boot').attempts > 1
                    ? `ATTEMPT ${Game.currentAttempt + 1}/${EVENTS.find(e => e.id === 'boot').attempts}`
                    : ''),
        });
    },
};

EventRenderers.boot = function(ctx, state) {
    const W = 900, H = 500;

    // --- Sky ---
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 220);
    skyGrad.addColorStop(0, '#5DADE2');
    skyGrad.addColorStop(1, '#AED6F1');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // --- Clouds ---
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const co = (state.frame * 0.2) % W;
    [[80,50,50],[300,35,40],[550,55,45],[780,40,35]].forEach(([bx,by,r]) => {
        const cx = (bx + co) % (W + 80) - 40;
        ctx.beginPath();
        ctx.arc(cx, by, r, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.5, by - r * 0.15, r * 0.65, 0, Math.PI * 2);
        ctx.arc(cx - r * 0.4, by + r * 0.1, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
    });

    // --- Background trees ---
    ctx.fillStyle = '#2E7D32';
    for (let i = 0; i < 15; i++) {
        const tx = i * 65 + 20;
        const ty = 210;
        const th = 30 + (i * 7 % 20);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - 12, ty + th);
        ctx.lineTo(tx + 12, ty + th);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1B5E20';
        ctx.beginPath();
        ctx.moveTo(tx, ty - 10);
        ctx.lineTo(tx - 10, ty + 15);
        ctx.lineTo(tx + 10, ty + 15);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2E7D32';
    }

    // --- Ground ---
    const groundY = 380;
    const grassGrad = ctx.createLinearGradient(0, 220, 0, H);
    grassGrad.addColorStop(0, '#66BB6A');
    grassGrad.addColorStop(0.3, '#4CAF50');
    grassGrad.addColorStop(1, '#2E7D32');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, 220, W, H - 220);

    // --- Field scale: convert meters to pixels ---
    // The view spans from 0m (left) to maxDist+5m (right)
    const viewMaxM = BOOT.maxDist + 5;
    const fieldLeft = 80;
    const fieldRight = W - 40;
    const fieldW = fieldRight - fieldLeft;
    const mToX = (m) => fieldLeft + (m / viewMaxM) * fieldW;

    // --- Distance markers ---
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (let m = 5; m <= 20; m += 5) {
        const mx = mToX(m);
        ctx.fillRect(mx, groundY - 2, 1, 4);
        ctx.fillText(m + 'm', mx, groundY + 14);
    }

    // --- Chopping block ---
    const blockX = mToX(state.blockDist);
    const blockW = (BOOT.blockWidth / viewMaxM) * fieldW;
    // Stump
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(blockX - blockW / 2, groundY - 35, blockW, 35);
    // Stump top
    ctx.fillStyle = '#8D6E63';
    ctx.fillRect(blockX - blockW / 2 - 2, groundY - 37, blockW + 4, 5);
    // Bark lines
    ctx.strokeStyle = '#4E342E';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        const lx = blockX - blockW / 2 + 4 + i * (blockW / 3);
        ctx.beginPath();
        ctx.moveTo(lx, groundY - 32);
        ctx.lineTo(lx, groundY);
        ctx.stroke();
    }
    // Top ring pattern
    ctx.strokeStyle = '#A1887F';
    ctx.beginPath();
    ctx.arc(blockX, groundY - 35, blockW / 3, 0, Math.PI * 2);
    ctx.stroke();

    // --- Landing zone highlight ---
    if (state.phase === 'ready' || state.phase === 'spin' || state.phase === 'power') {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
        const zoneW = blockW + (BOOT.landingTolerance / viewMaxM) * fieldW * 2;
        ctx.fillRect(blockX - zoneW / 2, groundY - 40, zoneW, 42);
    }

    // --- Athlete (left side) ---
    const athleteX = fieldLeft - 10;
    const athleteBaseY = groundY;
    if (state.phase === 'throw' && state.throwAnim > 0) {
        // Throwing animation: lean forward
        ctx.save();
        ctx.translate(athleteX, athleteBaseY);
        ctx.rotate(-state.throwAnim * 0.3);
        ctx.translate(-athleteX, -athleteBaseY);
        AvatarRenderer.draw(ctx, athleteX, athleteBaseY, 1.2, state.frame);
        ctx.restore();
    } else {
        AvatarRenderer.draw(ctx, athleteX, athleteBaseY, 1.2, 0);
    }

    // --- Boot in flight ---
    if (state.phase === 'flight' || state.phase === 'landing') {
        const bootMeters = state.phase === 'flight'
            ? state.bootX * state.landingX
            : state.landingX;
        const bootPxX = mToX(bootMeters);
        const arcHeight = 120 + state.powerValue * 60;
        const bootPxY = state.phase === 'flight'
            ? groundY - 30 - state.bootArc * arcHeight
            : groundY - 30;
        const angle = state.bootAngle;

        ctx.save();
        ctx.translate(bootPxX, bootPxY);
        ctx.rotate(angle);

        // Draw boot shape
        ctx.fillStyle = '#4E342E';
        // Sole
        ctx.fillRect(-12, 2, 24, 5);
        // Boot body
        ctx.fillRect(-10, -10, 18, 14);
        // Boot shaft (top part)
        ctx.fillRect(-10, -20, 12, 12);
        // Toe
        ctx.fillStyle = '#3E2723';
        ctx.fillRect(6, -4, 6, 8);
        // Laces
        ctx.strokeStyle = '#D7CCC8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-6, -8); ctx.lineTo(-2, -8);
        ctx.moveTo(-6, -12); ctx.lineTo(-2, -12);
        ctx.moveTo(-6, -16); ctx.lineTo(-2, -16);
        ctx.stroke();

        ctx.restore();

        // Landing particles
        if (state.phase === 'landing') {
            state.particles.forEach(p => {
                ctx.fillStyle = p.color + Math.floor(p.life * 255).toString(16).padStart(2, '0');
                ctx.beginPath();
                ctx.arc(bootPxX + p.x, bootPxY + p.y, 2 + p.life * 2, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    // --- Boot in hand (before throw) ---
    if (state.phase === 'ready' || state.phase === 'spin' || state.phase === 'power' || state.phase === 'throw') {
        if (state.phase !== 'flight') {
            const handX = athleteX + 12;
            const handY = athleteBaseY - 28 - (state.throwAnim || 0) * 15;
            ctx.save();
            ctx.translate(handX, handY);
            ctx.rotate(-0.3 + (state.spin / BOOT.maxSpin) * 1.5);
            ctx.fillStyle = '#4E342E';
            ctx.fillRect(-6, -5, 12, 8);
            ctx.fillRect(-6, -10, 8, 6);
            ctx.fillStyle = '#3E2723';
            ctx.fillRect(4, -3, 4, 5);
            ctx.restore();
        }
    }

    // --- Seagull ---
    if (state.seagull) {
        const sg = state.seagull;
        if (sg.alive) {
            ctx.save();
            ctx.translate(sg.x, sg.y);
            ctx.scale(sg.dir, 1); // flip based on direction

            // Body
            ctx.fillStyle = '#F5F5F5';
            ctx.beginPath();
            ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Head
            ctx.beginPath();
            ctx.arc(10, -3, 4, 0, Math.PI * 2);
            ctx.fill();

            // Beak
            ctx.fillStyle = '#FF8F00';
            ctx.beginPath();
            ctx.moveTo(14, -3);
            ctx.lineTo(19, -2);
            ctx.lineTo(14, -1);
            ctx.closePath();
            ctx.fill();

            // Eye
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(11, -4, 1, 0, Math.PI * 2);
            ctx.fill();

            // Wings (animated flap)
            const wingAngle = Math.sin(sg.wingFrame) * 0.6;
            ctx.fillStyle = '#E0E0E0';
            // Left wing
            ctx.save();
            ctx.translate(-2, -3);
            ctx.rotate(-wingAngle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-14, -6);
            ctx.lineTo(-10, 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            // Right wing
            ctx.save();
            ctx.translate(-2, -3);
            ctx.rotate(wingAngle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-14, 6);
            ctx.lineTo(-10, -2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            ctx.restore();
        }

        // Feather explosion (when hit - particles drawn relative to boot)
        // These are already in the main particles array with white color
    }

    // --- Seagull hit banner ---
    if (state.seagullHit && state.phase === 'landing' && state.resultTimer > 1.5) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        const bounce = Math.sin(state.frame * 0.2) * 3;
        ctx.fillText('SEAGULL HIT! +' + state.seagullBonus + ' BONUS!', W / 2, 210 + bounce);
    }

    // --- Wind indicator ---
    const windX = W / 2;
    const windY = 240;
    const windAbs = Math.abs(state.wind);
    const windStrong = windAbs > 2.5;
    ctx.fillStyle = windStrong ? 'rgba(180,0,0,0.5)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(windX - 120, windY - 14, 240, 28);
    ctx.fillStyle = windStrong ? '#FFD700' : '#FFF';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    if (Math.abs(state.wind) < 0.3) {
        ctx.fillText('WIND: CALM', windX, windY + 4);
    } else {
        const windLabel = state.wind > 0 ? 'TAILWIND (less power)' : 'HEADWIND (more power)';
        const arrows = state.wind > 0 ? '>>> ' : '<<< ';
        ctx.fillText(arrows + windAbs.toFixed(1) + ' m/s ' + windLabel, windX, windY + 4);
    }

    // --- Spin gauge (during spin phase) ---
    // The gauge has non-linear zones: 1 spin is a big zone, 5 spins is a tiny zone
    if (state.phase === 'spin') {
        const gX = 120, gY = 265, gW = 260, gH = 28;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(gX - 6, gY - 22, gW + 12, gH + 50);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PRESS SPACE TO SET SPIN', gX + gW / 2, gY - 8);

        // Draw zones: each spin level gets a zone, higher = narrower
        // Zone widths: 1 spin zone is wide, 5 spin zone is tiny
        // Using exponential distribution so 5 spins is really hard to hit
        const zones = [];
        const totalWeight = 32 + 16 + 8 + 4 + 2 + 1; // 6 zones: 0, 1, 2, 3, 4, 5 spins
        const weights = [32, 16, 8, 4, 2, 1]; // 0 spin is huge, 5 spin is tiny
        let accum = 0;
        for (let i = 0; i < weights.length; i++) {
            const start = accum / totalWeight;
            accum += weights[i];
            const end = accum / totalWeight;
            zones.push({ spin: i, start, end, w: end - start });
        }

        // Draw zone backgrounds
        const zoneColors = ['#555', '#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#E53935'];
        zones.forEach((z, i) => {
            ctx.fillStyle = zoneColors[i];
            ctx.fillRect(gX + z.start * gW, gY, z.w * gW, gH);
            // Zone border
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            ctx.strokeRect(gX + z.start * gW, gY, z.w * gW, gH);
            // Label
            ctx.fillStyle = i <= 2 ? '#000' : '#FFF';
            ctx.font = z.w * gW > 20 ? 'bold 11px monospace' : 'bold 9px monospace';
            ctx.textAlign = 'center';
            const label = i === 0 ? '0' : i + '';
            if (z.w * gW > 12) {
                ctx.fillText(label, gX + (z.start + z.w / 2) * gW, gY + gH / 2 + 4);
            }
        });

        // Multiplier labels below
        ctx.font = '9px monospace';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'center';
        zones.forEach((z, i) => {
            if (z.w * gW > 18) {
                const mult = BOOT.spinMultBase + i * BOOT.spinMultPerSpin;
                ctx.fillText('x' + mult.toFixed(1), gX + (z.start + z.w / 2) * gW, gY + gH + 11);
            }
        });

        // Needle / indicator
        const needleX = gX + state.spinNeedle * gW;
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(needleX, gY - 3);
        ctx.lineTo(needleX, gY + gH + 3);
        ctx.stroke();
        // Needle triangle top
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.moveTo(needleX, gY - 5);
        ctx.lineTo(needleX - 4, gY - 10);
        ctx.lineTo(needleX + 4, gY - 10);
        ctx.closePath();
        ctx.fill();

        // Current spin preview
        let currentSpin = 0;
        for (const z of zones) {
            if (state.spinNeedle >= z.start && state.spinNeedle < z.end) {
                currentSpin = z.spin;
                break;
            }
        }
        if (state.spinNeedle >= 1) currentSpin = BOOT.maxSpin;
        const prevMult = BOOT.spinMultBase + currentSpin * BOOT.spinMultPerSpin;
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(currentSpin + ' SPINS  (x' + prevMult.toFixed(1) + ')', gX + gW / 2, gY + gH + 26);
    }

    // --- Power meter (during power phase) - hold to charge ---
    if (state.phase === 'power') {
        const pmX = 120, pmY = 265, pmW = 260, pmH = 28;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(pmX - 6, pmY - 22, pmW + 12, pmH + 40);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('HOLD SPACE TO CHARGE - RELEASE TO THROW', pmX + pmW / 2, pmY - 8);

        // Bar background
        ctx.fillStyle = '#333';
        ctx.fillRect(pmX, pmY, pmW, pmH);

        // Power fill
        const powerRatio = state.power;
        const pColor = powerRatio < 0.3 ? '#4CAF50' : powerRatio < 0.6 ? '#FFC107' :
                        powerRatio < 0.85 ? '#FF9800' : '#E53935';
        ctx.fillStyle = pColor;
        ctx.fillRect(pmX, pmY, pmW * powerRatio, pmH);

        // Distance markers on the bar
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        for (let m = 5; m <= 20; m += 5) {
            const ratio = m / (BOOT.maxDist + 4);
            const mx = pmX + ratio * pmW;
            ctx.fillRect(mx, pmY, 1, pmH);
            ctx.fillText(m + 'm', mx, pmY + pmH + 10);
        }

        // Power percentage
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(powerRatio * 100) + '%', pmX + pmW / 2, pmY + pmH / 2 + 4);

        // Spin set reminder
        ctx.fillStyle = '#FFD700';
        ctx.font = '10px monospace';
        const spinMult = BOOT.spinMultBase + state.spin * BOOT.spinMultPerSpin;
        ctx.fillText('Spin: ' + Math.round(state.spin) + '  (x' + spinMult.toFixed(1) + ')', pmX + pmW / 2, pmY + pmH + 24);
    }

    // --- Ready prompt ---
    if (state.phase === 'ready') {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(W / 2 - 180, 290, 360, 60);
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PRESS SPACE TO START', W / 2, 320);
        ctx.fillStyle = '#FFF';
        ctx.font = '13px monospace';
        ctx.fillText('Distance: ' + state.blockDist.toFixed(1) + 'm', W / 2, 340);
    }

    // --- Landing result overlay ---
    if (state.phase === 'landing') {
        if (state.onBlock) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 42px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(state.landingScore + ' PTS!', W / 2, 160);

            const spinMult = BOOT.spinMultBase + state.spin * BOOT.spinMultPerSpin;
            ctx.fillStyle = '#FFF';
            ctx.font = '16px monospace';
            ctx.fillText(
                state.blockDist.toFixed(1) + 'm x ' + spinMult.toFixed(1) + ' spin',
                W / 2, 185
            );
        } else {
            ctx.fillStyle = '#E53935';
            ctx.font = 'bold 36px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('MISS!', W / 2, 160);

            const diff = state.landingX - state.blockDist;
            const label = diff > 0 ? 'TOO FAR (' + Math.abs(diff).toFixed(1) + 'm)'
                                   : 'TOO SHORT (' + Math.abs(diff).toFixed(1) + 'm)';
            ctx.fillStyle = '#FFF';
            ctx.font = '14px monospace';
            ctx.fillText(label, W / 2, 185);
        }
    }

    // --- Landing marker (where boot landed, after landing) ---
    if (state.phase === 'landing') {
        const landPx = mToX(state.landingX);
        ctx.strokeStyle = state.onBlock ? '#FFD700' : '#E53935';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(landPx - 8, groundY + 5);
        ctx.lineTo(landPx + 8, groundY + 5);
        ctx.moveTo(landPx, groundY + 1);
        ctx.lineTo(landPx, groundY + 9);
        ctx.stroke();
    }
};

// ============================================================
//  ROCK SKIPPING - Event Implementation
// ============================================================

const ROCK_SKIP = {
    // Angle phase (narrower range + faster needle = precision challenge)
    angleMin: 5,                // degrees (flat throw)
    angleMax: 35,               // degrees (steep throw)
    optimalAngle: 10,           // best angle for skipping
    anglePenaltyRate: 0.030,    // efficiency loss per degree from optimal
    angleNeedleSpeed: 0.90,     // base oscillation speed (fast)
    angleNeedleAccel: 0.15,     // speed increase per second
    optimalZoneHalfWidth: 0.05, // normalized half-width of green zone (tight target)
    // Power phase (oscillating — release at peak for max power)
    powerChargeRate: 1.30,      // how fast the meter sweeps up/down
    maxEnergy: 100,
    // Flight
    throwAnimDuration: 0.25,
    firstFlightDuration: 0.7,
    // Skipping physics
    distancePerEnergy: 0.12,    // meters per energy unit per skip
    energyRetentionGood: 0.74,
    energyRetentionPerfect: 0.84,
    minSkipEnergy: 3,
    // Timing - rebalanced for visual/logic alignment
    ringAnimDuration: 1.5,      // seconds for outer ring to shrink (constant)
    ringAnimShrinkRate: 0.93,   // ring duration shrinks per skip (gentler)
    baseTimingWindow: 0.65,     // seconds (very forgiving first skip)
    windowShrinkRate: 0.88,     // timing window shrinks per skip
    perfectZoneRatio: 0.35,
    // Visual ring sizes - sweet spot crosses sweet ring at sweetProgress
    outerRingMax: 45,           // starting outer ring radius
    sweetRingR: 16,             // sweet spot ring radius
    sweetProgress: 0.64,        // = 1 - sweetRingR/outerRingMax (visual perfect moment)
    // Timing multipliers
    perfectDistanceMult: 1.25,
    goodDistanceMult: 1.0,
    // Waves
    waveAmplitude: 0.05,
    waveFrequency: 2.8,
    waveVisualHeight: 4,
    // Visual
    shoreX: 80,
    waterY: 350,
    cameraScrollSpeed: 200,
    metersToPixels: 30,
};

EventLogic.rockSkip = {
    init(state) {
        state.phase = 'ready';
        state.timer = 0;
        state.frame = 0;
        state.score = 0;
        // Angle
        state.angleNeedle = 0;
        state.angleNeedleDir = 1;
        state.angleSpeed = ROCK_SKIP.angleNeedleSpeed;
        state.angleLocked = 0;
        // Power (oscillates between 0 and 1 while held)
        state.power = 0;
        state.powerDir = 1;      // +1 rising, -1 falling
        state.powerCharging = false;
        // Throw
        state.throwAnim = 0;
        // Flight
        state.flightTime = 0;
        state.flightTotal = ROCK_SKIP.firstFlightDuration;
        // Stone
        state.stoneX = 0;          // meters from shore
        state.stoneY = 0;          // pixels above water (negative = above)
        state.energy = 0;
        state.angleEfficiency = 1.0;
        state.stoneVisible = true;
        state.stoneAngle = 0;
        // Skipping
        state.skipCount = 0;
        state.totalDistance = 0;
        state.currentSkipDist = 0;
        state.skipContactX = 0;
        state.nextContactX = 0;
        // Timing ring
        state.ringTimer = 0;
        state.ringDuration = ROCK_SKIP.ringAnimDuration;
        state.ringActive = false;
        state.skipAttempted = false; // ensures one tap per ring (works whether held or tapped)
        state.timingWindow = ROCK_SKIP.baseTimingWindow;
        state.timingResult = null;
        state.timingResultTimer = 0;
        state.waveOffset = 0;
        // Waves
        state.attemptNum = Game.currentAttempt || 0;
        state.wavePhase = 0;
        // Camera
        state.cameraX = 0;
        state.targetCameraX = 0;
        // Arc animation between skips
        state.arcTime = 0;
        state.arcDuration = 0;
        state.arcStartX = 0;
        state.arcEndX = 0;
        state.arcing = false;
        // Effects
        state.splashes = [];
        state.ripples = [];
        state.particles = [];
        state.floatingTexts = [];
        state.sinkTimer = 0;
    },

    handleInput(state, code, type) {
        if (code !== 'Space') return;

        if (state.phase === 'ready' && type === 'down') {
            state.phase = 'angle';
        } else if (state.phase === 'angle' && type === 'down') {
            state.angleLocked = ROCK_SKIP.angleMin + state.angleNeedle * (ROCK_SKIP.angleMax - ROCK_SKIP.angleMin);
            state.phase = 'power';
            SFX.play('tick');
        } else if (state.phase === 'power') {
            if (type === 'down') {
                state.powerCharging = true;
            } else if (type === 'up' && state.powerCharging) {
                state.powerCharging = false;
                // Compute energy
                const angleOff = Math.abs(state.angleLocked - ROCK_SKIP.optimalAngle);
                state.angleEfficiency = Math.max(0.2, 1.0 - angleOff * ROCK_SKIP.anglePenaltyRate);
                state.energy = state.power * ROCK_SKIP.maxEnergy * state.angleEfficiency;
                state.phase = 'throw';
                state.throwAnim = ROCK_SKIP.throwAnimDuration;
                SFX.play('woosh');
            }
        } else if (state.phase === 'skipping' && state.ringActive && !state.skipAttempted &&
                   (type === 'down' || type === 'up')) {
            // Accept either down or up as the skip-timing tap. This handles the case
            // where the player is still holding SPACE from anticipation when the ring
            // becomes active (no new 'down' event would fire). Gated by skipAttempted
            // so a quick tap (down + up) only counts once.
            state.skipAttempted = true;
            // Check timing - sweet spot matches visual moment when outer ring crosses sweet ring
            const progress = state.ringTimer / state.ringDuration; // 0->1 as ring shrinks
            const sweetSpotCenter = ROCK_SKIP.sweetProgress + state.waveOffset;
            const dist = Math.abs(progress - sweetSpotCenter);
            const windowHalf = state.timingWindow / state.ringDuration / 2;
            const perfectHalf = windowHalf * ROCK_SKIP.perfectZoneRatio;

            if (dist <= perfectHalf) {
                state.timingResult = 'perfect';
                state.timingResultTimer = 0.8;
                const skipDist = state.energy * ROCK_SKIP.distancePerEnergy * ROCK_SKIP.perfectDistanceMult;
                state.currentSkipDist = skipDist;
                state.totalDistance += skipDist;
                state.energy *= ROCK_SKIP.energyRetentionPerfect;
                state.skipCount++;
                SFX.play('skipPerfect');
            } else if (dist <= windowHalf) {
                state.timingResult = 'good';
                state.timingResultTimer = 0.8;
                const skipDist = state.energy * ROCK_SKIP.distancePerEnergy * ROCK_SKIP.goodDistanceMult;
                state.currentSkipDist = skipDist;
                state.totalDistance += skipDist;
                state.energy *= ROCK_SKIP.energyRetentionGood;
                state.skipCount++;
                SFX.play('skip');
            } else {
                state.timingResult = 'miss';
                state.timingResultTimer = 0.8;
                state.ringActive = false;
                state.phase = 'sinking';
                SFX.play('plop');
                state.score = Math.round(state.totalDistance * 100) / 100;
                return;
            }

            // Add splash effects
            const contactPx = ROCK_SKIP.shoreX + state.stoneX * ROCK_SKIP.metersToPixels;
            state.splashes.push({ x: contactPx, age: 0 });
            state.ripples.push({ x: contactPx, age: 0, maxAge: 2.0 });
            for (let j = 0; j < 5; j++) {
                state.particles.push({
                    x: contactPx + (Math.random() - 0.5) * 10,
                    y: ROCK_SKIP.waterY,
                    vx: (Math.random() - 0.5) * 60,
                    vy: -Math.random() * 120 - 40,
                    life: 0.5 + Math.random() * 0.3,
                    age: 0,
                });
            }
            state.floatingTexts.push({
                text: state.timingResult === 'perfect' ? 'PERFECT!' : 'GOOD',
                x: contactPx,
                y: ROCK_SKIP.waterY - 30,
                age: 0,
                color: state.timingResult === 'perfect' ? '#FFD700' : '#FFFFFF',
            });

            state.ringActive = false;
            // Check if enough energy for next skip
            if (state.energy < ROCK_SKIP.minSkipEnergy) {
                state.phase = 'sinking';
                SFX.play('plop');
                state.score = Math.round(state.totalDistance * 100) / 100;
            } else {
                // Start arc to next contact
                state.arcStartX = state.stoneX;
                state.arcEndX = state.stoneX + state.energy * ROCK_SKIP.distancePerEnergy;
                state.arcTime = 0;
                state.arcDuration = 0.35 + 0.1 * Math.max(0, 5 - state.skipCount);
                state.arcing = true;
            }
        }
    },

    update(state, dt) {
        state.timer += dt;
        state.frame++;
        state.wavePhase += dt * ROCK_SKIP.waveFrequency;

        // Update effects
        state.splashes = state.splashes.filter(s => { s.age += dt; return s.age < 0.4; });
        state.ripples = state.ripples.filter(r => { r.age += dt; return r.age < r.maxAge; });
        state.particles = state.particles.filter(p => {
            p.age += dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 300 * dt; // gravity
            return p.age < p.life;
        });
        state.floatingTexts = state.floatingTexts.filter(t => {
            t.age += dt;
            t.y -= 30 * dt;
            return t.age < 1.0;
        });
        if (state.timingResultTimer > 0) state.timingResultTimer -= dt;

        if (state.phase === 'angle') {
            state.angleSpeed += ROCK_SKIP.angleNeedleAccel * dt;
            state.angleNeedle += state.angleNeedleDir * state.angleSpeed * dt;
            if (state.angleNeedle >= 1) { state.angleNeedle = 1; state.angleNeedleDir = -1; }
            if (state.angleNeedle <= 0) { state.angleNeedle = 0; state.angleNeedleDir = 1; }
        }

        if (state.phase === 'power') {
            if (state.powerCharging) {
                state.power += state.powerDir * ROCK_SKIP.powerChargeRate * dt;
                if (state.power >= 1) { state.power = 1; state.powerDir = -1; }
                if (state.power <= 0) { state.power = 0; state.powerDir = 1; }
                if (state.frame % 8 === 0) SFX.play('charge');
            }
        }

        if (state.phase === 'throw') {
            state.throwAnim -= dt;
            if (state.throwAnim <= 0) {
                state.phase = 'flight';
                state.flightTime = 0;
            }
        }

        if (state.phase === 'flight') {
            state.flightTime += dt;
            const t = Math.min(1, state.flightTime / state.flightTotal);
            // Stone moves to first contact
            const firstDist = state.energy * ROCK_SKIP.distancePerEnergy * 0.5;
            state.stoneX = firstDist * t;
            state.stoneY = -80 * 4 * t * (1 - t); // arc above water
            state.stoneAngle += dt * 8;
            // Camera follows
            state.targetCameraX = Math.max(0, state.stoneX * ROCK_SKIP.metersToPixels - 300);
            state.cameraX += (state.targetCameraX - state.cameraX) * 3 * dt;

            if (t >= 1) {
                // First contact with water
                state.stoneY = 0;
                state.skipContactX = state.stoneX;
                // Add first splash
                const contactPx = ROCK_SKIP.shoreX + state.stoneX * ROCK_SKIP.metersToPixels;
                state.splashes.push({ x: contactPx, age: 0 });
                state.ripples.push({ x: contactPx, age: 0, maxAge: 2.0 });
                SFX.play('splash');
                // Start skipping timing
                state.phase = 'skipping';
                state.ringActive = true;
                state.skipAttempted = false;
                state.ringTimer = 0;
                state.ringDuration = ROCK_SKIP.ringAnimDuration;
                state.timingWindow = ROCK_SKIP.baseTimingWindow;
                state.waveOffset = state.attemptNum * ROCK_SKIP.waveAmplitude * Math.sin(state.wavePhase);
            }
        }

        if (state.phase === 'skipping') {
            // Wave offset
            state.waveOffset = state.attemptNum * ROCK_SKIP.waveAmplitude *
                Math.sin(state.wavePhase + state.skipCount * 1.7);

            if (state.arcing) {
                state.arcTime += dt;
                const t = Math.min(1, state.arcTime / state.arcDuration);
                state.stoneX = state.arcStartX + (state.arcEndX - state.arcStartX) * t;
                state.stoneY = -50 * 4 * t * (1 - t); // bounce arc
                state.stoneAngle += dt * 10;
                // Camera follows
                state.targetCameraX = Math.max(0, state.stoneX * ROCK_SKIP.metersToPixels - 300);
                state.cameraX += (state.targetCameraX - state.cameraX) * 3 * dt;

                if (t >= 1) {
                    state.arcing = false;
                    state.stoneY = 0;
                    // New contact - start ring
                    state.ringActive = true;
                    state.skipAttempted = false;
                    state.ringTimer = 0;
                    state.ringDuration = ROCK_SKIP.ringAnimDuration *
                        Math.pow(ROCK_SKIP.ringAnimShrinkRate, state.skipCount);
                    state.timingWindow = ROCK_SKIP.baseTimingWindow *
                        Math.pow(ROCK_SKIP.windowShrinkRate, state.skipCount);
                    const contactPx = ROCK_SKIP.shoreX + state.stoneX * ROCK_SKIP.metersToPixels;
                    state.splashes.push({ x: contactPx, age: 0 });
                    SFX.play('splash');
                }
            }

            if (state.ringActive) {
                state.ringTimer += dt;
                // Auto-miss if ring fully shrinks without a press
                if (state.ringTimer >= state.ringDuration) {
                    state.ringActive = false;
                    state.timingResult = 'miss';
                    state.timingResultTimer = 0.8;
                    state.phase = 'sinking';
                    SFX.play('plop');
                    state.score = Math.round(state.totalDistance * 100) / 100;
                }
            }
        }

        if (state.phase === 'sinking') {
            state.sinkTimer += dt;
            state.stoneY += 30 * dt; // sink below water
            if (state.sinkTimer >= 2.5) {
                state.phase = 'done';
            }
        }
    },
};

EventRenderers.rockSkip = function(ctx, state) {
    const W = 900, H = 500;
    const camX = state.cameraX;

    // Sky gradient (late afternoon)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 220);
    skyGrad.addColorStop(0, '#2C3E7B');
    skyGrad.addColorStop(0.6, '#6A5ACD');
    skyGrad.addColorStop(1, '#E8A87C');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, 220);

    // Mountains (parallax: slow scroll)
    const mtX = -camX * 0.15;
    ctx.fillStyle = '#3D4F6F';
    const peaks = [
        [100, 130], [200, 100], [350, 120], [500, 90], [650, 110], [800, 130],
        [950, 95], [1100, 115], [1250, 105],
    ];
    peaks.forEach(([px, py]) => {
        const x = mtX + px;
        ctx.beginPath();
        ctx.moveTo(x - 70, 220);
        ctx.lineTo(x, py);
        ctx.lineTo(x + 70, 220);
        ctx.fill();
        // Snow cap
        ctx.fillStyle = '#DCDCDC';
        ctx.beginPath();
        ctx.moveTo(x - 15, py + 20);
        ctx.lineTo(x, py);
        ctx.lineTo(x + 15, py + 20);
        ctx.fill();
        ctx.fillStyle = '#3D4F6F';
    });

    // Treeline (medium parallax)
    const treeX = -camX * 0.3;
    ctx.fillStyle = '#2E5E3E';
    for (let i = 0; i < 30; i++) {
        const tx = treeX + i * 50 + 10;
        const th = 20 + (i * 7) % 15;
        ctx.beginPath();
        ctx.moveTo(tx - 12, 225);
        ctx.lineTo(tx, 225 - th);
        ctx.lineTo(tx + 12, 225);
        ctx.fill();
    }

    // Lake
    const lakeGrad = ctx.createLinearGradient(0, 220, 0, ROCK_SKIP.waterY + 50);
    lakeGrad.addColorStop(0, '#1565C0');
    lakeGrad.addColorStop(1, '#4FC3F7');
    ctx.fillStyle = lakeGrad;
    ctx.fillRect(0, 220, W, ROCK_SKIP.waterY + 50 - 220);

    // Wave lines on water
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    const waveAmp = 2 + state.attemptNum * ROCK_SKIP.waveVisualHeight;
    for (let wy = 240; wy < ROCK_SKIP.waterY + 40; wy += 20) {
        ctx.beginPath();
        for (let wx = 0; wx <= W; wx += 5) {
            const worldWx = wx + camX;
            const y = wy + Math.sin(worldWx * 0.02 + state.timer * 2 + wy * 0.1) * waveAmp;
            if (wx === 0) ctx.moveTo(wx, y); else ctx.lineTo(wx, y);
        }
        ctx.stroke();
    }

    // Shore (scrolls with camera)
    const shoreScreenX = ROCK_SKIP.shoreX - camX;
    if (shoreScreenX > -200) {
        const shoreGrad = ctx.createLinearGradient(0, ROCK_SKIP.waterY - 5, 0, H);
        shoreGrad.addColorStop(0, '#8D6E63');
        shoreGrad.addColorStop(1, '#5D4037');
        ctx.fillStyle = shoreGrad;
        ctx.beginPath();
        ctx.moveTo(shoreScreenX - 80, ROCK_SKIP.waterY - 5);
        ctx.lineTo(shoreScreenX + 40, ROCK_SKIP.waterY + 10);
        ctx.lineTo(shoreScreenX + 40, H);
        ctx.lineTo(shoreScreenX - 80, H);
        ctx.fill();
        // Pebbles
        ctx.fillStyle = '#9E9E9E';
        for (let i = 0; i < 12; i++) {
            const px = shoreScreenX - 60 + (i * 37) % 90;
            const py = ROCK_SKIP.waterY + 5 + (i * 13) % 40;
            ctx.beginPath();
            ctx.arc(px, py, 2 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Athlete on shore
    if (shoreScreenX > -100 && (state.phase === 'ready' || state.phase === 'angle' ||
        state.phase === 'power' || state.phase === 'throw')) {
        const athX = shoreScreenX - 20;
        const athY = ROCK_SKIP.waterY - 5;
        // Simple athlete figure
        const lean = state.phase === 'throw' ? -0.3 : 0;
        ctx.save();
        ctx.translate(athX, athY);
        ctx.rotate(lean);
        // Body
        ctx.fillStyle = '#E8B89D';
        ctx.beginPath();
        ctx.arc(0, -45, 10, 0, Math.PI * 2); // head
        ctx.fill();
        ctx.fillStyle = '#2196F3';
        ctx.fillRect(-6, -35, 12, 20); // torso
        ctx.fillStyle = '#1565C0';
        ctx.fillRect(-6, -15, 5, 18); // left leg
        ctx.fillRect(1, -15, 5, 18); // right leg
        // Throwing arm
        if (state.phase !== 'throw') {
            ctx.fillStyle = '#E8B89D';
            ctx.fillRect(6, -33, 14, 4); // extended arm with stone
            // Stone in hand
            ctx.fillStyle = '#616161';
            ctx.beginPath();
            ctx.ellipse(22, -31, 5, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // Stone in flight/skipping
    if (state.stoneVisible && (state.phase === 'flight' || state.phase === 'skipping' || state.phase === 'sinking')) {
        const sx = ROCK_SKIP.shoreX + state.stoneX * ROCK_SKIP.metersToPixels - camX;
        const sy = ROCK_SKIP.waterY + state.stoneY;
        if (state.phase !== 'sinking' || state.sinkTimer < 1.5) {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(state.stoneAngle);
            ctx.fillStyle = '#616161';
            ctx.beginPath();
            ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#9E9E9E';
            ctx.beginPath();
            ctx.ellipse(-1, -1, 3, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // Timing ring
    if (state.ringActive && state.phase === 'skipping') {
        const rx = ROCK_SKIP.shoreX + state.stoneX * ROCK_SKIP.metersToPixels - camX;
        const ry = ROCK_SKIP.waterY;
        const progress = state.ringTimer / state.ringDuration;
        const outerR = Math.max(2, ROCK_SKIP.outerRingMax * (1 - progress));
        const sweetR = ROCK_SKIP.sweetRingR;
        const sweetCenterOffset = state.waveOffset * 40;

        // Window math (matches handleInput logic)
        const sweetCenter = ROCK_SKIP.sweetProgress + state.waveOffset;
        const windowHalf = state.timingWindow / state.ringDuration / 2;
        const distToSweet = Math.abs(progress - sweetCenter);
        const inGood = distToSweet <= windowHalf;
        const inPerfect = distToSweet <= windowHalf * ROCK_SKIP.perfectZoneRatio;

        // Sweet spot ring (target - drawn first, behind outer ring)
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rx + sweetCenterOffset, ry, sweetR, 0, Math.PI * 2);
        ctx.stroke();

        // Perfect zone (inner glow)
        ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
        ctx.beginPath();
        ctx.arc(rx + sweetCenterOffset, ry, sweetR * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Outer shrinking ring (color changes when in window)
        const ringColor = inPerfect ? '#4CAF50' : inGood ? '#FFEB3B' : '#FFFFFF';
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = inGood ? 4 : 3;
        ctx.beginPath();
        ctx.arc(rx, ry, outerR, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Splash effects
    state.splashes.forEach(s => {
        const sx = s.x - camX;
        const alpha = 1 - s.age / 0.4;
        const r = 10 + s.age * 60;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, ROCK_SKIP.waterY, r, -Math.PI, 0);
        ctx.stroke();
    });

    // Ripples
    state.ripples.forEach(r => {
        const rx = r.x - camX;
        const alpha = 0.4 * (1 - r.age / r.maxAge);
        const rr = 8 + r.age * 25;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(rx, ROCK_SKIP.waterY + 2, rr, rr * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
    });

    // Water droplet particles
    state.particles.forEach(p => {
        const px = p.x - camX;
        const alpha = 1 - p.age / p.life;
        ctx.fillStyle = `rgba(200,230,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
    });

    // Floating texts
    state.floatingTexts.forEach(t => {
        const tx = t.x - camX;
        const alpha = 1 - t.age;
        ctx.fillStyle = t.color.replace(')', `,${alpha})`).replace('rgb', 'rgba');
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        // Use simple alpha approach
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, tx, t.y);
        ctx.globalAlpha = 1;
    });

    // Sinking animation
    if (state.phase === 'sinking') {
        const sx = ROCK_SKIP.shoreX + state.stoneX * ROCK_SKIP.metersToPixels - camX;
        // Bubbles
        if (state.sinkTimer < 1.5) {
            for (let i = 0; i < 3; i++) {
                const bubY = ROCK_SKIP.waterY - state.sinkTimer * 20 - i * 8;
                const bubX = sx + Math.sin(state.timer * 5 + i * 2) * 5;
                const alpha = Math.max(0, 1 - state.sinkTimer);
                ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(bubX, bubY, 2 + i, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    // Below water fill (covers anything drawn below waterline)
    ctx.fillStyle = 'rgba(21, 101, 192, 0.5)';
    ctx.fillRect(0, ROCK_SKIP.waterY + 5, W, H - ROCK_SKIP.waterY);

    // HUD - Skip counter
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SKIPS: ${state.skipCount}`, 20, 30);

    // HUD - Distance
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${state.totalDistance.toFixed(1)} m`, W - 20, 30);

    // Angle gauge
    if (state.phase === 'angle') {
        const gx = shoreScreenX + 30, gy = ROCK_SKIP.waterY - 60;
        const arcR = 45;
        // Arc from 3 o'clock (right=flat) to 12 o'clock (up=steep)
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gx, gy, arcR, -Math.PI / 2, 0);
        ctx.stroke();
        // Highlight optimal-angle zone (green arc) - narrow sweet spot
        const optPos = (ROCK_SKIP.optimalAngle - ROCK_SKIP.angleMin) /
                       (ROCK_SKIP.angleMax - ROCK_SKIP.angleMin);
        const optMin = Math.max(0, optPos - ROCK_SKIP.optimalZoneHalfWidth);
        const optMax = Math.min(1, optPos + ROCK_SKIP.optimalZoneHalfWidth);
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(gx, gy, arcR, -optMax * (Math.PI / 2), -optMin * (Math.PI / 2));
        ctx.stroke();
        // Needle: angleNeedle=0 -> 0 rad (right, flat throw); angleNeedle=1 -> -PI/2 (up, steep)
        const needleAngle = -state.angleNeedle * (Math.PI / 2);
        ctx.strokeStyle = '#FF5722';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + Math.cos(needleAngle) * arcR, gy + Math.sin(needleAngle) * arcR);
        ctx.stroke();
        // Labels
        ctx.fillStyle = '#AAA';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('FLAT', gx + arcR + 6, gy + 4);
        ctx.textAlign = 'center';
        ctx.fillText('STEEP', gx, gy - arcR - 6);
        // Angle text
        const displayAngle = Math.round(ROCK_SKIP.angleMin + state.angleNeedle * (ROCK_SKIP.angleMax - ROCK_SKIP.angleMin));
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(displayAngle + '°', gx, gy + 25);
        ctx.fillText('TAP SPACE', gx, gy + 42);
    }

    // Power meter (oscillates — release at peak for max power)
    if (state.phase === 'power') {
        const px = 100, py = H - 50, pw = 200, ph = 20;
        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(px, py, pw, ph);
        // Target zone near max (top 10%)
        ctx.fillStyle = 'rgba(76, 175, 80, 0.35)';
        ctx.fillRect(px + pw * 0.9, py, pw * 0.1, ph);
        // Current power fill
        ctx.fillStyle = state.power > 0.9 ? '#4CAF50' : state.power > 0.6 ? '#FFEB3B' : '#FF9800';
        ctx.fillRect(px, py, pw * state.power, ph);
        // Direction indicator arrow at the tip of fill
        const tipX = px + pw * state.power;
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        if (state.powerDir > 0) {
            ctx.moveTo(tipX, py);
            ctx.lineTo(tipX + 8, py + ph / 2);
            ctx.lineTo(tipX, py + ph);
        } else {
            ctx.moveTo(tipX, py);
            ctx.lineTo(tipX - 8, py + ph / 2);
            ctx.lineTo(tipX, py + ph);
        }
        ctx.fill();
        // Border
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, pw, ph);
        // Labels
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('RELEASE AT PEAK!', px + pw / 2, py - 8);
        ctx.fillText(Math.round(state.power * 100) + '%', px + pw / 2, py + 15);
    }

    // Ready prompt
    if (state.phase === 'ready') {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PRESS SPACE TO START', W / 2, H / 2 - 20);
        ctx.font = '14px monospace';
        ctx.fillText('Skip stones across the lake!', W / 2, H / 2 + 10);
    }

    // Result display during sinking
    if (state.phase === 'sinking' && state.sinkTimer > 0.5) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(W / 2 - 130, H / 2 - 45, 260, 90);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${state.totalDistance.toFixed(2)} m`, W / 2, H / 2 - 10);
        ctx.font = '16px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`${state.skipCount} skip${state.skipCount !== 1 ? 's' : ''}`, W / 2, H / 2 + 20);
    }
};

// ============================================================
//  SOCCER OVER HOUSE - Event Implementation
// ============================================================

const SOCCER = {
    // House geometry (world pixels)
    houseX: 700,
    houseWidth: 280,
    houseWallHeight: 160,
    houseRoofHeight: 80,
    groundY: 420,
    worldWidth: 1800,
    // Ball physics
    maxLaunchSpeed: 900,      // pixels/sec - need enough power to clear taller houses
    gravity: 500,
    windFactor: 40,
    maxWind: 3.0,
    ballRadius: 8,
    // Angle gauge - narrowed to the playable range (low angles can't clear, very high lands on house)
    angleMin: 0.70,           // ~40 degrees (flat)
    angleMax: 1.31,           // ~75 degrees (steep)
    optimalAngle: 1.13,       // ~65 degrees (best clearance + catch-zone landing at full power)
    angleNeedleSpeed: 1.0,
    angleNeedleAccel: 0.15,
    optimalZoneHalfWidth: 0.10, // normalized half-width of green zone
    // Power
    powerChargeRate: 0.55,
    // Sprint - gentle damping so you keep momentum if you pause to judge the ball
    sprintAccel: 0.35,
    sprintDamping: 0.990,     // ~55% retained per second (was 0.94 = brutal halt)
    sprintMaxSpeed: 1.0,      // cap so furious mashing can't finish sprint in a flash
    stumblePenalty: 0.3,
    // Catching - slightly more forgiving radii so it matches visual proximity
    catchMoveSpeed: 220,
    catchFriction: 0.85,
    catchRadiusPerfect: 22,
    catchRadiusGood: 55,
    catchRadiusDive: 90,
    // Scoring
    baseClearPoints: 50,
    maxClearanceBonus: 20,
    perfectCatchPoints: 50,
    goodCatchPoints: 25,
    diveCatchPoints: 10,
    maxEarlyBonus: 30,
    earlyBonusRate: 15,
    windBonusRate: 3,
    // Difficulty per attempt
    houseHeightScale: [1.0, 1.2, 1.5],
    windScale: [0.4, 0.7, 1.0],
    angleSpeedScale: [1.0, 1.2, 1.5],
    // Timing
    kickAnimDuration: 0.3,
    resultDisplayTime: 2.5,
    // Athlete start position
    athleteStartX: 250,
    // Catch zone
    catchZoneLeft: 1050,
    catchZoneRight: 1650,
};

EventLogic.soccer = {
    init(state) {
        state.phase = 'ready';
        state.timer = 0;
        state.frame = 0;
        state.score = 0;

        const attempt = Game.currentAttempt || 0;
        state.attemptIndex = attempt;
        state.houseScale = SOCCER.houseHeightScale[attempt] || 1.0;

        // Wind
        state.wind = (Math.random() - 0.5) * 2 * SOCCER.maxWind * (SOCCER.windScale[attempt] || 1.0);
        state.wind = Math.round(state.wind * 10) / 10;

        // House geometry
        state.houseWallH = SOCCER.houseWallHeight * state.houseScale;
        state.houseRoofH = SOCCER.houseRoofHeight * state.houseScale;
        state.houseTotalH = state.houseWallH + state.houseRoofH;
        state.houseLeft = SOCCER.houseX - SOCCER.houseWidth / 2;
        state.houseRight = SOCCER.houseX + SOCCER.houseWidth / 2;
        state.roofPeakY = SOCCER.groundY - state.houseTotalH;

        // Angle gauge
        state.angleNeedle = SOCCER.angleMin;
        state.angleNeedleDir = 1;
        state.angleNeedleSpeed = SOCCER.angleNeedleSpeed * (SOCCER.angleSpeedScale[attempt] || 1.0);
        state.angleLocked = false;
        state.kickAngle = 0;

        // Power
        state.power = 0;
        state.powerCharging = false;
        state.kickPower = 0;

        // Ball
        state.ballX = SOCCER.athleteStartX;
        state.ballY = SOCCER.groundY - 15;
        state.ballVx = 0;
        state.ballVy = 0;
        state.ballTrail = [];
        state.ballLanded = false;
        state.ballHitHouse = false;
        state.ballLandingX = 0;
        state.ballAngle = 0;

        // Kick anim
        state.kickAnimTimer = 0;

        // Sprint
        state.runnerProgress = 0;
        state.sprintSpeed = 0;
        state.lastSprintKey = null;
        state.lastSprintTime = 0;
        state.stumbleTimer = 0;
        state.runnerWorldX = SOCCER.athleteStartX;
        state.arrivedEarly = false;
        state.arrivalTime = 0;

        // Catch
        state.catchAthleteX = SOCCER.catchZoneLeft + 150;
        state.catchVelocity = 0;
        state.catchResult = null;

        // Camera
        state.cameraX = 0;
        state.cameraTargetX = 0;

        // Scoring
        state.clearanceBonus = 0;
        state.catchPoints = 0;
        state.earlyBonus = 0;
        state.windBonus = 0;

        // Visual
        state.particles = [];
        state.shakeTimer = 0;
        state.resultTimer = 0;
        state.resultText = '';
    },

    handleInput(state, code, type) {
        if (state.phase === 'ready' && code === 'Space' && type === 'down') {
            state.phase = 'angleSet';
            return;
        }

        if (state.phase === 'angleSet' && code === 'Space' && type === 'down') {
            state.angleLocked = true;
            state.kickAngle = state.angleNeedle;
            state.phase = 'powerCharge';
            SFX.play('tick');
            return;
        }

        if (state.phase === 'powerCharge' && code === 'Space') {
            if (type === 'down') {
                state.powerCharging = true;
            } else if (type === 'up' && state.powerCharging) {
                state.powerCharging = false;
                state.kickPower = state.power;
                state.phase = 'kick';
                state.kickAnimTimer = SOCCER.kickAnimDuration;
                // Launch ball
                state.ballVx = state.kickPower * SOCCER.maxLaunchSpeed * Math.cos(state.kickAngle);
                state.ballVy = -state.kickPower * SOCCER.maxLaunchSpeed * Math.sin(state.kickAngle);
                SFX.play('kick');
            }
            return;
        }

        if (state.phase === 'flight') {
            // Sprint: alternate L/R
            if ((code === 'ArrowLeft' || code === 'ArrowRight') && type === 'down') {
                const key = code === 'ArrowLeft' ? 'left' : 'right';
                const now = state.timer;
                if (key === state.lastSprintKey) {
                    // Same key = stumble
                    state.sprintSpeed *= SOCCER.stumblePenalty;
                    state.stumbleTimer = 0.2;
                } else {
                    const elapsed = now - state.lastSprintTime;
                    const speedBoost = Math.max(0, 1 - elapsed / 0.3);
                    state.sprintSpeed += SOCCER.sprintAccel * (0.3 + speedBoost * 0.7);
                    if (state.frame % 3 === 0) SFX.play('sprint');
                }
                state.lastSprintKey = key;
                state.lastSprintTime = now;
            }
            return;
        }

        // Catch phase movement is handled in update() via Input.keys so that
        // holding a key moves continuously (keydown fires only once).
    },

    update(state, dt) {
        state.timer += dt;
        state.frame++;

        // Update particles
        state.particles = state.particles.filter(p => {
            p.age += dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 300 * dt;
            return p.age < p.life;
        });
        if (state.shakeTimer > 0) state.shakeTimer -= dt;
        if (state.stumbleTimer > 0) state.stumbleTimer -= dt;

        // Angle gauge oscillation
        if (state.phase === 'angleSet') {
            state.angleNeedle += state.angleNeedleDir * state.angleNeedleSpeed * dt;
            state.angleNeedleSpeed += SOCCER.angleNeedleAccel * dt;
            if (state.angleNeedle >= SOCCER.angleMax) {
                state.angleNeedle = SOCCER.angleMax;
                state.angleNeedleDir = -1;
            }
            if (state.angleNeedle <= SOCCER.angleMin) {
                state.angleNeedle = SOCCER.angleMin;
                state.angleNeedleDir = 1;
            }
        }

        // Power charge
        if (state.phase === 'powerCharge' && state.powerCharging) {
            state.power = Math.min(1, state.power + SOCCER.powerChargeRate * dt);
            if (state.frame % 8 === 0) SFX.play('charge');
        }

        // Kick animation
        if (state.phase === 'kick') {
            state.kickAnimTimer -= dt;
            if (state.kickAnimTimer <= 0) {
                state.phase = 'flight';
            }
        }

        // Ball flight + sprint
        if (state.phase === 'flight') {
            // Ball physics
            state.ballVy += SOCCER.gravity * dt;
            state.ballX += state.ballVx * dt;
            state.ballY += state.ballVy * dt;
            state.ballVx += state.wind * SOCCER.windFactor * dt;
            state.ballAngle += dt * 5;

            // Ball trail
            if (state.frame % 3 === 0) {
                state.ballTrail.push({ x: state.ballX, y: state.ballY });
                if (state.ballTrail.length > 15) state.ballTrail.shift();
            }

            // Check roof collision
            if (state.ballX >= state.houseLeft && state.ballX <= state.houseRight) {
                // Roof is a triangle: peak at center, slopes to edges
                const houseCenter = SOCCER.houseX;
                const halfW = SOCCER.houseWidth / 2;
                const distFromCenter = Math.abs(state.ballX - houseCenter);
                const roofYAtBall = SOCCER.groundY - state.houseWallH -
                    state.houseRoofH * (1 - distFromCenter / halfW);
                // Also check walls
                const wallTop = SOCCER.groundY - state.houseWallH;

                if (state.ballY >= roofYAtBall) {
                    // Hit the roof or wall (any direction — ball can't pass through)
                    state.ballHitHouse = true;
                    state.phase = 'result';
                    state.resultTimer = SOCCER.resultDisplayTime;
                    state.resultText = 'BONK!';
                    state.score = 0;
                    state.shakeTimer = 0.4;
                    SFX.play('roofBonk');
                    // Bounce particles
                    for (let i = 0; i < 8; i++) {
                        state.particles.push({
                            x: state.ballX, y: state.ballY,
                            vx: (Math.random() - 0.5) * 150,
                            vy: -Math.random() * 100 - 50,
                            life: 0.6, age: 0,
                            color: '#8B4513',
                        });
                    }
                    return;
                }
            }

            // Check ball landed on ground (past house)
            if (state.ballY >= SOCCER.groundY && state.ballX > state.houseRight) {
                state.ballLanded = true;
                state.ballLandingX = state.ballX;
                state.ballY = SOCCER.groundY;

                // Calculate clearance bonus
                const houseCenter = SOCCER.houseX;
                const halfW = SOCCER.houseWidth / 2;
                // Find min clearance over the roof
                let minClearance = Infinity;
                for (let cx = state.houseLeft; cx <= state.houseRight; cx += 10) {
                    const distC = Math.abs(cx - houseCenter);
                    const roofY = SOCCER.groundY - state.houseWallH -
                        state.houseRoofH * (1 - distC / halfW);
                    // Find ball Y at this X using parametric reconstruction
                    // Approximate: use the peak height vs roof peak
                    const t = (cx - SOCCER.athleteStartX) / (state.ballLandingX - SOCCER.athleteStartX);
                    const ballYAtX = SOCCER.groundY - 15 +
                        (state.ballVy / state.ballVx * (cx - SOCCER.athleteStartX)) +
                        0.5 * SOCCER.gravity * Math.pow((cx - SOCCER.athleteStartX) / state.ballVx, 2);
                    // Actually simpler: just store min clearance we computed during flight
                }
                // Simpler approach: compute clearance at roof peak
                const peakX = houseCenter;
                const tPeak = (peakX - SOCCER.athleteStartX) / (state.kickPower * SOCCER.maxLaunchSpeed * Math.cos(state.kickAngle));
                const ballYAtPeak = (SOCCER.groundY - 15) +
                    (-state.kickPower * SOCCER.maxLaunchSpeed * Math.sin(state.kickAngle)) * tPeak +
                    0.5 * SOCCER.gravity * tPeak * tPeak;
                const clearance = state.roofPeakY - ballYAtPeak; // positive = cleared above
                state.clearanceBonus = Math.max(0, Math.round(SOCCER.maxClearanceBonus - Math.max(0, clearance - 5) * 2));

                if (state.runnerProgress >= 1.0) {
                    // Runner already there — evaluate catch immediately
                    state.catchAthleteX = state.runnerWorldX;
                    const dist = Math.abs(state.ballLandingX - state.catchAthleteX);
                    if (dist <= SOCCER.catchRadiusPerfect) {
                        state.catchResult = 'perfect';
                        state.catchPoints = SOCCER.perfectCatchPoints;
                        SFX.play('catch');
                    } else if (dist <= SOCCER.catchRadiusGood) {
                        state.catchResult = 'good';
                        state.catchPoints = SOCCER.goodCatchPoints;
                        SFX.play('catch');
                    } else if (dist <= SOCCER.catchRadiusDive) {
                        state.catchResult = 'dive';
                        state.catchPoints = SOCCER.diveCatchPoints;
                        SFX.play('thunk');
                    } else {
                        state.catchResult = 'miss';
                        state.catchPoints = 0;
                        SFX.play('ballBounce');
                    }
                    state.windBonus = Math.round(Math.abs(state.wind) * SOCCER.windBonusRate);
                    state.score = SOCCER.baseClearPoints + state.clearanceBonus +
                        state.catchPoints + state.windBonus;
                    state.resultText = state.catchResult === 'perfect' ? 'PERFECT CATCH!' :
                        state.catchResult === 'good' ? 'NICE CATCH!' :
                        state.catchResult === 'dive' ? 'DIVING CATCH!' : 'DROPPED!';
                    state.phase = 'result';
                    state.resultTimer = SOCCER.resultDisplayTime;
                } else {
                    // Ball landed before runner arrived - miss
                    state.phase = 'result';
                    state.resultTimer = SOCCER.resultDisplayTime;
                    state.catchResult = 'miss';
                    state.catchPoints = 0;
                    state.windBonus = Math.round(Math.abs(state.wind) * SOCCER.windBonusRate);
                    state.score = SOCCER.baseClearPoints + state.clearanceBonus + state.windBonus;
                    state.resultText = 'TOO SLOW!';
                    SFX.play('ballBounce');
                }
                return;
            }

            // Ball went off screen left or landed before house
            if (state.ballY >= SOCCER.groundY && state.ballX <= state.houseRight) {
                state.phase = 'result';
                state.resultTimer = SOCCER.resultDisplayTime;
                state.score = 0;
                state.resultText = 'SHORT!';
                SFX.play('miss');
                return;
            }

            // Sprint physics
            state.sprintSpeed *= Math.pow(SOCCER.sprintDamping, dt * 60);
            state.sprintSpeed = Math.min(SOCCER.sprintMaxSpeed, state.sprintSpeed);
            state.runnerProgress = Math.min(1.0, state.runnerProgress + state.sprintSpeed * dt);

            // Derive runner world position from progress
            // Path: start at athleteStartX, end at catchZoneLeft + 150
            if (state.runnerProgress < 0.4) {
                // Running toward house
                const t = state.runnerProgress / 0.4;
                state.runnerWorldX = SOCCER.athleteStartX + t * (state.houseLeft - 30 - SOCCER.athleteStartX);
            } else if (state.runnerProgress < 0.6) {
                // Behind house (not visible)
                const t = (state.runnerProgress - 0.4) / 0.2;
                state.runnerWorldX = (state.houseLeft - 30) + t * (state.houseRight + 30 - (state.houseLeft - 30));
            } else {
                // Past house, heading to catch zone
                const t = (state.runnerProgress - 0.6) / 0.4;
                state.runnerWorldX = (state.houseRight + 30) + t * (SOCCER.catchZoneLeft + 150 - (state.houseRight + 30));
            }

            // If runner arrives at catch zone and ball hasn't landed
            if (state.runnerProgress >= 1.0 && !state.ballLanded) {
                state.phase = 'catch';
                state.catchAthleteX = state.runnerWorldX;
                state.arrivalTime = state.timer;
            }

            // Camera follows action
            const focusX = Math.max(state.ballX, state.runnerWorldX);
            state.cameraTargetX = Math.max(0, Math.min(focusX - 350, SOCCER.worldWidth - 900));
            state.cameraX += (state.cameraTargetX - state.cameraX) * 3 * dt;
        }

        // Catch phase
        if (state.phase === 'catch') {
            // Drive velocity from currently-held keys (holding moves continuously)
            if (Input.keys['ArrowLeft']) {
                state.catchVelocity = -SOCCER.catchMoveSpeed;
            } else if (Input.keys['ArrowRight']) {
                state.catchVelocity = SOCCER.catchMoveSpeed;
            } else {
                state.catchVelocity *= SOCCER.catchFriction; // quick stop when released
            }
            // Move athlete
            state.catchAthleteX += state.catchVelocity * dt;
            state.catchAthleteX = Math.max(SOCCER.catchZoneLeft, Math.min(SOCCER.catchZoneRight, state.catchAthleteX));

            // Ball still in air
            if (!state.ballLanded) {
                state.ballVy += SOCCER.gravity * dt;
                state.ballX += state.ballVx * dt;
                state.ballY += state.ballVy * dt;
                state.ballVx += state.wind * SOCCER.windFactor * dt;
                state.ballAngle += dt * 5;

                if (state.frame % 3 === 0) {
                    state.ballTrail.push({ x: state.ballX, y: state.ballY });
                    if (state.ballTrail.length > 15) state.ballTrail.shift();
                }

                // Roof collision - also check during catch phase (runner may have arrived
                // at catch zone before the ball reached the house)
                if (state.ballX >= state.houseLeft && state.ballX <= state.houseRight) {
                    const houseCenter = SOCCER.houseX;
                    const halfW = SOCCER.houseWidth / 2;
                    const distFromCenter = Math.abs(state.ballX - houseCenter);
                    const roofYAtBall = SOCCER.groundY - state.houseWallH -
                        state.houseRoofH * (1 - distFromCenter / halfW);
                    if (state.ballY >= roofYAtBall) {
                        state.ballHitHouse = true;
                        state.phase = 'result';
                        state.resultTimer = SOCCER.resultDisplayTime;
                        state.resultText = 'BONK!';
                        state.score = 0;
                        state.shakeTimer = 0.4;
                        SFX.play('roofBonk');
                        for (let i = 0; i < 8; i++) {
                            state.particles.push({
                                x: state.ballX, y: state.ballY,
                                vx: (Math.random() - 0.5) * 150,
                                vy: -Math.random() * 100 - 50,
                                life: 0.6, age: 0,
                                color: '#8B4513',
                            });
                        }
                        return;
                    }
                }

                // Ball lands
                if (state.ballY >= SOCCER.groundY) {
                    state.ballLanded = true;
                    state.ballLandingX = state.ballX;
                    state.ballY = SOCCER.groundY;

                    // Evaluate catch
                    const dist = Math.abs(state.ballLandingX - state.catchAthleteX);
                    if (dist <= SOCCER.catchRadiusPerfect) {
                        state.catchResult = 'perfect';
                        state.catchPoints = SOCCER.perfectCatchPoints;
                        SFX.play('catch');
                    } else if (dist <= SOCCER.catchRadiusGood) {
                        state.catchResult = 'good';
                        state.catchPoints = SOCCER.goodCatchPoints;
                        SFX.play('catch');
                    } else if (dist <= SOCCER.catchRadiusDive) {
                        state.catchResult = 'dive';
                        state.catchPoints = SOCCER.diveCatchPoints;
                        SFX.play('thunk');
                    } else {
                        state.catchResult = 'miss';
                        state.catchPoints = 0;
                        SFX.play('ballBounce');
                    }

                    // Compute clearance bonus (same as flight)
                    const peakX = SOCCER.houseX;
                    const tPeak = (peakX - SOCCER.athleteStartX) / (state.kickPower * SOCCER.maxLaunchSpeed * Math.cos(state.kickAngle));
                    const ballYAtPeak = (SOCCER.groundY - 15) +
                        (-state.kickPower * SOCCER.maxLaunchSpeed * Math.sin(state.kickAngle)) * tPeak +
                        0.5 * SOCCER.gravity * tPeak * tPeak;
                    const clearance = state.roofPeakY - ballYAtPeak;
                    state.clearanceBonus = Math.max(0, Math.round(SOCCER.maxClearanceBonus - Math.max(0, clearance - 5) * 2));

                    // Early arrival bonus
                    const timeBeforeLanding = state.timer - state.arrivalTime;
                    state.earlyBonus = Math.round(Math.max(0, (timeBeforeLanding > 0.5) ?
                        Math.min(SOCCER.maxEarlyBonus, timeBeforeLanding * SOCCER.earlyBonusRate) : 0));
                    state.windBonus = Math.round(Math.abs(state.wind) * SOCCER.windBonusRate);

                    state.score = SOCCER.baseClearPoints + state.clearanceBonus +
                        state.catchPoints + state.earlyBonus + state.windBonus;

                    if (state.catchResult === 'perfect') {
                        state.resultText = 'PERFECT CATCH!';
                        for (let i = 0; i < 10; i++) {
                            state.particles.push({
                                x: state.catchAthleteX, y: SOCCER.groundY - 30,
                                vx: (Math.random() - 0.5) * 100,
                                vy: -Math.random() * 120 - 20,
                                life: 0.8, age: 0,
                                color: '#FFD700',
                            });
                        }
                    } else if (state.catchResult === 'good') {
                        state.resultText = 'NICE CATCH!';
                    } else if (state.catchResult === 'dive') {
                        state.resultText = 'DIVING CATCH!';
                    } else {
                        state.resultText = 'DROPPED!';
                    }

                    state.phase = 'result';
                    state.resultTimer = SOCCER.resultDisplayTime;
                }
            }

            // Camera in catch zone
            state.cameraTargetX = Math.max(0, SOCCER.catchZoneLeft - 200);
            state.cameraX += (state.cameraTargetX - state.cameraX) * 3 * dt;
        }

        // Result display
        if (state.phase === 'result') {
            state.resultTimer -= dt;
            if (state.resultTimer <= 0) {
                state.phase = 'done';
            }
        }
    },
};

EventRenderers.soccer = function(ctx, state) {
    const W = 900, H = 500;
    const camX = state.cameraX;

    // Screen shake
    let shakeX = 0, shakeY = 0;
    if (state.shakeTimer > 0) {
        shakeX = (Math.random() - 0.5) * 8;
        shakeY = (Math.random() - 0.5) * 8;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 200);
    skyGrad.addColorStop(0, '#4A90D9');
    skyGrad.addColorStop(1, '#87CEEB');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, 200);

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const cloudScroll = -camX * 0.05 + state.timer * 10;
    [100, 350, 600, 850].forEach((cx, i) => {
        const x = ((cx + cloudScroll) % 1100) - 100;
        const y = 40 + i * 25;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.arc(x + 20, y - 8, 15, 0, Math.PI * 2);
        ctx.arc(x + 35, y, 18, 0, Math.PI * 2);
        ctx.fill();
    });

    // Grass
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, SOCCER.groundY, W, H - SOCCER.groundY);
    // Grass detail
    ctx.fillStyle = '#43A047';
    for (let gx = 0; gx < W; gx += 30) {
        const worldGx = gx + camX;
        if ((worldGx / 30 | 0) % 2 === 0) {
            ctx.fillRect(gx, SOCCER.groundY, 30, H - SOCCER.groundY);
        }
    }

    // World-space objects (house, fences, etc.)
    ctx.save();
    ctx.translate(-camX, 0);

    // Left yard fence
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    for (let fx = 50; fx < state.houseLeft - 50; fx += 30) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(fx, SOCCER.groundY - 25, 3, 25);
        if (fx + 30 < state.houseLeft - 50) {
            ctx.fillRect(fx, SOCCER.groundY - 22, 30, 2);
            ctx.fillRect(fx, SOCCER.groundY - 12, 30, 2);
        }
    }

    // Right yard fence
    for (let fx = state.houseRight + 80; fx < SOCCER.worldWidth - 50; fx += 30) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(fx, SOCCER.groundY - 25, 3, 25);
        if (fx + 30 < SOCCER.worldWidth - 50) {
            ctx.fillRect(fx, SOCCER.groundY - 22, 30, 2);
            ctx.fillRect(fx, SOCCER.groundY - 12, 30, 2);
        }
    }

    // Small trees
    const treePositions = [120, state.houseRight + 120, state.houseRight + 400];
    treePositions.forEach(tx => {
        // Trunk
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(tx - 4, SOCCER.groundY - 45, 8, 45);
        // Canopy
        ctx.fillStyle = '#2E7D32';
        ctx.beginPath();
        ctx.arc(tx, SOCCER.groundY - 55, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#388E3C';
        ctx.beginPath();
        ctx.arc(tx + 8, SOCCER.groundY - 50, 16, 0, Math.PI * 2);
        ctx.fill();
    });

    // ---- HOUSE ----
    const hx = SOCCER.houseX;
    const hw = SOCCER.houseWidth;
    const wallTop = SOCCER.groundY - state.houseWallH;
    const roofPeak = state.roofPeakY;

    // Walls
    ctx.fillStyle = '#CC3333';
    ctx.fillRect(hx - hw / 2, wallTop, hw, state.houseWallH);

    // Brick lines
    ctx.strokeStyle = '#AA2222';
    ctx.lineWidth = 1;
    for (let by = wallTop + 12; by < SOCCER.groundY; by += 12) {
        ctx.beginPath();
        ctx.moveTo(hx - hw / 2, by);
        ctx.lineTo(hx + hw / 2, by);
        ctx.stroke();
        const offset = ((by - wallTop) / 12 | 0) % 2 === 0 ? 0 : 20;
        for (let bx = hx - hw / 2 + offset; bx < hx + hw / 2; bx += 40) {
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx, by - 12);
            ctx.stroke();
        }
    }

    // Roof
    ctx.fillStyle = '#4A5568';
    ctx.beginPath();
    ctx.moveTo(hx - hw / 2 - 15, wallTop);
    ctx.lineTo(hx, roofPeak);
    ctx.lineTo(hx + hw / 2 + 15, wallTop);
    ctx.fill();
    // Roof shingle lines
    ctx.strokeStyle = '#3D4852';
    ctx.lineWidth = 1;
    for (let ry = roofPeak + 10; ry < wallTop; ry += 10) {
        const t = (ry - roofPeak) / (wallTop - roofPeak);
        const lx = hx - (hw / 2 + 15) * t;
        const rx = hx + (hw / 2 + 15) * t;
        ctx.beginPath();
        ctx.moveTo(lx, ry);
        ctx.lineTo(rx, ry);
        ctx.stroke();
    }

    // Chimney - sit it on the actual roof slope at its x-position
    const chimneyX = hx + hw / 4;
    const chimneyW = 20;
    const chimneyH = 40;
    // Use the chimney's right edge (the lower point on the slope) so the chimney
    // fully meets the roof along its base.
    const chimneyBaseDist = Math.abs((chimneyX + chimneyW) - hx);
    const chimneyHalfW = hw / 2;
    const roofYAtChimney = wallTop - state.houseRoofH * (1 - chimneyBaseDist / chimneyHalfW);
    const chimneyBottom = roofYAtChimney + 3; // small embed into the roof
    const chimneyTop = chimneyBottom - chimneyH;
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(chimneyX, chimneyTop, chimneyW, chimneyH);
    ctx.fillStyle = '#666';
    ctx.fillRect(chimneyX - 2, chimneyTop - 3, chimneyW + 4, 5);

    // Windows
    const winY = wallTop + 20;
    [-50, 50].forEach(offset => {
        ctx.fillStyle = '#2C3E50';
        ctx.fillRect(hx + offset - 18, winY, 36, 30);
        // Warm glow
        ctx.fillStyle = '#FFD54F';
        ctx.fillRect(hx + offset - 15, winY + 3, 14, 12);
        ctx.fillRect(hx + offset + 1, winY + 3, 14, 12);
        ctx.fillRect(hx + offset - 15, winY + 17, 14, 10);
        ctx.fillRect(hx + offset + 1, winY + 17, 14, 10);
        // Frame
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(hx + offset - 18, winY, 36, 30);
        ctx.beginPath();
        ctx.moveTo(hx + offset, winY);
        ctx.lineTo(hx + offset, winY + 30);
        ctx.moveTo(hx + offset - 18, winY + 15);
        ctx.lineTo(hx + offset + 18, winY + 15);
        ctx.stroke();
    });

    // Door
    ctx.fillStyle = '#5D3A1A';
    ctx.fillRect(hx - 15, SOCCER.groundY - 50, 30, 50);
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(hx + 8, SOCCER.groundY - 25, 3, 0, Math.PI * 2);
    ctx.fill();
    // Door frame
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(hx - 15, SOCCER.groundY - 50, 30, 50);

    // Foundation bushes
    ctx.fillStyle = '#2E7D32';
    for (let bx = hx - hw / 2 + 10; bx < hx + hw / 2 - 10; bx += 25) {
        ctx.beginPath();
        ctx.arc(bx, SOCCER.groundY - 5, 10, Math.PI, 0);
        ctx.fill();
    }

    // White trim at roofline
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - hw / 2, wallTop);
    ctx.lineTo(hx + hw / 2, wallTop);
    ctx.stroke();

    // ---- ATHLETE (during kick phases and visible sprint) ----
    const drawAthlete = (ax, ay, running, kicking) => {
        ctx.save();
        ctx.translate(ax, ay);
        // Head
        ctx.fillStyle = '#E8B89D';
        ctx.beginPath();
        ctx.arc(0, -45, 10, 0, Math.PI * 2);
        ctx.fill();
        // Hair
        ctx.fillStyle = '#4A3728';
        ctx.beginPath();
        ctx.arc(0, -50, 8, Math.PI, 0);
        ctx.fill();
        // Body
        ctx.fillStyle = '#2196F3';
        ctx.fillRect(-6, -35, 12, 20);
        // Legs
        if (kicking) {
            ctx.fillStyle = '#1565C0';
            ctx.fillRect(-6, -15, 5, 18);
            // Kicking leg forward
            ctx.save();
            ctx.translate(1, -15);
            ctx.rotate(-0.6);
            ctx.fillRect(0, 0, 5, 18);
            ctx.restore();
        } else if (running) {
            const legPhase = Math.sin(state.timer * 12);
            ctx.fillStyle = '#1565C0';
            ctx.save();
            ctx.translate(-4, -15);
            ctx.rotate(legPhase * 0.4);
            ctx.fillRect(0, 0, 5, 18);
            ctx.restore();
            ctx.save();
            ctx.translate(1, -15);
            ctx.rotate(-legPhase * 0.4);
            ctx.fillRect(0, 0, 5, 18);
            ctx.restore();
        } else {
            ctx.fillStyle = '#1565C0';
            ctx.fillRect(-6, -15, 5, 18);
            ctx.fillRect(1, -15, 5, 18);
        }
        // Arms
        ctx.fillStyle = '#E8B89D';
        if (running) {
            const armPhase = Math.sin(state.timer * 12 + Math.PI);
            ctx.save();
            ctx.translate(-6, -33);
            ctx.rotate(armPhase * 0.5);
            ctx.fillRect(-2, 0, 4, 12);
            ctx.restore();
            ctx.save();
            ctx.translate(6, -33);
            ctx.rotate(-armPhase * 0.5);
            ctx.fillRect(-2, 0, 4, 12);
            ctx.restore();
        } else {
            ctx.fillRect(-8, -33, 4, 12);
            ctx.fillRect(4, -33, 4, 12);
        }
        ctx.restore();
    };

    // Draw athlete based on phase
    if (state.phase === 'ready' || state.phase === 'angleSet' || state.phase === 'powerCharge') {
        drawAthlete(SOCCER.athleteStartX, SOCCER.groundY, false, false);
    } else if (state.phase === 'kick') {
        drawAthlete(SOCCER.athleteStartX, SOCCER.groundY, false, true);
    } else if (state.phase === 'flight') {
        // Runner visible when not behind house
        const rp = state.runnerProgress;
        if (rp < 0.35 || rp > 0.65) {
            drawAthlete(state.runnerWorldX, SOCCER.groundY, true, false);
        } else {
            // Dust clouds above house
            const dustX = SOCCER.houseX;
            const dustY = roofPeak - 15;
            for (let i = 0; i < 3; i++) {
                const dx = dustX + Math.sin(state.timer * 6 + i * 2) * 20;
                const dy = dustY - i * 5;
                ctx.fillStyle = `rgba(180,180,180,${0.3 + Math.sin(state.timer * 4 + i) * 0.15})`;
                ctx.beginPath();
                ctx.arc(dx, dy, 5 + i * 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if (state.phase === 'catch') {
        drawAthlete(state.catchAthleteX, SOCCER.groundY, false, false);
    } else if (state.phase === 'result' && !state.ballHitHouse) {
        const ax = state.catchResult === 'miss' ? state.catchAthleteX : (state.ballLandingX || state.catchAthleteX);
        drawAthlete(ax, SOCCER.groundY, false, false);
    }

    // Ball shadow + predicted landing target
    if ((state.phase === 'flight' || state.phase === 'catch') && !state.ballLanded) {
        // Shadow directly below ball (faded)
        const shadowAlpha = Math.max(0.1, Math.min(0.3, (SOCCER.groundY - state.ballY) / 400));
        ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(state.ballX, SOCCER.groundY + 2, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Predicted landing marker (helps player position for the catch)
        const dy = SOCCER.groundY - state.ballY;
        if (dy > 0 && state.ballVy > -200) { // only show once ball is descending or near-peak
            const disc = state.ballVy * state.ballVy + 2 * SOCCER.gravity * dy;
            if (disc >= 0) {
                const t = (-state.ballVy + Math.sqrt(disc)) / SOCCER.gravity;
                const predictedX = state.ballX + state.ballVx * t +
                                   state.wind * SOCCER.windFactor * t * t / 2;
                // Only show predicted marker past the house (in catchable zone)
                if (predictedX > state.houseRight + 10) {
                    ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 4]);
                    ctx.beginPath();
                    ctx.ellipse(predictedX, SOCCER.groundY + 2, 18, 6, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    // Center crosshair
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
                    ctx.beginPath();
                    ctx.arc(predictedX, SOCCER.groundY + 2, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    // Ball trail
    state.ballTrail.forEach((pt, i) => {
        const alpha = (i / state.ballTrail.length) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Ball
    if (state.phase !== 'ready' && state.phase !== 'angleSet' && state.phase !== 'powerCharge') {
        ctx.save();
        ctx.translate(state.ballX, state.ballY);
        ctx.rotate(state.ballAngle);
        // White ball
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, SOCCER.ballRadius, 0, Math.PI * 2);
        ctx.fill();
        // Pentagon pattern
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        for (let a = 0; a < Math.PI * 2; a += Math.PI * 2 / 5) {
            ctx.beginPath();
            ctx.arc(Math.cos(a) * 5, Math.sin(a) * 5, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, SOCCER.ballRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // Particles (sparkles, dust)
    state.particles.forEach(p => {
        const alpha = 1 - p.age / p.life;
        ctx.fillStyle = p.color || '#FFD700';
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.restore(); // end world-space

    // ---- HUD (screen-space) ----

    // Wind indicator
    if (state.phase !== 'ready') {
        const windStr = Math.abs(state.wind).toFixed(1);
        const windDir = state.wind > 0 ? '→' : state.wind < 0 ? '←' : '';
        const windColor = Math.abs(state.wind) > 2 ? '#FF5722' : Math.abs(state.wind) > 1 ? '#FFEB3B' : '#FFFFFF';
        ctx.fillStyle = windColor;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`WIND: ${windStr} m/s ${windDir}`, W - 20, 25);
    }

    // Angle gauge - arc from 3 o'clock (right=flat) to 12 o'clock (up=steep)
    if (state.phase === 'angleSet') {
        const gx = 150, gy = SOCCER.groundY - 100;
        const arcR = 50;
        const angleSpan = SOCCER.angleMax - SOCCER.angleMin;
        // Map needle radians -> normalized 0-1 -> canvas angle 0 (right) to -PI/2 (up)
        const t = (state.angleNeedle - SOCCER.angleMin) / angleSpan;
        const needleCanvasAngle = -t * (Math.PI / 2);

        // Base arc
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gx, gy, arcR, -Math.PI / 2, 0);
        ctx.stroke();
        // Optimal zone (green arc) - around the optimal angle
        const optT = (SOCCER.optimalAngle - SOCCER.angleMin) / angleSpan;
        const optMin = Math.max(0, optT - SOCCER.optimalZoneHalfWidth);
        const optMax = Math.min(1, optT + SOCCER.optimalZoneHalfWidth);
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(gx, gy, arcR, -optMax * (Math.PI / 2), -optMin * (Math.PI / 2));
        ctx.stroke();
        // Needle
        ctx.strokeStyle = '#FF5722';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + Math.cos(needleCanvasAngle) * arcR,
                   gy + Math.sin(needleCanvasAngle) * arcR);
        ctx.stroke();
        // Endpoint labels
        ctx.fillStyle = '#AAA';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('FLAT', gx + arcR + 6, gy + 4);
        ctx.textAlign = 'center';
        ctx.fillText('STEEP', gx, gy - arcR - 6);
        // Angle display
        const degrees = Math.round(state.angleNeedle * 180 / Math.PI);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(degrees + '°', gx, gy + 25);
        ctx.font = '12px monospace';
        ctx.fillText('TAP SPACE', gx, gy + 42);
    }

    // Power meter
    if (state.phase === 'powerCharge') {
        const px = 100, py = H - 50, pw = 200, ph = 20;
        ctx.fillStyle = '#333';
        ctx.fillRect(px, py, pw, ph);
        const pColor = state.power > 0.8 ? '#FF5722' : state.power > 0.5 ? '#FFEB3B' : '#4CAF50';
        ctx.fillStyle = pColor;
        ctx.fillRect(px, py, pw * state.power, ph);
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, pw, ph);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('HOLD SPACE - RELEASE TO KICK', px + pw / 2, py - 8);
        ctx.fillText(Math.round(state.power * 100) + '%', px + pw / 2, py + 15);
    }

    // Sprint progress bar
    if (state.phase === 'flight') {
        const barX = 150, barY = H - 30, barW = 600, barH = 16;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(barX, barY, barW * state.runnerProgress, barH);
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
        // Runner icon
        ctx.fillStyle = '#FFF';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('SPRINT! L/R', barX, barY - 4);
        // House marker
        const houseMarker = barX + barW * 0.5;
        ctx.fillStyle = '#CC3333';
        ctx.fillRect(houseMarker - 5, barY - 2, 10, barH + 4);
    }

    // Catch positioning hint
    if (state.phase === 'catch' && !state.ballLanded) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('← POSITION YOURSELF →', W / 2, H - 30);
    }

    // Ready prompt
    if (state.phase === 'ready') {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PRESS SPACE TO START', W / 2, H / 2 - 60);
        ctx.font = '14px monospace';
        ctx.fillText('Kick the ball over the house and catch it!', W / 2, H / 2 - 35);
        // House height indicator
        const heightLabel = state.houseScale > 1.2 ? 'TALL HOUSE!' : state.houseScale > 1 ? 'TALLER HOUSE' : '';
        if (heightLabel) {
            ctx.fillStyle = '#FF5722';
            ctx.font = 'bold 16px monospace';
            ctx.fillText(heightLabel, W / 2, H / 2 - 10);
        }
    }

    // Result overlay
    if (state.phase === 'result') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(W / 2 - 160, H / 2 - 70, 320, 140);

        ctx.textAlign = 'center';
        // Result text
        const textColor = state.score === 0 ? '#FF5722' :
            state.catchResult === 'perfect' ? '#FFD700' : '#FFFFFF';
        ctx.fillStyle = textColor;
        ctx.font = 'bold 24px monospace';
        ctx.fillText(state.resultText, W / 2, H / 2 - 35);

        // Score
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(`${state.score} pts`, W / 2, H / 2);

        // Breakdown
        if (state.score > 0) {
            ctx.font = '12px monospace';
            ctx.fillStyle = '#AAA';
            let breakdownY = H / 2 + 20;
            ctx.fillText(`Clear: ${SOCCER.baseClearPoints} + Roof: ${state.clearanceBonus} + Catch: ${state.catchPoints}`, W / 2, breakdownY);
            breakdownY += 16;
            if (state.earlyBonus > 0 || state.windBonus > 0) {
                ctx.fillText(`Early: +${state.earlyBonus} | Wind: +${state.windBonus}`, W / 2, breakdownY);
            }
        }
    }

    ctx.restore(); // end shake transform
};

// ============================================================
//  BOTTLE THROW - Event Implementation
// ============================================================

const BOTTLE_THROW = {
    maxLevel: 5,
    targetRotations:   [1,    2,    3,    4,    5   ],   // index = level - 1
    toleranceDegrees:  [20,   20,   20,   20,   20  ],   // ± tolerance per level (constant — challenge comes from rotation count, wind, bee)
    windRange:         [3.0,  4.5,  6.0,  7.5,  9.0 ],   // ± deg/sec² per level (tail+, head−)
    beeSpawnChance:    [0.10, 0.18, 0.28, 0.40, 0.55],   // probability per level

    // Spin (angular velocity in deg/sec)
    minSpinRate: 90,
    maxSpinRate: 1080,                   // 3 rev/sec at max
    spinNeedleSpeed: 0.80,               // needle oscillation rate (0..1 / sec) — constant across levels

    // Power → flight duration
    minFlightDur: 0.8,                   // sec
    maxFlightDur: 2.5,                   // sec
    powerChargeRate: 0.55,               // 0..1 per sec while holding

    // Bumblebee
    beeMultiplierMin: 0.6,
    beeMultiplierMax: 1.5,
    beeRadius: 24,
    beeBaseSpeed: 220,                   // px/sec

    // Visual flight arc
    arcHeight: 130,                      // peak px above hand
    handX: 220,
    handY: 360,
    landX: 700,                          // bottle lands here

    // Scoring (hybrid: base + precision bonus)
    levelBaseMult: 4,                    // base = N * 4
    levelPrecMult: 16,                   // bonus = N * 16 * precision
};

EventLogic.bottleThrow = {
    init(state) {
        state.frame = 0;
        state.timer = 0;
        state.score = 0;
        state.attemptScore = 0;
        state.level = 1;
        state.levelResults = [];

        this._startLevel(state);
    },

    _startLevel(state) {
        const lv = state.level;
        const lvIdx = lv - 1;

        // Phase machine reset
        state.phase = 'ready';
        state.readyTimer = 0.6;          // brief beat before spin begins so player sees the new level

        // Spin
        state.spin = 0;                  // locked spin rate (deg/sec)
        state.spinNeedle = 0;            // 0..1
        state.spinNeedleDir = 1;
        state.spinSet = false;

        // Power
        state.power = 0;                 // 0..1
        state.powerCharging = false;
        state.powerSet = false;
        state.powerValue = 0;

        // Flight
        state.flightDur = 0;             // computed on throw
        state.flightTime = 0;
        state.bottleAngle = 0;           // current display angle (deg)
        state.totalRotation = 0;         // cumulative rotation (deg) — used for scoring
        state.spinRate = 0;              // live angular velocity (changes with wind / bee)

        // Wind (constant per level, applied as angular acceleration to spinRate during flight)
        const wRange = BOTTLE_THROW.windRange[lvIdx];
        state.wind = (Math.random() - 0.5) * 2 * wRange;
        state.wind = Math.round(state.wind * 10) / 10;

        // Bee
        state.bee = null;
        state.beeHit = false;
        state.beeMultiplier = 1.0;
        if (Math.random() < BOTTLE_THROW.beeSpawnChance[lvIdx]) {
            const fromLeft = Math.random() < 0.5;
            state.bee = {
                x: fromLeft ? -40 : 940,
                y: 130 + Math.random() * 140,
                dir: fromLeft ? 1 : -1,
                speed: BOTTLE_THROW.beeBaseSpeed * (0.85 + Math.random() * 0.4),
                bobPhase: Math.random() * Math.PI * 2,
                wingFrame: 0,
                alive: true,
            };
        }

        // Result transient
        state.resultTimer = 0;
        state.levelOffset = 0;            // signed offset from target (deg)
        state.levelPoints = 0;
        state.levelPrecision = 0;
        state.levelCleared = false;

        // Particles
        state.particles = [];

        // Visual flight position
        state.bottleX = BOTTLE_THROW.handX;
        state.bottleY = BOTTLE_THROW.handY - 30;
    },

    handleInput(state, code, type) {
        if (code !== 'Space') return;

        // Skip input during ready beat
        if (state.phase === 'ready' && type === 'down') {
            // Allow player to "skip" the ready beat by tapping
            state.readyTimer = 0;
            state.phase = 'spin';
            SFX.play('charge');
            return;
        }

        // Spin phase — tap to lock needle
        if (state.phase === 'spin' && type === 'down') {
            state.spinSet = true;
            // Linear mapping needle 0..1 → minSpinRate..maxSpinRate
            const rate = BOTTLE_THROW.minSpinRate + state.spinNeedle * (BOTTLE_THROW.maxSpinRate - BOTTLE_THROW.minSpinRate);
            state.spin = Math.round(rate);
            state.phase = 'power';
            state.power = 0;
            SFX.play('tick');
            return;
        }

        // Power phase — hold to charge, release to throw
        if (state.phase === 'power') {
            if (type === 'down') {
                state.powerCharging = true;
            }
            if (type === 'up' && state.powerCharging) {
                state.powerCharging = false;
                state.powerSet = true;
                state.powerValue = state.power;
                state.phase = 'throw';
                state.throwAnim = 1.0;
                SFX.play('throw');
            }
            return;
        }
    },

    update(state, dt) {
        state.frame++;
        state.timer += dt;

        // --- Ready beat ---
        if (state.phase === 'ready') {
            state.readyTimer -= dt;
            if (state.readyTimer <= 0) {
                state.phase = 'spin';
                SFX.play('charge');
            }
        }

        // --- Spin needle oscillation (constant speed across all levels) ---
        if (state.phase === 'spin') {
            state.spinNeedle += state.spinNeedleDir * BOTTLE_THROW.spinNeedleSpeed * dt;
            if (state.spinNeedle >= 1) { state.spinNeedle = 1; state.spinNeedleDir = -1; }
            if (state.spinNeedle <= 0) { state.spinNeedle = 0; state.spinNeedleDir = 1; }
        }

        // --- Power charging ---
        if (state.phase === 'power' && state.powerCharging) {
            state.power = Math.min(1, state.power + BOTTLE_THROW.powerChargeRate * dt);
            if (state.frame % 8 === 0) SFX.play('charge');
        }

        // --- Throw windup ---
        if (state.phase === 'throw') {
            state.throwAnim -= dt * 5;
            if (state.throwAnim <= 0) {
                state.throwAnim = 0;
                state.phase = 'flight';
                // Power → flight duration
                state.flightDur = BOTTLE_THROW.minFlightDur
                    + state.powerValue * (BOTTLE_THROW.maxFlightDur - BOTTLE_THROW.minFlightDur);
                state.flightTime = 0;
                state.spinRate = state.spin;
                state.totalRotation = 0;
                SFX.play('woosh');
            }
        }

        // --- Flight ---
        if (state.phase === 'flight') {
            state.flightTime += dt;
            const t = Math.min(1, state.flightTime / state.flightDur);

            // Apply wind (constant angular acceleration on spinRate)
            state.spinRate += state.wind * dt;

            // Update bottle angle and totalRotation
            const dRot = state.spinRate * dt;
            state.bottleAngle = (state.bottleAngle + dRot) % 360;
            state.totalRotation += dRot;

            // Visual arc (parabolic, hand → land)
            state.bottleX = BOTTLE_THROW.handX + (BOTTLE_THROW.landX - BOTTLE_THROW.handX) * t;
            const arc = 4 * t * (1 - t); // 0 → 1 → 0
            state.bottleY = (BOTTLE_THROW.handY - 30) - arc * BOTTLE_THROW.arcHeight - (1 - t) * 0; // hand height baseline; lands at handY-30 too (flat surface table)
            // Slight downward drop on landing for visual "thump"
            state.bottleY += t * t * 8;

            // Bee movement & collision
            if (state.bee && state.bee.alive) {
                state.bee.x += state.bee.dir * state.bee.speed * dt;
                state.bee.wingFrame += dt * 14;
                state.bee.y += Math.sin(state.timer * 4 + state.bee.bobPhase) * 0.5;

                if (!state.beeHit) {
                    const dx = state.bottleX - state.bee.x;
                    const dy = state.bottleY - state.bee.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < BOTTLE_THROW.beeRadius) {
                        state.beeHit = true;
                        state.bee.alive = false;
                        state.beeMultiplier = BOTTLE_THROW.beeMultiplierMin
                            + Math.random() * (BOTTLE_THROW.beeMultiplierMax - BOTTLE_THROW.beeMultiplierMin);
                        state.spinRate *= state.beeMultiplier;
                        SFX.play('thunk');
                        // Burst particles
                        for (let i = 0; i < 14; i++) {
                            state.particles.push({
                                x: state.bee.x, y: state.bee.y,
                                vx: (Math.random() - 0.5) * 180,
                                vy: (Math.random() - 0.5) * 140,
                                life: 0.9,
                                color: i % 2 === 0 ? '#FFD54F' : '#212121',
                            });
                        }
                    }
                }
            }

            if (t >= 1) {
                // Landing — compute scoring
                state.phase = 'landing';
                const target = 360 * BOTTLE_THROW.targetRotations[state.level - 1];
                const tolerance = BOTTLE_THROW.toleranceDegrees[state.level - 1];
                const offset = state.totalRotation - target;
                state.levelOffset = offset;

                if (Math.abs(offset) <= tolerance) {
                    state.levelCleared = true;
                    const precision = Math.max(0, 1 - Math.abs(offset) / tolerance);
                    state.levelPrecision = precision;
                    const lv = state.level;
                    state.levelPoints = Math.round(
                        lv * BOTTLE_THROW.levelBaseMult
                        + lv * BOTTLE_THROW.levelPrecMult * precision
                    );
                    state.attemptScore += state.levelPoints;
                    state.score = state.attemptScore;
                    SFX.play(precision > 0.7 ? 'fanfare' : 'thunk');
                    // Sparkle particles
                    for (let i = 0; i < 18; i++) {
                        state.particles.push({
                            x: state.bottleX, y: state.bottleY,
                            vx: (Math.random() - 0.5) * 200,
                            vy: -Math.random() * 180 - 40,
                            life: 1.2,
                            color: precision > 0.7 ? '#FFD700' : '#81D4FA',
                        });
                    }
                    state.resultTimer = 1.8;
                } else {
                    state.levelCleared = false;
                    state.levelPrecision = 0;
                    state.levelPoints = 0;
                    SFX.play('miss');
                    // Dust particles
                    for (let i = 0; i < 10; i++) {
                        state.particles.push({
                            x: state.bottleX, y: state.bottleY,
                            vx: (Math.random() - 0.5) * 100,
                            vy: -Math.random() * 60 - 10,
                            life: 0.9,
                            color: '#A1887F',
                        });
                    }
                    state.resultTimer = 2.4;
                }

                state.levelResults.push({
                    level: state.level,
                    cleared: state.levelCleared,
                    offset: state.levelOffset,
                    precision: state.levelPrecision,
                    points: state.levelPoints,
                });
            }
        }

        // --- Landing result display ---
        if (state.phase === 'landing') {
            state.resultTimer -= dt;
            if (state.resultTimer <= 0) {
                if (state.levelCleared && state.level < BOTTLE_THROW.maxLevel) {
                    // Advance to next level
                    state.level++;
                    this._startLevel(state);
                } else {
                    // Attempt complete (cleared L5 or failed)
                    state.phase = 'done';
                    state.score = state.attemptScore;
                }
            }
        }

        // --- Particles update ---
        if (state.particles.length > 0) {
            state.particles.forEach(p => {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy += 220 * dt;
                p.life -= dt;
            });
            state.particles = state.particles.filter(p => p.life > 0);
        }

        // --- HUD ---
        let hudScore;
        if (state.phase === 'spin') {
            hudScore = 'SPIN ' + Math.round(BOTTLE_THROW.minSpinRate
                + state.spinNeedle * (BOTTLE_THROW.maxSpinRate - BOTTLE_THROW.minSpinRate)) + '°/s';
        } else if (state.phase === 'power') {
            hudScore = 'POWER ' + Math.round(state.power * 100) + '%';
        } else if (state.phase === 'flight' || state.phase === 'landing') {
            const target = BOTTLE_THROW.targetRotations[state.level - 1];
            hudScore = 'ROT ' + (state.totalRotation / 360).toFixed(2) + ' / ' + target;
        } else {
            hudScore = state.attemptScore + ' pts';
        }

        const targetN = BOTTLE_THROW.targetRotations[state.level - 1];
        UI.updateHUD({
            eventName: 'Bottle Throw',
            playerName: Game.players[Game.currentPlayerIndex]?.name || '',
            score: hudScore,
            timer: 'L' + state.level + ' • TGT ' + targetN + ' rot • Wind ' + (state.wind > 0 ? '+' : '') + state.wind.toFixed(1) + '°/s²',
            attempt: Game.practiceMode
                ? 'PRACTICE'
                : (EVENTS.find(e => e.id === 'bottleThrow').attempts > 1
                    ? `ATTEMPT ${Game.currentAttempt + 1}/${EVENTS.find(e => e.id === 'bottleThrow').attempts}`
                    : ''),
        });
    },
};

EventRenderers.bottleThrow = function(ctx, state) {
    const W = 900, H = 500;

    // --- Sky ---
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 220);
    skyGrad.addColorStop(0, '#7BC8E8');
    skyGrad.addColorStop(1, '#D4ECF7');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // --- Sun ---
    ctx.fillStyle = 'rgba(255, 235, 90, 0.55)';
    ctx.beginPath();
    ctx.arc(760, 90, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 235, 90, 0.25)';
    ctx.beginPath();
    ctx.arc(760, 90, 60, 0, Math.PI * 2);
    ctx.fill();

    // --- Distant hills ---
    ctx.fillStyle = '#7CB342';
    ctx.beginPath();
    ctx.moveTo(0, 250);
    for (let x = 0; x <= W; x += 30) {
        const yy = 250 - 30 * Math.sin(x * 0.012) - 18 * Math.sin(x * 0.024 + 1.7);
        ctx.lineTo(x, yy);
    }
    ctx.lineTo(W, 280); ctx.lineTo(0, 280);
    ctx.closePath();
    ctx.fill();

    // --- Garden ground ---
    const groundY = 400;
    const grassGrad = ctx.createLinearGradient(0, 250, 0, H);
    grassGrad.addColorStop(0, '#9CCC65');
    grassGrad.addColorStop(0.5, '#7CB342');
    grassGrad.addColorStop(1, '#558B2F');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, 250, W, H - 250);

    // --- Picnic table (the throwing surface) ---
    const tableY = groundY - 30;
    ctx.fillStyle = '#8D6E63';
    ctx.fillRect(120, tableY, 780, 12);
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(120, tableY + 12, 780, 4);
    // Table grain
    ctx.strokeStyle = 'rgba(78, 52, 46, 0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(140 + i * 130, tableY + 2);
        ctx.lineTo(140 + i * 130, tableY + 10);
        ctx.stroke();
    }
    // Table legs
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(160, tableY + 16, 10, 50);
    ctx.fillRect(840, tableY + 16, 10, 50);

    // --- Top banner: level + target ---
    const targetN = BOTTLE_THROW.targetRotations[state.level - 1];
    const tolerance = BOTTLE_THROW.toleranceDegrees[state.level - 1];
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(W / 2 - 200, 14, 400, 36);
    ctx.fillStyle = '#FFD54F';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LEVEL ' + state.level + ' / 5  •  TARGET ' + targetN + ' ROT  •  ±' + tolerance + '°', W / 2, 32);

    // --- Wind indicator (top-left) ---
    const windAbs = Math.abs(state.wind);
    const windStrong = windAbs > BOTTLE_THROW.windRange[state.level - 1] * 0.6;
    ctx.fillStyle = windStrong ? 'rgba(180, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(20, 14, 240, 36);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 14, 240, 36);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WIND', 30, 22);
    ctx.font = 'bold 14px monospace';
    ctx.fillText((state.wind > 0 ? '+' : '') + state.wind.toFixed(1) + '°/s²', 30, 42);
    // Spin-effect suffix (unambiguous: tailwind adds spin, headwind subtracts)
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = state.wind > 0 ? '#81C784' : (state.wind < 0 ? '#EF5350' : '#FFFFFF');
    const effectLabel = state.wind > 0 ? '→ +SPIN' : (state.wind < 0 ? '→ −SPIN' : '');
    ctx.fillText(effectLabel, 90, 42);
    // Arrow
    const arrowX = 210;
    ctx.fillStyle = state.wind > 0 ? '#81C784' : (state.wind < 0 ? '#EF5350' : '#FFFFFF');
    ctx.beginPath();
    if (state.wind >= 0) {
        ctx.moveTo(arrowX, 24); ctx.lineTo(arrowX + 30, 32); ctx.lineTo(arrowX, 40);
    } else {
        ctx.moveTo(arrowX + 30, 24); ctx.lineTo(arrowX, 32); ctx.lineTo(arrowX + 30, 40);
    }
    ctx.closePath();
    ctx.fill();

    // --- Score so far (top-right) ---
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(W - 220, 14, 200, 36);
    ctx.fillStyle = '#FFD54F';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('SCORE: ' + state.attemptScore, W - 30, 32);
    ctx.textBaseline = 'alphabetic';

    // --- Bumblebee (drawn behind/around bottle) ---
    if (state.bee && state.bee.alive) {
        const b = state.bee;
        ctx.save();
        ctx.translate(b.x, b.y);
        // Wings
        const wingFlap = Math.abs(Math.sin(b.wingFrame));
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.ellipse(-6, -10, 12, 5 + wingFlap * 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(6, -10, 12, 5 + wingFlap * 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
        // Body (yellow with black stripes)
        ctx.fillStyle = '#FFC107';
        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#212121';
        ctx.fillRect(-12, -3, 4, 6);
        ctx.fillRect(-2, -5, 4, 10);
        ctx.fillRect(8, -3, 4, 6);
        // Head
        ctx.fillStyle = '#212121';
        ctx.beginPath();
        ctx.arc(b.dir * 16, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        // Eye
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(b.dir * 18, -1, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // --- Hand + bottle (pre-throw) ---
    const handX = BOTTLE_THROW.handX;
    const handY = BOTTLE_THROW.handY;
    const showHandBottle = state.phase === 'ready' || state.phase === 'spin'
        || state.phase === 'power' || state.phase === 'throw';

    if (showHandBottle) {
        // Forearm coming up from below
        ctx.fillStyle = '#E8B89D';
        ctx.fillRect(handX - 18, handY + 6, 36, 80);
        // Sleeve
        ctx.fillStyle = '#1E88E5';
        ctx.fillRect(handX - 22, handY + 60, 44, 30);
        // Hand
        ctx.fillStyle = '#E8B89D';
        ctx.beginPath();
        ctx.arc(handX, handY + 4, 18, 0, Math.PI * 2);
        ctx.fill();
        // Fingers wrapped (thumb arc)
        ctx.fillStyle = '#D4A180';
        ctx.fillRect(handX - 18, handY - 8, 8, 16);
        ctx.fillRect(handX + 10, handY - 8, 8, 16);

        // Bottle
        const bottleAng = state.phase === 'throw'
            ? -state.throwAnim * 0.6
            : 0;
        const bobble = state.phase === 'spin' ? Math.sin(state.timer * 6) * 1.5 : 0;
        const liftY = state.phase === 'throw' ? -state.throwAnim * 14 : 0;

        ctx.save();
        ctx.translate(handX, handY - 30 + bobble + liftY);
        ctx.rotate(bottleAng);
        drawBottle(ctx, 0, 0);
        ctx.restore();
    }

    // --- Bottle in flight ---
    if (state.phase === 'flight' || state.phase === 'landing') {
        ctx.save();
        ctx.translate(state.bottleX, state.bottleY);
        ctx.rotate((state.bottleAngle * Math.PI) / 180);
        drawBottle(ctx, 0, 0);
        ctx.restore();

        // Trail (faint motion blur)
        if (state.phase === 'flight') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            for (let i = 1; i <= 4; i++) {
                const tt = Math.max(0, (state.flightTime - i * 0.04) / state.flightDur);
                if (tt <= 0) continue;
                const tx = BOTTLE_THROW.handX + (BOTTLE_THROW.landX - BOTTLE_THROW.handX) * tt;
                const arc = 4 * tt * (1 - tt);
                const ty = (BOTTLE_THROW.handY - 30) - arc * BOTTLE_THROW.arcHeight + tt * tt * 8;
                ctx.beginPath();
                ctx.arc(tx, ty, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // --- Live rotation counter (during flight + landing) ---
    if (state.phase === 'flight' || state.phase === 'landing') {
        const rot = state.totalRotation / 360;
        const target = BOTTLE_THROW.targetRotations[state.level - 1];
        const tol = BOTTLE_THROW.toleranceDegrees[state.level - 1];
        const offset = state.totalRotation - 360 * target;
        const overshoot = Math.abs(offset) > tol && state.totalRotation > 360 * target;

        let counterColor;
        if (state.phase === 'landing') {
            counterColor = state.levelCleared ? '#66BB6A' : '#EF5350';
        } else if (overshoot) {
            counterColor = '#EF5350';
        } else if (Math.abs(offset) <= tol) {
            counterColor = '#FFD54F';
        } else {
            counterColor = '#FFFFFF';
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(W / 2 - 110, 60, 220, 50);
        ctx.strokeStyle = counterColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(W / 2 - 110, 60, 220, 50);
        ctx.fillStyle = counterColor;
        ctx.font = 'bold 26px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rot.toFixed(2) + ' / ' + target, W / 2, 85);
    }

    // --- Spin gauge (during spin phase) ---
    if (state.phase === 'spin') {
        const gx = W / 2 - 180;
        const gy = 130;
        const gw = 360;
        const gh = 36;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(gx - 10, gy - 24, gw + 20, gh + 50);
        ctx.fillStyle = '#222';
        ctx.fillRect(gx, gy, gw, gh);

        // Color gradient (low=cool, high=hot)
        const grad = ctx.createLinearGradient(gx, gy, gx + gw, gy);
        grad.addColorStop(0, '#42A5F5');
        grad.addColorStop(0.5, '#FFEE58');
        grad.addColorStop(1, '#EF5350');
        ctx.fillStyle = grad;
        ctx.fillRect(gx, gy, gw, gh);

        // Tick marks at "rotation count if max-power" — gives player a hint
        // Each tick is the spin rate that yields exactly N full rotations at maxFlightDur.
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        for (let n = 1; n <= 5; n++) {
            const reqRate = (360 * n) / BOTTLE_THROW.maxFlightDur;
            if (reqRate < BOTTLE_THROW.minSpinRate || reqRate > BOTTLE_THROW.maxSpinRate) continue;
            const rel = (reqRate - BOTTLE_THROW.minSpinRate) / (BOTTLE_THROW.maxSpinRate - BOTTLE_THROW.minSpinRate);
            const tx = gx + rel * gw;
            ctx.fillStyle = (n === BOTTLE_THROW.targetRotations[state.level - 1]) ? '#FFD54F' : '#FFFFFF';
            ctx.fillRect(tx - 1, gy - 4, 2, 8);
            ctx.fillRect(tx - 1, gy + gh - 4, 2, 8);
            ctx.fillText(n + 'x', tx, gy - 8);
        }

        // Needle
        const needleX = gx + state.spinNeedle * gw;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(needleX - 2, gy - 8, 4, gh + 16);
        ctx.beginPath();
        ctx.moveTo(needleX - 8, gy + gh + 8);
        ctx.lineTo(needleX + 8, gy + gh + 8);
        ctx.lineTo(needleX, gy + gh);
        ctx.closePath();
        ctx.fill();

        // Live rate readout
        const liveRate = Math.round(BOTTLE_THROW.minSpinRate
            + state.spinNeedle * (BOTTLE_THROW.maxSpinRate - BOTTLE_THROW.minSpinRate));
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(liveRate + '°/s   ( ticks = min spin for N rot at max power )', W / 2, gy + gh + 28);

        // Prompt
        ctx.fillStyle = '#FFD54F';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('TAP SPACE TO LOCK SPIN', W / 2, gy - 36);
    }

    // --- Power meter (during power phase) ---
    if (state.phase === 'power') {
        const gx = W / 2 - 180;
        const gy = 130;
        const gw = 360;
        const gh = 36;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(gx - 10, gy - 24, gw + 20, gh + 50);
        ctx.fillStyle = '#222';
        ctx.fillRect(gx, gy, gw, gh);

        // Power fill
        const pgrad = ctx.createLinearGradient(gx, gy, gx + gw, gy);
        pgrad.addColorStop(0, '#42A5F5');
        pgrad.addColorStop(0.5, '#66BB6A');
        pgrad.addColorStop(0.85, '#FFEE58');
        pgrad.addColorStop(1, '#EF5350');
        ctx.fillStyle = pgrad;
        ctx.fillRect(gx, gy, gw * state.power, gh);

        // Flight-duration tick marks
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        for (let i = 0; i <= 4; i++) {
            const tx = gx + (i / 4) * gw;
            ctx.fillRect(tx - 1, gy - 4, 2, gh + 8);
            const dur = (BOTTLE_THROW.minFlightDur + (i / 4) * (BOTTLE_THROW.maxFlightDur - BOTTLE_THROW.minFlightDur));
            ctx.fillText(dur.toFixed(1) + 's', tx, gy - 8);
        }

        // Live readout (wind-aware projected rotation)
        const dur = BOTTLE_THROW.minFlightDur + state.power * (BOTTLE_THROW.maxFlightDur - BOTTLE_THROW.minFlightDur);
        const baseRot = (state.spin * dur) / 360;
        const windRot = (0.5 * state.wind * dur * dur) / 360;
        const projectedRot = baseRot + windRot;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(
            'SPIN ' + state.spin + '°/s  •  FLIGHT ' + dur.toFixed(2) + 's  →  ' + projectedRot.toFixed(2) + ' rot',
            W / 2, gy + gh + 28
        );
        // Wind contribution breakdown (small, in subtle color)
        if (Math.abs(state.wind) > 0.01) {
            ctx.font = '11px monospace';
            ctx.fillStyle = state.wind > 0 ? '#A5D6A7' : '#EF9A9A';
            ctx.fillText(
                '(spin ' + baseRot.toFixed(2) + (windRot >= 0 ? ' + ' : ' − ') + Math.abs(windRot).toFixed(2) + ' wind)',
                W / 2, gy + gh + 46
            );
        }

        ctx.fillStyle = '#FFD54F';
        ctx.font = 'bold 18px monospace';
        ctx.fillText(state.powerCharging ? 'RELEASE TO THROW!' : 'HOLD SPACE TO CHARGE', W / 2, gy - 36);
    }

    // --- Particles ---
    if (state.particles && state.particles.length) {
        state.particles.forEach(p => {
            const alpha = Math.max(0, Math.min(1, p.life));
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2 + p.life * 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        });
    }

    // --- Landing result banner ---
    if (state.phase === 'landing') {
        let title, subtitle, color;
        if (state.levelCleared) {
            const prec = state.levelPrecision;
            if (prec >= 0.85) { title = 'PERFECT!'; color = '#FFD700'; }
            else if (prec >= 0.5) { title = 'GREAT!'; color = '#66BB6A'; }
            else { title = 'CLEARED!'; color = '#81D4FA'; }
            subtitle = '+' + state.levelPoints + ' PTS  •  off by ' + Math.abs(state.levelOffset).toFixed(1) + '°';
        } else {
            title = 'MISSED!';
            color = '#EF5350';
            subtitle = 'off by ' + Math.abs(state.levelOffset).toFixed(1) + '°  •  needed ±' + tolerance + '°';
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(W / 2 - 200, 200, 400, 90);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(W / 2 - 200, 200, 400, 90);
        ctx.fillStyle = color;
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, W / 2, 232);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(subtitle, W / 2, 268);
        ctx.textBaseline = 'alphabetic';
    }
};

// Helper — draws a bottle centered at (x, y), neck pointing up.
function drawBottle(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    // Body (rounded rect approximated)
    ctx.fillStyle = '#388E3C';
    ctx.beginPath();
    ctx.moveTo(-9, 22);
    ctx.lineTo(9, 22);
    ctx.lineTo(9, -6);
    ctx.lineTo(5, -14);
    ctx.lineTo(-5, -14);
    ctx.lineTo(-9, -6);
    ctx.closePath();
    ctx.fill();
    // Body shading on right
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    ctx.moveTo(4, 22);
    ctx.lineTo(9, 22);
    ctx.lineTo(9, -6);
    ctx.lineTo(5, -14);
    ctx.lineTo(4, -14);
    ctx.closePath();
    ctx.fill();
    // Highlight stripe (left)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(-7, -10, 2, 28);
    // Neck
    ctx.fillStyle = '#2E7D32';
    ctx.fillRect(-3, -22, 6, 8);
    // Cap
    ctx.fillStyle = '#FBC02D';
    ctx.fillRect(-4, -26, 8, 5);
    ctx.fillStyle = '#E68F00';
    ctx.fillRect(-4, -23, 8, 1);
    // Label
    ctx.fillStyle = '#FFEB3B';
    ctx.fillRect(-7, 0, 14, 10);
    ctx.fillStyle = '#212121';
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TFA', 0, 5);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

// ---- Input Handler ----
const Input = {
    keys: {},
    listeners: [],

    init() {
        window.addEventListener('keydown', (e) => {
            if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(e.code)) {
                e.preventDefault();
            }
            if (!this.keys[e.code]) {
                this.keys[e.code] = true;
                this.dispatch(e.code, 'down');
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this.dispatch(e.code, 'up');
        });

        // Touch support
        let touchActive = false;
        document.getElementById('game-canvas')?.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touchActive = true;
            this.dispatch('Space', 'down');
        });
        document.getElementById('game-canvas')?.addEventListener('touchend', (e) => {
            e.preventDefault();
            touchActive = false;
            this.dispatch('Space', 'up');
        });
    },

    dispatch(code, type) {
        this.listeners.forEach(fn => fn(code, type));
    },

    onInput(fn) {
        this.listeners.push(fn);
    },

    clearListeners() {
        this.listeners = [];
    },

    isDown(code) {
        return !!this.keys[code];
    },
};

// ---- Podium Renderer ----
const Podium = {
    render(players) {
        const canvas = document.getElementById('podium-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const sorted = [...players].sort((a, b) => b.totalPoints - a.totalPoints);

        // Compute tied ranks
        const ranks = [];
        for (let i = 0; i < sorted.length; i++) {
            ranks[i] = (i > 0 && sorted[i].totalPoints === sorted[i - 1].totalPoints)
                ? ranks[i - 1] : i;
        }

        const cx = canvas.width / 2;

        // Draw sky
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, '#1B3A5C');
        gradient.addColorStop(1, '#4A90D9');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 900, 400);

        // Podium blocks
        const podiumColors = [COLORS.gold, COLORS.silver, COLORS.bronze];
        const podiumData = [
            { x: cx, w: 100, h: 140 },
            { x: cx - 130, w: 100, h: 100 },
            { x: cx + 130, w: 100, h: 70 },
        ];

        podiumData.forEach((p, i) => {
            if (!sorted[i]) return;
            const rank = ranks[i];
            const color = podiumColors[rank] || COLORS.bronze;
            const baseY = 380;
            // Block
            ctx.fillStyle = color;
            ctx.fillRect(p.x - p.w / 2, baseY - p.h, p.w, p.h);
            // Place number
            ctx.fillStyle = '#000';
            ctx.font = 'bold 28px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(rank + 1, p.x, baseY - p.h / 2 + 10);
            // Player name
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 14px monospace';
            ctx.fillText(sorted[i].name, p.x, baseY - p.h - 50);
            // Points
            ctx.fillStyle = color;
            ctx.font = '12px monospace';
            ctx.fillText(sorted[i].totalPoints + ' pts', p.x, baseY - p.h - 35);
            // Simple athlete figure
            Scene.drawAthlete(p.x, baseY - p.h - 10, 0);
        });

        // Additional players below
        const medalClasses = ['gold', 'silver', 'bronze'];
        const scoresEl = document.getElementById('podium-scores');
        scoresEl.innerHTML = sorted.map((p, i) => `
            <div class="podium-score-row ${medalClasses[ranks[i]] || ''}">
                <span class="podium-rank">${ranks[i] + 1}.</span>
                <span class="podium-name">${p.name}</span>
                <span class="podium-pts">${p.totalPoints} pts</span>
            </div>
        `).join('');
    },
};

// ---- Main Game Controller ----
const Game = {
    playerCount: 1,
    players: [],
    selectedEvents: [],
    currentEventIndex: 0,
    currentPlayerIndex: 0,
    currentAttempt: 0,
    eventResults: {},   // eventId -> [{ playerIndex, score }]
    running: false,
    animFrame: null,
    lastTime: 0,
    eventState: {},     // Current event's runtime state
    practiceMode: false, // when true: no records saved, single event, replayable

    startCompetition() {
        SFX.init();
        this.practiceMode = false;

        // Gather selected events
        this.selectedEvents = EVENTS.filter(ev => {
            const cb = document.getElementById('ev-' + ev.id);
            return cb && cb.checked;
        });

        if (this.selectedEvents.length === 0) {
            alert('Select at least one event!');
            return;
        }

        // Ensure players are set up
        for (let i = 0; i < this.playerCount; i++) {
            if (!this.players[i]) {
                this.players[i] = {
                    name: `PLAYER ${i + 1}`,
                    countryId: COUNTRIES[i % COUNTRIES.length].id,
                };
            }
            this.players[i].totalPoints = 0;
        }

        this.currentEventIndex = 0;
        this.currentPlayerIndex = 0;
        this.currentAttempt = 0;
        this.eventResults = {};

        this.showNextEvent();
    },

    startPractice(eventId) {
        SFX.init();
        const event = EVENTS.find(ev => ev.id === eventId);
        if (!event) return;
        this.practiceMode = true;
        this.playerCount = 1;
        this.selectedEvents = [event];

        // Ensure single practice player exists (uses saved avatar)
        if (!this.players[0]) {
            this.players[0] = {
                name: 'PRACTICE',
                countryId: COUNTRIES[0].id,
            };
        }
        this.players[0].totalPoints = 0;

        this.currentEventIndex = 0;
        this.currentPlayerIndex = 0;
        this.currentAttempt = 0;
        this.eventResults = {};

        this.showNextEvent();
    },

    showNextEvent() {
        if (this.currentEventIndex >= this.selectedEvents.length) {
            this.showFinalResults();
            return;
        }

        const event = this.selectedEvents[this.currentEventIndex];
        this.currentPlayerIndex = 0;
        this.currentAttempt = 0;
        this.eventResults[event.id] = [];

        // Initialize best scores for each player for this event
        for (let i = 0; i < this.playerCount; i++) {
            this.eventResults[event.id].push({
                playerIndex: i,
                bestScore: event.lowerIsBetter ? Infinity : -Infinity,
                totalScore: 0,
                scores: [],
            });
        }

        UI.showEventIntro(event);
    },

    beginEvent() {
        Scene.init();
        const event = this.selectedEvents[this.currentEventIndex];
        const player = this.players[this.currentPlayerIndex];

        UI.showScreen('screen-game');
        UI.updateHUD({
            eventName: event.name,
            playerName: player.name,
            score: '',
            timer: '',
            attempt: this.practiceMode
                ? 'PRACTICE'
                : (event.attempts > 1
                    ? `ATTEMPT ${this.currentAttempt + 1}/${event.attempts}`
                    : ''),
        });

        // Initialize event state
        this.eventState = {
            phase: 'ready',     // ready, countdown, running, done, foul
            timer: 0,
            score: 0,
            athleteX: 50,
            athleteY: 350,
            speed: 0,
            frame: 0,
            runPower: 0,
            lastLeftRight: null,
            alternateCount: 0,
        };

        // Let event-specific logic init
        if (EventLogic[event.id] && EventLogic[event.id].init) {
            EventLogic[event.id].init(this.eventState);
        }

        // Set up input handler for this event
        Input.clearListeners();
        Input.onInput((code, type) => {
            if (EventLogic[event.id] && EventLogic[event.id].handleInput) {
                EventLogic[event.id].handleInput(this.eventState, code, type);
            }
        });

        // Start game loop
        this.running = true;
        this.lastTime = performance.now();
        this.gameLoop();
    },

    gameLoop() {
        if (!this.running) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05); // Cap dt at 50ms
        this.lastTime = now;

        const event = this.selectedEvents[this.currentEventIndex];

        // Update event logic
        if (EventLogic[event.id] && EventLogic[event.id].update) {
            EventLogic[event.id].update(this.eventState, dt);
        }

        // Render
        Scene.render(event.id, this.eventState);

        // Check if event attempt is done
        if (this.eventState.phase === 'done') {
            this.running = false;
            this.onAttemptComplete();
            return;
        }

        this.animFrame = requestAnimationFrame(() => this.gameLoop());
    },

    onAttemptComplete() {
        const event = this.selectedEvents[this.currentEventIndex];
        const player = this.players[this.currentPlayerIndex];
        const score = this.eventState.score;

        // Record score
        const result = this.eventResults[event.id][this.currentPlayerIndex];
        result.scores.push(score);
        result.totalScore += score;
        if (event.lowerIsBetter) {
            if (score < result.bestScore) result.bestScore = score;
        } else {
            if (score > result.bestScore) result.bestScore = score;
        }

        // Check for world record (based on total across all attempts, only after last attempt)
        const attemptNum = result.scores.length;
        // In practice mode, each attempt is its own round (no 3-attempt cap)
        const totalAttempts = this.practiceMode ? 1 : event.attempts;
        const isLastAttempt = attemptNum >= totalAttempts;
        // Practice mode never updates records
        const isRecord = isLastAttempt && !this.practiceMode &&
            Save.updateRecord(event.id, result.totalScore, player.name, event.lowerIsBetter);
        const message = isRecord ? 'NEW RECORD!' :
            (this.eventState.foul ? 'FOUL!' : '');

        if (isRecord) SFX.play('fanfare');

        const time = this.eventState.timer
            ? 'Time: ' + this.eventState.timer.toFixed(1) + 's'
            : '';

        UI.showResult({
            title: event.name,
            score: this.eventState.foul ? 'FOUL' : score,
            unit: this.eventState.foul ? '' : event.unit,
            message,
            time,
            attemptLabel: totalAttempts > 1
                ? 'ATTEMPT ' + attemptNum + ' OF ' + totalAttempts
                : '',
            scores: result.scores,
            totalScore: result.totalScore,
            totalAttempts: totalAttempts,
        });
    },

    nextTurn() {
        const event = this.selectedEvents[this.currentEventIndex];

        // Next attempt or next player
        this.currentAttempt++;

        // In practice mode, each round is one attempt (player can replay via summary screen)
        const effectiveAttempts = this.practiceMode ? 1 : event.attempts;
        if (this.currentAttempt >= effectiveAttempts) {
            // Move to next player
            this.currentAttempt = 0;
            this.currentPlayerIndex++;

            if (this.currentPlayerIndex >= this.playerCount) {
                // All players done for this event - show standings
                this.showEventStandings();
                return;
            }
        }

        // Continue with next attempt/player
        this.beginEvent();
    },

    showEventStandings() {
        const event = this.selectedEvents[this.currentEventIndex];
        const results = this.eventResults[event.id];

        // Sort by total score across all attempts
        const sorted = [...results].sort((a, b) => {
            if (event.lowerIsBetter) return a.totalScore - b.totalScore;
            return b.totalScore - a.totalScore;
        });

        // Award points (tied scores share the best medal for that rank)
        const pointKeys = ['gold', 'silver', 'bronze', 'fourth'];
        let rank = 0;
        sorted.forEach((r, i) => {
            if (i === 0 || r.totalScore !== sorted[i - 1].totalScore) {
                rank = i;
            }
            const pts = MEDAL_POINTS[pointKeys[rank]] || MEDAL_POINTS.other;
            this.players[r.playerIndex].totalPoints += pts;
            r.points = pts;
            r.rank = rank;
        });

        const standings = sorted.map(r => ({
            name: this.players[r.playerIndex].name,
            score: r.totalScore,
            unit: event.unit,
            points: r.points,
            rank: r.rank,
        }));

        if (this.playerCount > 1) {
            UI.showStandings(event.name, standings);
        } else {
            this.proceedFromStandings();
        }
    },

    proceedFromStandings() {
        this.currentEventIndex++;
        this.showNextEvent();
    },

    showFinalResults() {
        if (!this.practiceMode) Save.incrementGamesPlayed();

        if (this.playerCount > 1) {
            // Multiplayer: podium (existing behavior)
            UI.showScreen('screen-podium');
            Podium.render(this.players);
            SFX.play('medal');
            return;
        }

        // Single player: build a per-event summary + grand score
        // Each event awards 0-100 points based on (score / maxScore).
        // maxScore is a static theoretical-max per event — never changes at runtime.
        const player = this.players[0];
        const perEvent = this.selectedEvents.map(ev => {
            const result = this.eventResults[ev.id][0];
            const score = result.totalScore;
            const max = ev.maxScore || 1;
            // No cap — lucky bonuses (e.g. seagull hit) can push above 100
            const eventPoints = Math.round((score / max) * 100);
            return {
                eventId: ev.id,
                name: ev.name,
                score,
                unit: ev.unit,
                maxScore: max,
                eventPoints,
            };
        });

        const combinedScore = perEvent.reduce((a, b) => a + b.eventPoints, 0);
        const maxPossible = this.selectedEvents.length * 100;

        // Capture existing record BEFORE updating so we can show "previous best".
        const previousGrandRecord = Save.getTotalRecord();
        let newGrandRecord = false;
        if (!this.practiceMode) {
            newGrandRecord = Save.updateTotalRecord(
                combinedScore,
                this.selectedEvents.length,
                this.selectedEvents.map(ev => ev.id),
                player.name
            );
        }

        if (newGrandRecord) SFX.play('fanfare');
        else SFX.play('medal');

        // Submit to global leaderboard (fire-and-forget, non-blocking)
        if (!this.practiceMode && this.playerCount === 1) {
            Leaderboard.submitAllScores(
                player.name, perEvent, combinedScore, this.selectedEvents.length
            );
        }

        UI.showFinalSummary({
            practiceMode: this.practiceMode,
            practiceEventId: this.practiceMode ? this.selectedEvents[0].id : null,
            playerName: player.name,
            perEvent,
            combinedScore,
            maxPossible,
            newGrandRecord,
            previousGrandRecord,
        });
    },

    stop() {
        this.running = false;
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame);
            this.animFrame = null;
        }
    },
};

// ============================================================
//  GLOBAL LEADERBOARD (Supabase)
// ============================================================
// To enable global leaderboards:
// 1. Create a free Supabase project at https://supabase.com
// 2. Run leaderboard.sql in Dashboard > SQL Editor
// 3. Set SUPABASE_URL and SUPABASE_ANON below (from Dashboard > Settings > API)
// 4. Set HMAC_SALT to match the hmac_secret in your private_config table
// The game works perfectly without Supabase configured.
// ============================================================

const Leaderboard = {
    // --- Configuration ---
    // The anon key is designed to be public (RLS protects the data).
    // The HMAC salt is a deterrent against casual score forging.
    SUPABASE_URL:  'https://mfdqesulgrxtgrdadtic.supabase.co',
    SUPABASE_ANON: 'sb_publishable_bGEPwlPmLaE-tAby_Sx3Hg_uXvaAC-c',
    HMAC_SALT:     'd5c34e811d93b21484ecfe0a3069a6db',

    _leaderboardData: null,

    init() {
        const btn = document.getElementById('btn-leaderboard');
        if (btn) btn.style.display = this.isAvailable() ? '' : 'none';
    },

    isAvailable() {
        return !!(this.SUPABASE_URL && this.SUPABASE_ANON);
    },

    // --- Plain fetch helpers (no supabase-js dependency) ---
    _headers() {
        return {
            'apikey': this.SUPABASE_ANON,
            'Content-Type': 'application/json',
        };
    },

    _restUrl(path) {
        return `${this.SUPABASE_URL}/rest/v1/${path}`;
    },

    // --- HMAC (Web Crypto API — native, no library) ---
    async _computeHMAC(message) {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw', enc.encode(this.HMAC_SALT),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
        return Array.from(new Uint8Array(sig))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    },

    _getClientId() {
        let id = localStorage.getItem('tfa-client-id');
        if (!id) {
            id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem('tfa-client-id', id);
        }
        return id;
    },

    // --- Score Submission (POST to RPC endpoint) ---
    async submitEventScore(playerName, eventId, totalScore) {
        if (!this.isAvailable()) return { ok: false, error: 'offline' };
        try {
            const ts = Date.now();
            const scoreStr = String(Number(totalScore));
            const msg = `${playerName}:${eventId}:${scoreStr}:${ts}`;
            const checksum = await this._computeHMAC(msg);
            const res = await fetch(this._restUrl('rpc/submit_score'), {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify({
                    p_player_name: playerName,
                    p_event_id:    eventId,
                    p_score:       totalScore,
                    p_timestamp:   ts,
                    p_checksum:    checksum,
                    p_client_id:   this._getClientId(),
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                console.warn('Leaderboard submit HTTP', res.status, text);
                return { ok: false, error: `HTTP ${res.status}` };
            }
            const data = await res.json();
            return data || { ok: true };
        } catch (e) {
            console.warn('Leaderboard submit failed:', e);
            return { ok: false, error: 'network' };
        }
    },

    async submitGrandScore(playerName, combinedScore, eventCount) {
        if (!this.isAvailable()) return { ok: false, error: 'offline' };
        try {
            const ts = Date.now();
            const scoreStr = String(Number(combinedScore));
            const msg = `${playerName}:grand:${scoreStr}:${ts}`;
            const checksum = await this._computeHMAC(msg);
            const res = await fetch(this._restUrl('rpc/submit_score'), {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify({
                    p_player_name: playerName,
                    p_event_id:    'grand',
                    p_score:       combinedScore,
                    p_event_count: eventCount,
                    p_timestamp:   ts,
                    p_checksum:    checksum,
                    p_client_id:   this._getClientId(),
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                console.warn('Leaderboard grand submit HTTP', res.status, text);
                return { ok: false, error: `HTTP ${res.status}` };
            }
            const data = await res.json();
            return data || { ok: true };
        } catch (e) {
            console.warn('Leaderboard grand submit failed:', e);
            return { ok: false, error: 'network' };
        }
    },

    async submitAllScores(playerName, perEvent, combinedScore, eventCount) {
        if (!this.isAvailable()) return;
        for (const e of perEvent) {
            await this.submitEventScore(playerName, e.eventId, e.score);
        }
        await this.submitGrandScore(playerName, combinedScore, eventCount);
    },

    // --- Leaderboard Fetching (GET with query params) ---
    async fetchEventTop10(eventId) {
        if (!this.isAvailable()) return [];
        try {
            const params = new URLSearchParams({
                select: 'player_name,score,event_count,created_at',
                event_id: `eq.${eventId}`,
                order: 'score.desc',
                limit: '10',
            });
            const res = await fetch(`${this._restUrl('leaderboard')}?${params}`, {
                headers: this._headers(),
            });
            if (!res.ok) { console.warn('Leaderboard fetch error:', res.status); return []; }
            return await res.json();
        } catch (e) {
            console.warn('Leaderboard fetch failed:', e);
            return [];
        }
    },

    async fetchAllLeaderboards() {
        const results = {};
        const eventIds = [...EVENTS.map(ev => ev.id), 'grand'];
        // Fetch all in parallel instead of sequentially
        const fetches = eventIds.map(id => this.fetchEventTop10(id));
        const data = await Promise.all(fetches);
        eventIds.forEach((id, i) => { results[id] = data[i]; });
        return results;
    },

    // --- UI Rendering ---
    async showLeaderboardScreen() {
        const statusEl = document.getElementById('leaderboard-status');
        const tableEl  = document.getElementById('leaderboard-table');

        if (!this.isAvailable()) {
            tableEl.innerHTML = `
                <div class="leaderboard-offline">
                    <p style="font-size:28px">&#128274;</p>
                    <p>GLOBAL LEADERBOARD NOT CONFIGURED</p>
                    <p class="hint">Set SUPABASE_URL and SUPABASE_ANON in game.js to enable.</p>
                </div>`;
            statusEl.textContent = '';
            return;
        }

        statusEl.textContent = 'LOADING...';
        tableEl.innerHTML = '';

        // Tab click handlers
        document.querySelectorAll('.lb-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this._renderTab(tab.dataset.tab);
            };
        });

        this._leaderboardData = await this.fetchAllLeaderboards();
        statusEl.textContent = '';

        const activeTab = document.querySelector('.lb-tab.active');
        this._renderTab(activeTab ? activeTab.dataset.tab : 'grand');
    },

    _renderTab(eventId) {
        const tableEl = document.getElementById('leaderboard-table');
        const data = (this._leaderboardData && this._leaderboardData[eventId]) || [];

        if (data.length === 0) {
            tableEl.innerHTML = '<div class="lb-empty">NO SCORES YET - BE THE FIRST!</div>';
            return;
        }

        const event = EVENTS.find(e => e.id === eventId);
        const unit = event ? event.unit : 'pts';
        const medals = ['lb-gold', 'lb-silver', 'lb-bronze'];

        tableEl.innerHTML = data.map((row, i) => {
            const cls = medals[i] || '';
            const dateStr = row.created_at
                ? new Date(row.created_at).toLocaleDateString()
                : '';
            const scoreDisplay = eventId === 'grand'
                ? row.score + ' pts'
                : Number(row.score).toFixed(2) + ' ' + unit;
            return `
                <div class="lb-row ${cls}">
                    <span class="lb-rank">${i + 1}.</span>
                    <span class="lb-name">${this._escapeHtml(row.player_name)}</span>
                    <span class="lb-score">${scoreDisplay}</span>
                    <span class="lb-date">${dateStr}</span>
                </div>`;
        }).join('');
    },

    _escapeHtml(str) {
        const el = document.createElement('div');
        el.textContent = str;
        return el.innerHTML;
    },
};

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
    Input.init();
    SFX.init();
    Leaderboard.init();
});
