/* -------------------------------------------------------------
 * 1. APP STATE & GLOBAL CONSTANTS
 * ------------------------------------------------------------- */
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const CENTER_X = CANVAS_WIDTH / 2;
const CENTER_Y = CANVAS_HEIGHT / 2 - 50;
const TAWAF_RADIUS_X = 320;
const TAWAF_RADIUS_Y = 220;
const ENTRY_X = CENTER_X;
const ENTRY_Y = CANVAS_HEIGHT - 120;

const DEFAULT_KAABA_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="240" viewBox="0 0 220 240"><rect x="30" y="40" width="160" height="170" fill="%23111111" rx="8"/><path d="M 30 40 L 190 40 L 190 85 L 30 85 Z" fill="%23d97706"/><rect x="35" y="45" width="150" height="35" fill="none" stroke="%23fef08a" stroke-width="3" stroke-dasharray="6,4"/><text x="110" y="68" fill="%23fef08a" font-size="16" font-family="sans-serif" font-weight="bold" text-anchor="middle">ﷲ</text><rect x="50" y="110" width="35" height="75" fill="%23b45309" stroke="%23fef08a" stroke-width="2"/><circle cx="170" cy="165" r="12" fill="%23475569" stroke="%23cbd5e1" stroke-width="4"/><circle cx="170" cy="165" r="5" fill="%230f172a"/></svg>`;

let state = {
    activeUsers: [],
    stats: { totalSpawned: 0, completed: 0, totalLaps: 0 },
    settings: {
        isPaused: false,
        speedMultiplier: 1.0,
        sizeScale: 1.0,
        soundVolume: 0.8,
        soundMuted: false,
        kaabaImageSrc: DEFAULT_KAABA_SVG,
        kaabaScale: 1.0,
        kaabaOffsetY: 0
    }
};

let canvas, ctx;
let kaabaImage = new Image();
let audioCtx = null;
let isFirebaseReady = false;

/* -------------------------------------------------------------
 * 2. INITIALIZATION
 * ------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('tawafCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    kaabaImage.src = state.settings.kaabaImageSrc;

    const urlParams = new URLSearchParams(window.location.search);
    const viewMode = urlParams.get('mode');
    if (viewMode === 'admin') switchView('admin');
    else if (viewMode === 'display') switchView('display');

    initFirebaseListeners();
    requestAnimationFrame(renderCanvasLoop);
});

window.addEventListener('firebaseReady', () => {
    isFirebaseReady = true;
    initFirebaseListeners();
});

function switchView(viewName) {
    const displaySec = document.getElementById('view-display');
    const adminSec = document.getElementById('view-admin');
    const btnDisplay = document.getElementById('btn-mode-display');
    const btnAdmin = document.getElementById('btn-mode-admin');

    if (viewName === 'display') {
        displaySec.classList.remove('hidden');
        adminSec.classList.add('hidden');
        btnDisplay.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-md";
        btnAdmin.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700";
    } else {
        displaySec.classList.add('hidden');
        adminSec.classList.remove('hidden');
        btnAdmin.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-md";
        btnDisplay.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700";
    }
}

/* -------------------------------------------------------------
 * 3. AUDIO SYNTHESIZER
 * ------------------------------------------------------------- */
function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const btnInit = document.getElementById('btn-audio-init');
        if (btnInit) {
            btnInit.innerHTML = `<i class="fa-solid fa-volume-high mr-1"></i> Suara Aktif`;
            btnInit.classList.replace('text-amber-400', 'text-emerald-400');
        }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function speakWelcome(username) {
    if (!('speechSynthesis' in window) || state.settings.soundMuted || state.settings.soundVolume <= 0) return;
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(`Selamat datang ${username}`);
        utterance.lang = 'id-ID';
        utterance.volume = state.settings.soundVolume;
        const voices = window.speechSynthesis.getVoices();
        const idVoice = voices.find(voice => voice.lang.includes('id') || voice.lang.includes('ID'));
        if (idVoice) utterance.voice = idVoice;
        window.speechSynthesis.speak(utterance);
    } catch (e) { console.warn("Speech Synthesis error:", e); }
}

function playSynthesizedSound(type) {
    if (!audioCtx || state.settings.soundMuted || state.settings.soundVolume <= 0) return;
    try {
        const now = audioCtx.currentTime;
        const masterGain = audioCtx.createGain();
        masterGain.gain.value = state.settings.soundVolume;
        masterGain.connect(audioCtx.destination);

        if (type === 'spawn_biasa') {
            const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
            gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
            osc.connect(gain); gain.connect(masterGain); osc.start(now); osc.stop(now + 0.08);
        } else if (type === 'spawn_sedang') {
            [523.25, 659.25, 783.99].forEach((freq, idx) => {
                const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
                osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, now + idx * 0.04);
                gain.gain.setValueAtTime(0.25, now + idx * 0.04); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.connect(gain); gain.connect(masterGain); osc.start(now + idx * 0.04); osc.stop(now + 0.3);
            });
        } else if (type === 'spawn_besar') {
            [261.63, 329.63, 392.00, 523.25].forEach((freq) => {
                const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
                osc.connect(gain); gain.connect(masterGain); osc.start(now); osc.stop(now + 0.8);
            });
        } else if (type === 'finish_tawaf') {
            [659.25, 783.99, 1046.50].forEach((freq, idx) => {
                const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(freq, now + idx * 0.06);
                gain.gain.setValueAtTime(0.2, now + idx * 0.06); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                osc.connect(gain); gain.connect(masterGain); osc.start(now + idx * 0.06); osc.stop(now + 0.4);
            });
        }
    } catch (e) { console.warn("Audio play blocked:", e); }
}

/* -------------------------------------------------------------
 * 4. FIREBASE SYNC
 * ------------------------------------------------------------- */
function initFirebaseListeners() {
    if (!window.db) {
        setTimeout(initFirebaseListeners, 500);
        return;
    }
    if (!isFirebaseReady) return;

    console.log("✅ Sinkronisasi Firebase Aktif:", window.appId);
    const dbRef = window.db;
    const appId = window.appId || 'default-app';

    const usersRef = window.ref(dbRef, `artifacts/${appId}/public/data/activeUsers`);
    window.onValue(usersRef, (snapshot) => {
        const data = snapshot.val();
        state.activeUsers = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
        updateAdminTableUI();
    });

    const settingsRef = window.ref(dbRef, `artifacts/${appId}/public/data/settings`);
    window.onValue(settingsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            state.settings = { ...state.settings, ...data };
            if (data.kaabaImageSrc) kaabaImage.src = data.kaabaImageSrc;
            updateSettingsUI();
        }
    });
}

function syncStateToFirebase() {
    if (!window.db) return;
    const appId = window.appId || 'default-app';
    window.set(window.ref(window.db, `artifacts/${appId}/public/data/settings`), state.settings);
}

/* -------------------------------------------------------------
 * 5. USER SPAWN & KINEMATICS
 * ------------------------------------------------------------- */
function handleSpawnUser(e) {
    e.preventDefault();
    initAudioContext();

    const usernameInput = document.getElementById('input-username');
    const username = usernameInput.value.trim().replace(/^@/, '');
    if (!username) return;

    const category = document.querySelector('input[name="giftCategory"]:checked').value;
    // BARU: Mengambil nilai mode karakter dari form
    const charMode = document.querySelector('input[name="characterMode"]:checked').value; 
    
    const userId = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const radiusOffset = (Math.random() - 0.5) * 120;
    const speedVar = 0.9 + Math.random() * 0.2;

    const newUser = {
        id: userId, username, category, characterMode: charMode, startTime: Date.now(),
        completedLaps: 0, status: 'entering', radiusOffset, speedVar
    };

    state.activeUsers.push(newUser);
    state.stats.totalSpawned++;
    playSynthesizedSound(`spawn_${category}`);
    speakWelcome(username);

    if (window.db) {
        const appId = window.appId || 'default-app';
        window.set(window.ref(window.db, `artifacts/${appId}/public/data/activeUsers/${userId}`), newUser)
            .catch(err => console.error("Gagal kirim:", err));
    }

    usernameInput.value = '';
    updateAdminTableUI();
}

function removeUser(userId) {
    state.activeUsers = state.activeUsers.filter(u => u.id !== userId);
    if (window.db) {
        const appId = window.appId || 'default-app';
        window.remove(window.ref(window.db, `artifacts/${appId}/public/data/activeUsers/${userId}`));
    }
    updateAdminTableUI();
}

function clearAllUsers() {
    state.activeUsers = [];
    if (window.db) {
        const appId = window.appId || 'default-app';
        window.set(window.ref(window.db, `artifacts/${appId}/public/data/activeUsers`), {});
    }
    updateAdminTableUI();
}

/* -------------------------------------------------------------
 * 6. CANVAS RENDER ENGINE
 * ------------------------------------------------------------- */
function renderCanvasLoop() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawMasjidHaramBackground(ctx);
    drawTawafFloorGuide(ctx);
    drawKaabaBuilding(ctx);

    const now = Date.now();
    let activeCount = 0;
    let totalLapsSum = 0;

    const sortedUsers = [...state.activeUsers].sort((a, b) => calculateUserPosition(a, now).y - calculateUserPosition(b, now).y);

    sortedUsers.forEach(user => {
        const pos = calculateUserPosition(user, now);
        if (pos.status !== 'finished') {
            activeCount++;
            totalLapsSum += pos.completedLaps;
            drawUserCharacter(ctx, user, pos);
        } else if (user.status !== 'finished') {
            user.status = 'finished';
            state.stats.completed++;
            playSynthesizedSound('finish_tawaf');
            setTimeout(() => removeUser(user.id), 1000);
        }
    });

    document.getElementById('live-active-count').innerText = activeCount;
    document.getElementById('live-total-laps').innerText = totalLapsSum;
    document.getElementById('stat-active').innerText = activeCount;
    document.getElementById('stat-laps').innerText = totalLapsSum;
    document.getElementById('stat-completed').innerText = state.stats.completed;
    document.getElementById('stat-total-spawned').innerText = state.stats.totalSpawned;

    requestAnimationFrame(renderCanvasLoop);
}

function calculateUserPosition(user, now) {
    if (state.settings.isPaused) now = user.pausedTime || now;
    const elapsedSec = (now - user.startTime) / 1000 * state.settings.speedMultiplier * user.speedVar;
    const entryDuration = 4.0;
    
    if (elapsedSec < entryDuration) {
        const progress = elapsedSec / entryDuration;
        const startOrbitX = CENTER_X + (TAWAF_RADIUS_X + user.radiusOffset) * Math.cos(Math.PI / 2);
        const startOrbitY = CENTER_Y + (TAWAF_RADIUS_Y + user.radiusOffset * 0.7) * Math.sin(Math.PI / 2);
        return { x: ENTRY_X + (startOrbitX - ENTRY_X) * progress, y: ENTRY_Y + (startOrbitY - ENTRY_Y) * progress, completedLaps: 0, status: 'entering', alpha: Math.min(progress * 2, 1) };
    }

    const orbitElapsed = elapsedSec - entryDuration;
    const lapDuration = 10.0;
    const totalTargetLaps = 5;
    const totalRadians = (orbitElapsed / lapDuration) * (2 * Math.PI);
    const currentLap = Math.floor(totalRadians / (2 * Math.PI));
    const currentAngle = (Math.PI / 2) - totalRadians;
    const rx = TAWAF_RADIUS_X + user.radiusOffset;
    const ry = TAWAF_RADIUS_Y + user.radiusOffset * 0.7;
    
    const currentX = CENTER_X + rx * Math.cos(currentAngle);
    const currentY = CENTER_Y + ry * Math.sin(currentAngle);

    if (currentLap >= totalTargetLaps) {
        const overLapSec = orbitElapsed - (totalTargetLaps * lapDuration);
        const fadeAlpha = Math.max(0, 1 - overLapSec / 1.5);
        return { x: currentX, y: currentY, completedLaps: 5, status: fadeAlpha <= 0 ? 'finished' : 'exiting', alpha: fadeAlpha };
    }
    return { x: currentX, y: currentY, completedLaps: currentLap, status: 'tawaf', alpha: 1.0 };
}

/* -------------------------------------------------------------
 * 7. DRAWING HELPERS
 * ------------------------------------------------------------- */
function drawMasjidHaramBackground(ctx) {
    const bgGrad = ctx.createRadialGradient(CENTER_X, CENTER_Y, 100, CENTER_X, CENTER_Y, 1000);
    bgGrad.addColorStop(0, '#f8fafc'); bgGrad.addColorStop(0.6, '#f1f5f9'); bgGrad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = 'rgba(203, 213, 225, 0.4)'; ctx.lineWidth = 3;
    for (let r = 180; r <= 800; r += 90) {
        ctx.beginPath(); ctx.ellipse(CENTER_X, CENTER_Y, r * 1.3, r * 0.85, 0, 0, Math.PI * 2); ctx.stroke();
    }

    const gateGrad = ctx.createLinearGradient(ENTRY_X - 120, ENTRY_Y, ENTRY_X + 120, ENTRY_Y);
    gateGrad.addColorStop(0, 'rgba(217, 119, 6, 0.05)'); gateGrad.addColorStop(0.5, 'rgba(217, 119, 6, 0.15)'); gateGrad.addColorStop(1, 'rgba(217, 119, 6, 0.05)');
    ctx.fillStyle = gateGrad;
    ctx.beginPath();
    ctx.moveTo(CENTER_X - 140, CENTER_Y + TAWAF_RADIUS_Y + 40);
    ctx.lineTo(CENTER_X + 140, CENTER_Y + TAWAF_RADIUS_Y + 40);
    ctx.lineTo(CENTER_X + 220, CANVAS_HEIGHT);
    ctx.lineTo(CENTER_X - 220, CANVAS_HEIGHT);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, CANVAS_WIDTH, 70);
    ctx.fillStyle = '#d97706'; ctx.fillRect(0, 70, CANVAS_WIDTH, 6);
}

function drawTawafFloorGuide(ctx) {
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.3)'; ctx.lineWidth = 4; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(CENTER_X, CENTER_Y + 120); ctx.lineTo(CENTER_X, CENTER_Y + TAWAF_RADIUS_Y + 120); ctx.stroke();
    ctx.setLineDash([]);
}

function drawKaabaBuilding(ctx) {
    const scale = state.settings.kaabaScale || 1.0;
    const offsetY = state.settings.kaabaOffsetY || 0;
    const w = 240 * scale; const h = 260 * scale;
    const x = CENTER_X - (w / 2); const y = (CENTER_Y - (h / 2)) + offsetY;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
    ctx.beginPath(); ctx.ellipse(CENTER_X, CENTER_Y + (h / 2.5) + offsetY, w * 0.6, 40 * scale, 0, 0, Math.PI * 2); ctx.fill();

    try { ctx.drawImage(kaabaImage, x, y, w, h); } catch (e) { ctx.fillStyle = '#111827'; ctx.fillRect(x, y, w, h); }
}

function drawUserCharacter(ctx, user, pos) {
    ctx.save(); ctx.globalAlpha = pos.alpha;
    
    let baseRadius = 24; 
    let circleColor = '#ffffff'; 
    let strokeColor = '#94a3b8'; 
    let textColor = '#0f172a'; 
    let isGold = false;

    if (user.category === 'sedang') { 
        baseRadius = 32; 
        strokeColor = '#3b82f6'; 
    } else if (user.category === 'besar') { 
        baseRadius = 42; 
        circleColor = '#fbbf24'; 
        strokeColor = '#fef08a'; 
        textColor = '#451a03'; 
        isGold = true; 
    }

    const r = baseRadius * state.settings.sizeScale;

    // Efek Glow/Shadow
    if (isGold) {
        const pulse = Math.sin(Date.now() / 200) * 6;
        ctx.shadowColor = 'rgba(245, 158, 11, 0.8)'; ctx.shadowBlur = 18 + pulse;
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 4 + (pulse / 2), 0, Math.PI * 2); ctx.stroke();
    } else if (user.category === 'sedang') {
        ctx.shadowColor = 'rgba(59, 130, 246, 0.4)'; ctx.shadowBlur = 10;
    } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)'; ctx.shadowBlur = 6;
    }

    // ==========================================
    // BARU: LOGIKA MENGGAMBAR BERDASARKAN MODE
    // ==========================================
    const mode = user.characterMode || 'shape'; // Default ke shape jika data lama

    if (mode === 'shape' || mode === 'icon') {
        // Gambar Lingkaran (Shape)
        ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        if (isGold) {
            const goldGrad = ctx.createRadialGradient(pos.x - r/3, pos.y - r/3, r/5, pos.x, pos.y, r);
            goldGrad.addColorStop(0, '#fffbeb'); goldGrad.addColorStop(0.5, '#fde047'); goldGrad.addColorStop(1, '#d97706');
            ctx.fillStyle = goldGrad;
        } else { ctx.fillStyle = circleColor; }
        ctx.fill();
        ctx.lineWidth = isGold ? 3 : 2; ctx.strokeStyle = strokeColor; ctx.stroke();
    }

    ctx.shadowBlur = 0; // Reset shadow untuk teks

    // Gambar Teks (Semua mode)
    ctx.fillStyle = textColor; 
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    
    // Posisi Y teks disesuaikan jika ada Icon
    const textY = (mode === 'icon') ? pos.y + (r * 0.25) : pos.y - (pos.status === 'tawaf' ? 3 : 0);

    const maxTextWidth = r * 1.7;
    let fontSize = (isGold ? 16 : (user.category === 'sedang' ? 14 : 12)) * state.settings.sizeScale;
    
    // Jika mode teks saja, font bisa sedikit lebih besar
    if (mode === 'text') fontSize *= 1.2;

    ctx.font = `800 ${fontSize}px Inter, sans-serif`;

    let textWidth = ctx.measureText(user.username).width;
    if (textWidth > maxTextWidth) {
        fontSize = Math.max(8, fontSize * (maxTextWidth / textWidth));
        ctx.font = `800 ${fontSize}px Inter, sans-serif`;
    }
    ctx.fillText(user.username, pos.x, textY);

    // BARU: Gambar Icon di atas teks (jika mode icon)
    if (mode === 'icon') {
        ctx.fillStyle = isGold ? '#451a03' : strokeColor;
        ctx.font = `900 ${fontSize * 1.5}px "Font Awesome 6 Free"`;
        // Simbol bintang atau user, pastikan fontAwesome termuat
        ctx.fillText("\uf007", pos.x, pos.y - (r * 0.3)); // f007 = User Icon
    }

    // Badge Putaran
    if (pos.status === 'tawaf') {
        const badgeY = pos.y + (r * 0.65);
        ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(pos.x, badgeY, 9 * state.settings.sizeScale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f59e0b'; ctx.font = `700 ${10 * state.settings.sizeScale}px Inter, sans-serif`;
        ctx.fillText(`${pos.completedLaps + 1}/5`, pos.x, badgeY + 0.5);
    }
    ctx.restore();
}

/* -------------------------------------------------------------
 * 8. ADMIN UI HANDLERS
 * ------------------------------------------------------------- */
function updateAdminTableUI() {
    const tbody = document.getElementById('table-users-body');
    if (!tbody) return;

    if (state.activeUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-500"><i class="fa-solid fa-person-walking-arrow-right text-3xl mb-2 block opacity-40"></i>Belum ada jamaah.</td></tr>`;
        document.getElementById('badge-active-count').innerText = "0 Aktif";
        return;
    }
    document.getElementById('badge-active-count').innerText = `${state.activeUsers.length} Aktif`;

    let html = ''; const now = Date.now();
    state.activeUsers.forEach(user => {
        const pos = calculateUserPosition(user, now);
        let catBadge = `<span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">BIASA</span>`;
        if (user.category === 'sedang') catBadge = `<span class="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-[10px] font-bold">SEDANG</span>`;
        else if (user.category === 'besar') catBadge = `<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">BESAR GOLD</span>`;

        let statusBadge = `<span class="text-blue-400 font-semibold"><i class="fa-solid fa-person-walking mr-1"></i> Menuju Ka'bah</span>`;
        if (pos.status === 'tawaf') statusBadge = `<span class="text-emerald-400 font-semibold"><i class="fa-solid fa-rotate mr-1"></i> Sedang Tawaf</span>`;
        else if (pos.status === 'exiting' || pos.status === 'finished') statusBadge = `<span class="text-amber-400 font-semibold"><i class="fa-solid fa-circle-check mr-1"></i> Selesai</span>`;

        html += `<tr class="hover:bg-slate-800/40 transition">
            <td class="py-3 px-3 font-bold text-slate-100">@${escapeHtml(user.username)}</td>
            <td class="py-3 px-2">${catBadge}</td>
            <td class="py-3 px-2 font-mono font-bold text-amber-400">${pos.completedLaps} / 5</td>
            <td class="py-3 px-2 text-[11px]">${statusBadge}</td>
            <td class="py-3 px-3 text-right"><button onclick="removeUser('${user.id}')" class="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-500/10 rounded-lg transition"><i class="fa-solid fa-trash-can"></i></button></td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function updateGlobalSettings() {
    state.settings.speedMultiplier = parseFloat(document.getElementById('slider-speed').value);
    state.settings.sizeScale = parseFloat(document.getElementById('slider-size').value) / 100;
    state.settings.soundVolume = parseFloat(document.getElementById('slider-volume').value) / 100;

    document.getElementById('val-speed-multiplier').innerText = `${state.settings.speedMultiplier.toFixed(1)}x`;
    document.getElementById('val-size-scale').innerText = `${Math.round(state.settings.sizeScale * 100)}%`;
    document.getElementById('val-sound-vol').innerText = `${Math.round(state.settings.soundVolume * 100)}%`;
    syncStateToFirebase();
}

function togglePauseAnimation() {
    state.settings.isPaused = !state.settings.isPaused;
    const btn = document.getElementById('btn-pause-toggle');
    if (state.settings.isPaused) {
        btn.innerHTML = `<i class="fa-solid fa-play text-emerald-400"></i> Lanjutkan`;
        const now = Date.now();
        state.activeUsers.forEach(u => u.pausedTime = now);
    } else {
        btn.innerHTML = `<i class="fa-solid fa-pause text-amber-400"></i> Jeda`;
    }
    syncStateToFirebase();
}

function updateSettingsUI() {
    document.getElementById('slider-speed').value = state.settings.speedMultiplier;
    document.getElementById('slider-size').value = state.settings.sizeScale * 100;
    document.getElementById('slider-volume').value = state.settings.soundVolume * 100;
    document.getElementById('val-speed-multiplier').innerText = `${state.settings.speedMultiplier.toFixed(1)}x`;
    document.getElementById('val-size-scale').innerText = `${Math.round(state.settings.sizeScale * 100)}%`;
    document.getElementById('val-sound-vol').innerText = `${Math.round(state.settings.soundVolume * 100)}%`;
}

/* -------------------------------------------------------------
 * 9. CUSTOM KAABA HANDLERS (DIKEMBALIKAN)
 * ------------------------------------------------------------- */
function handleKaabaUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Data = e.target.result;
        state.settings.kaabaImageSrc = base64Data;
        kaabaImage.src = base64Data;
        syncStateToFirebase();
    };
    reader.readAsDataURL(file);
}

function updateKaabaAdjustments() {
    state.settings.kaabaScale = parseFloat(document.getElementById('slider-kaaba-scale').value) / 100;
    state.settings.kaabaOffsetY = parseFloat(document.getElementById('slider-kaaba-offset-y').value);
    syncStateToFirebase();
}

function resetKaabaImage() {
    state.settings.kaabaImageSrc = DEFAULT_KAABA_SVG;
    state.settings.kaabaScale = 1.0;
    state.settings.kaabaOffsetY = 0;
    kaabaImage.src = DEFAULT_KAABA_SVG;
    if(document.getElementById('slider-kaaba-scale')) document.getElementById('slider-kaaba-scale').value = 100;
    if(document.getElementById('slider-kaaba-offset-y')) document.getElementById('slider-kaaba-offset-y').value = 0;
    syncStateToFirebase();
}

function toggleFullscreen() {
    const elem = document.getElementById('obs-canvas-wrapper');
    if (!document.fullscreenElement) elem.requestFullscreen().catch(err => alert(`Gagal fullscreen: ${err.message}`));
    else document.exitFullscreen();
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
