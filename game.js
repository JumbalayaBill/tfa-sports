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
        if (screenId === 'screen-records') this.setupRecords();
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
            ladder:   '<div class="pixel-icon">&#128508;</div>',
        };
        return icons[icon] || '<div class="pixel-icon">?</div>';
    },

    setupRecords() {
        const list = document.getElementById('records-list');
        const saveData = Save.load();
        list.innerHTML = EVENTS.map(ev => {
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

    showResult(title, score, unit, message, detail, rankings) {
        document.getElementById('result-title').textContent = title;
        document.getElementById('result-score').textContent =
            typeof score === 'number' ? score.toFixed(2) : score;
        document.getElementById('result-unit').textContent = unit || '';
        document.getElementById('result-detail').textContent = detail || '';
        document.getElementById('result-message').textContent = message || '';

        const rankEl = document.getElementById('result-ranking');
        if (rankings && rankings.length > 0) {
            rankEl.innerHTML = rankings.map((r, i) => `
                <div class="ranking-row ${i === 0 ? 'first' : ''}">
                    <span class="rank">${i + 1}.</span>
                    <span class="rank-name">${r.name}</span>
                    <span class="rank-score">${r.score.toFixed(2)} ${unit}</span>
                </div>
            `).join('');
        } else {
            rankEl.innerHTML = '';
        }

        this.showScreen('screen-result');
    },

    showStandings(eventName, standings) {
        document.getElementById('standings-event-name').textContent = eventName + ' - STANDINGS';
        const table = document.getElementById('standings-table');
        table.innerHTML = standings.map((s, i) => {
            const medalClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            return `
                <div class="standings-row ${medalClass}">
                    <span class="standings-rank">${i + 1}</span>
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
            attempt: EVENTS[0].attempts > 1
                ? `ATTEMPT ${Game.currentAttempt + 1}/${EVENTS[0].attempts}`
                : '',
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
        const cx = canvas.width / 2;

        // Draw sky
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, '#1B3A5C');
        gradient.addColorStop(1, '#4A90D9');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 900, 400);

        // Podium blocks
        const podiumData = [
            { place: 1, x: cx, w: 100, h: 140, color: COLORS.gold },
            { place: 2, x: cx - 130, w: 100, h: 100, color: COLORS.silver },
            { place: 3, x: cx + 130, w: 100, h: 70, color: COLORS.bronze },
        ];

        podiumData.forEach((p, i) => {
            if (!sorted[i]) return;
            const baseY = 380;
            // Block
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.w / 2, baseY - p.h, p.w, p.h);
            // Place number
            ctx.fillStyle = '#000';
            ctx.font = 'bold 28px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(p.place, p.x, baseY - p.h / 2 + 10);
            // Player name
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 14px monospace';
            ctx.fillText(sorted[i].name, p.x, baseY - p.h - 50);
            // Points
            ctx.fillStyle = p.color;
            ctx.font = '12px monospace';
            ctx.fillText(sorted[i].totalPoints + ' pts', p.x, baseY - p.h - 35);
            // Simple athlete figure
            Scene.drawAthlete(p.x, baseY - p.h - 10, 0);
        });

        // Additional players below
        const scoresEl = document.getElementById('podium-scores');
        scoresEl.innerHTML = sorted.map((p, i) => `
            <div class="podium-score-row ${i < 3 ? ['gold','silver','bronze'][i] : ''}">
                <span class="podium-rank">${i + 1}.</span>
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

    startCompetition() {
        SFX.init();

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
            attempt: event.attempts > 1
                ? `ATTEMPT ${this.currentAttempt + 1}/${event.attempts}`
                : '',
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

        // Check for world record (based on total across all attempts)
        const isRecord = Save.updateRecord(event.id, result.totalScore, player.name, event.lowerIsBetter);
        const message = isRecord ? 'NEW RECORD!' :
            (this.eventState.foul ? 'FOUL!' : '');

        if (isRecord) SFX.play('fanfare');

        const attemptNum = result.scores.length;
        const totalAttempts = event.attempts;
        let detail = 'Time: ' + (this.eventState.timer ? this.eventState.timer.toFixed(1) + 's' : '0.0s');
        if (totalAttempts > 1) {
            detail += '  |  Total: ' + result.totalScore.toFixed(2) + ' ' + event.unit
                + ' (' + attemptNum + '/' + totalAttempts + ')';
        }

        UI.showResult(
            event.name,
            this.eventState.foul ? 'FOUL' : score,
            this.eventState.foul ? '' : event.unit,
            message,
            detail,
            null
        );
    },

    nextTurn() {
        const event = this.selectedEvents[this.currentEventIndex];

        // Next attempt or next player
        this.currentAttempt++;

        if (this.currentAttempt >= event.attempts) {
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

        // Award points
        const pointKeys = ['gold', 'silver', 'bronze', 'fourth'];
        sorted.forEach((r, i) => {
            const pts = MEDAL_POINTS[pointKeys[i]] || MEDAL_POINTS.other;
            this.players[r.playerIndex].totalPoints += pts;
            r.points = pts;
        });

        const standings = sorted.map(r => ({
            name: this.players[r.playerIndex].name,
            score: r.totalScore,
            unit: event.unit,
            points: r.points,
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
        Save.incrementGamesPlayed();
        if (this.playerCount > 1) {
            UI.showScreen('screen-podium');
            Podium.render(this.players);
            SFX.play('medal');
        } else {
            UI.showScreen('screen-title');
        }
    },

    stop() {
        this.running = false;
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame);
            this.animFrame = null;
        }
    },
};

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
    Input.init();
    SFX.init();
});
