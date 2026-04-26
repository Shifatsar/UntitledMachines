import { LEVELS } from './levels.js?v=30';
const board = document.getElementById('board-inner');
const gameArea = document.getElementById('game-viewport');
const paletteItems = document.querySelectorAll('.pipe-item');
// Wavedash SDK Initialization
if (window.WavedashJS) {
    try {
        // Corrected casing to .init()
        window.WavedashJS.init();
        console.log("Wavedash SDK Initialized");
    } catch (e) {
        console.error("Wavedash init Error:", e);
    }
}

const GRID_SIZE = 50; // Updated grid size
const PLAY_ROTATABLE_TYPES = ['straight', 'curve', 'tshape', 'cross'];
const MOUSE_NPC_TYPE = 'mouse-npc';
const MOUSE_NPC_MOVE_INTERVAL_MS = 520;
const MOUSE_NPC_MOVE_VARIANCE_MS = 380;
const MOUSE_NPC_STEP_MS = 220;
const MOUSE_NPC_FRAME_MS = 130;
const MOUSE_DIRECTION_TO_ROTATION = { down: 0, left: 90, up: 180, right: 270 };
const ROTATION_TO_MOUSE_DIRECTION = { 0: 'down', 90: 'left', 180: 'up', 270: 'right' };
const NPC_BLOCKER_TYPES = new Set([
    'wall', 'wall-wood', 'wall-cement', 'wall-straw',
    'door', 'door-metal', 'rock', 'pot', 'pond-large',
    'broken-bulb', 'broken-wires', 'fallen-light'
]);

// --- Audio SFX Engine ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const SFX = {
    playBlip() {
        this.playTone(600, 'square', 0.1, 0.05);
    },
    playClick() {
        this.playTone(200, 'sine', 0.06, 0.3, 1);
    },
    playScan() {
        this.playGlissando(200, 800, 1.0);
    },
    playSqueak() {
        // Double-chirp logic
        this.playTone(1500, 'triangle', 0.05, 0.05, 1);
        setTimeout(() => {
            this.playTone(1800, 'triangle', 0.04, 0.04, 1);
        }, 80);
    },
    playTone(freq, type, duration, volume, decay = 0) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (decay > 0) osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + duration);
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    playGlissando(startFreq, endFreq, duration) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }
};

// UI Elements
const mainMenu = document.getElementById('main-menu');
const editorUI = document.getElementById('editor-ui');
const btnBuild = document.getElementById('btn-build');
const btnBackMenu = document.getElementById('btn-back-menu');
const btnSave = document.getElementById('btn-save');
const levelInput = document.getElementById('level-input');
const btnStart = document.getElementById('btn-start');
const btnClearBoard = document.getElementById('btn-clear-board');
const editorLevelButtons = document.getElementById('editor-level-buttons');
const btnExportAll = document.getElementById('btn-export-all');
const btnDownloadLevels = document.getElementById('btn-download-levels');
const btnLevelSelect = document.getElementById('btn-level-select');
const levelSelectMenu = document.getElementById('level-select-menu');
const btnLevelBack = document.getElementById('btn-level-back');
const levelGrid = document.getElementById('level-grid');

// --- Drag and Drop Logic ---

let isDragging = false;
let draggedPiece = null;
let offsetX = 0;
let offsetY = 0;
let selectedPiece = null;
let gameMode = 'editor'; // 'editor' or 'play'
let currentLevel = 1;
let mouseNpcStates = new WeakMap();
let heldBox = null;
let heldBoxEl = null;

// UI Elements (continued)
const creditsMenu = document.getElementById('credits-menu');
const btnCreditsBack = document.getElementById('btn-credits-back');
const splash = document.getElementById('level-splash');
const splashText = document.getElementById('splash-level-text');


document.getElementById('bg-select').addEventListener('change', (e) => {
    document.getElementById('board-inner').className = `bg-${e.target.value}`;
    if (document.getElementById('toggle-grid').checked && gameMode === 'editor') {
        document.getElementById('board-inner').classList.add('show-grid');
    }
});

document.getElementById('toggle-grid').addEventListener('change', (e) => {
    if (e.target.checked && gameMode === 'editor') {
        document.getElementById('board-inner').classList.add('show-grid');
    } else {
        document.getElementById('board-inner').classList.remove('show-grid');
    }
});

function checkSaves() {
    let hasSaves = false;
    const levelsSet = new Set();

    // Check levels.js (code files)
    if (typeof LEVELS !== 'undefined') {
        Object.keys(LEVELS).forEach(lvl => levelsSet.add(lvl));
    }

    // Check localStorage (browser storage)
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('level_')) {
            levelsSet.add(key.replace('level_', ''));
        }
    }

    const levels = Array.from(levelsSet);
    if (levels.length > 0) hasSaves = true;

    // Sort levels numerically
    levels.sort((a, b) => parseInt(a) - parseInt(b));

    // Populate editor level buttons (1-10)
    if (editorLevelButtons) {
        editorLevelButtons.innerHTML = '';
        for (let i = 1; i <= 8; i++) {
            const btn = document.createElement('button');
            btn.className = 'editor-lvl-btn';
            btn.textContent = i;

            const isLocal = localStorage.getItem(`level_${i}`);
            const isCode = LEVELS && LEVELS[i];
            if (isLocal || isCode) btn.classList.add('has-data');

            if (parseInt(levelInput.value) === i) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', () => {
                levelInput.value = i;
                if (!loadLevel(i)) {
                    createNewLevel();
                }
                checkSaves(); // refresh active state
            });

            editorLevelButtons.appendChild(btn);
        }
    }

    if (hasSaves) {
        btnStart.removeAttribute('disabled');
        btnStart.textContent = "Start Adventure";
    } else {
        // btnStart.setAttribute('disabled', 'true'); // Keep it enabled but it will alert if clicked
        btnStart.textContent = "Start Adventure (Needs Level 1)";
    }
}

if (btnExportAll) {
    btnExportAll.addEventListener('click', () => {
        // Merge hardcoded LEVELS with localStorage drafts
        const allLevels = typeof LEVELS !== 'undefined' ? { ...LEVELS } : {};
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('level_')) {
                const lvl = key.replace('level_', '');
                allLevels[lvl] = JSON.parse(localStorage.getItem(key));
            }
        }
        
        const json = JSON.stringify(allLevels, null, 4);
        const code = `export const LEVELS = ${json};`;
        
        navigator.clipboard.writeText(code).then(() => {
            alert("Permanent level code copied! Paste the entire content into your levels.js file.");
        });
    });
}

if (btnDownloadLevels) {
    btnDownloadLevels.addEventListener('click', () => {
        const allLevels = typeof LEVELS !== 'undefined' ? { ...LEVELS } : {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('level_')) {
                const lvl = key.replace('level_', '');
                allLevels[lvl] = JSON.parse(localStorage.getItem(key));
            }
        }
        const json = JSON.stringify(allLevels, null, 4);
        const code = `export const LEVELS = ${json};`;
        
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'levels.js';
        a.click();
        URL.revokeObjectURL(url);
    });
}

// Initial check
checkSaves();

// Signal Wavedash that we are loaded
if (window.WavedashJS) {
    try {
        window.WavedashJS.updateLoadProgressZeroToOne(1.0);
    } catch (e) {}
}

btnBuild.addEventListener('click', () => {
    mainMenu.classList.add('hidden');
    editorUI.classList.remove('hidden');
    // Ensure it starts with a clean or default board if not loading
    if (board.innerHTML === '') {
        createNewLevel();
    }
});

function createNewLevel() {
    board.innerHTML = '';
    document.getElementById('bg-select').value = 'concrete';
    document.getElementById('board-inner').className = 'bg-concrete show-grid';

    const wallTemplate = document.querySelector('.pipe-item[data-type="wall"]');
    const addWall = (x, y) => {
        const clone = wallTemplate.cloneNode(true);
        clone.className = 'placed-pipe';
        clone.style.left = `${x}px`;
        clone.style.top = `${y}px`;
        board.appendChild(clone);
    };

    for (let x = 0; x < 25; x++) {
        addWall(x * GRID_SIZE, 0);
        addWall(x * GRID_SIZE, 13 * GRID_SIZE);
    }
    for (let y = 1; y < 13; y++) {
        addWall(0, y * GRID_SIZE);
        addWall(24 * GRID_SIZE, y * GRID_SIZE);
    }
    if (document.getElementById('backlight-holes')) document.getElementById('backlight-holes').innerHTML = '';
    updateCircuit();
}

btnBackMenu.addEventListener('click', () => {
    editorUI.classList.add('hidden');
    mainMenu.classList.remove('hidden');
    checkSaves();
});

// --- Level Saving Logic ---

btnSave.addEventListener('click', () => {
    const levelNum = levelInput.value;
    if (!levelNum) {
        alert("Please enter a level number.");
        return;
    }

    const pieces = document.querySelectorAll('.placed-pipe');
    const levelData = [];

    pieces.forEach(p => {
        levelData.push({
            type: p.dataset.type,
            x: parseFloat(p.style.left) || 0,
            y: parseFloat(p.style.top) || 0,
            rotation: parseInt(p.dataset.rotation) || 0,
            flip: parseInt(p.dataset.flip) || 1,
            state: p.dataset.state || null
        });
    });

    const bg = document.getElementById('bg-select').value || 'concrete';
    const saveData = { bg: bg, gridSize: GRID_SIZE, pieces: levelData };

    localStorage.setItem(`level_${levelNum}`, JSON.stringify(saveData));

    // Visual feedback
    const originalText = btnSave.textContent;
    btnSave.textContent = "Saved!";
    btnSave.style.background = "#22c55e";
    setTimeout(() => {
        btnSave.textContent = originalText;
        btnSave.style.background = "";
    }, 1500);

    checkSaves();
});

// --- Level Loading & Game Mode ---

// let player = { x: 100, y: 100, el: null, heldItem: null, facing: 1, direction: 'down' };
// const keys = {};

// window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
// window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function loadLevel(levelNum) {
    let data = null;

    // Check localStorage first for "drafts"
    const localData = localStorage.getItem(`level_${levelNum}`);
    if (localData) {
        data = localData;
    } else if (LEVELS && LEVELS[levelNum]) {
        // Otherwise use the hardcoded levels in levels.js
        data = JSON.stringify(LEVELS[levelNum]);
    }

    if (!data) {
        return false;
    }

    const parsed = JSON.parse(data);
    let levelData = [];
    let bg = 'concrete';
    let isOldGrid = false;

    if (Array.isArray(parsed)) {
        levelData = parsed;
        isOldGrid = true;
    } else {
        levelData = parsed.pieces;
        bg = parsed.bg || 'concrete';
        if (!parsed.gridSize || parsed.gridSize === 40) {
            isOldGrid = true;
        }
    }

    if (isOldGrid) {
        levelData.forEach(item => {
            item.x = Math.round(item.x / 40) * 50;
            item.y = Math.round(item.y / 40) * 50;
        });
    }

    document.getElementById('board-inner').className = `bg-${bg}`;
    if (document.getElementById('toggle-grid').checked && gameMode === 'editor') {
        document.getElementById('board-inner').classList.add('show-grid');
    }
    document.getElementById('bg-select').value = bg;

    board.innerHTML = '';

    levelData.forEach(item => {
        const template = document.querySelector(`.pipe-item[data-type="${item.type}"]`);
        if (!template) return;

        const clone = template.cloneNode(true);
        clone.className = 'placed-pipe';
        clone.style.left = `${item.x}px`;
        clone.style.top = `${item.y}px`;
        if (item.rotation) clone.dataset.rotation = item.rotation;
        if (item.flip) clone.dataset.flip = item.flip;
        if (item.state) clone.dataset.state = item.state;

        applyPieceTransform(clone);

        if (item.type === 'switch') {
            const bg = clone.querySelector('.switch-bg');
            const lever = clone.querySelector('.switch-lever');
            if (item.state === 'on') {
                bg.setAttribute('fill', '#00b894');
                lever.setAttribute('y', '25');
            } else {
                bg.setAttribute('fill', '#d63031');
                lever.setAttribute('y', '50');
            }
        }

        board.appendChild(clone);
    });

    if (document.getElementById('backlight-holes')) document.getElementById('backlight-holes').innerHTML = '';
    updateWires();
    return true;
}

function startGameMode() {
    gameMode = 'play';
    document.getElementById('game-viewport').classList.remove('editor-mode');
    isInitialFocus = true;
    document.getElementById('board-inner').classList.remove('show-grid');
    initializeMouseNpcs();

    // Create Visibility Mask if it doesn't exist
    if (!document.getElementById('visibility-mask')) {
        const mask = document.createElement('div');
        mask.id = 'visibility-mask';
        gameArea.appendChild(mask); // Put it in gameArea
    }
    document.getElementById('visibility-mask').classList.remove('hidden');

    // Clear any existing hints
    document.getElementById('tutorial-hint')?.remove();

    // Add Level 1 Tutorial Hint
    if (currentLevel === 1) {
        const hint = document.createElement('div');
        hint.id = 'tutorial-hint';
        hint.innerHTML = 'Click the wires to rotate them';
        hint.style.cssText = `
            position: absolute;
            left: 100px;
            top: 250px;
            color: rgba(255, 255, 255, 0.6);
            font-size: 24px;
            font-weight: bold;
            pointer-events: none;
            z-index: 10000;
            text-transform: uppercase;
            letter-spacing: 2px;
            width: 300px;
            text-align: center;
            font-family: 'Inter', sans-serif;
            text-shadow: 0 0 10px rgba(255,255,255,0.3);
        `;
        document.getElementById('game-viewport').appendChild(hint);
    }

    if (currentLevel === 3) {
        const hint = document.createElement('div');
        hint.id = 'tutorial-hint';
        hint.innerHTML = 'There might be a way to stop Mr. Mouse for a bit... Look around';
        hint.style.cssText = `
            position: absolute;
            left: 100px;
            top: 250px;
            color: rgba(255, 255, 255, 0.6);
            font-size: 24px;
            font-weight: bold;
            pointer-events: none;
            z-index: 10000;
            text-transform: uppercase;
            letter-spacing: 2px;
            width: 500px;
            text-align: center;
            font-family: 'Inter', sans-serif;
            text-shadow: 0 0 10px rgba(255,255,255,0.3);
        `;
        document.getElementById('game-viewport').appendChild(hint);
    }

    if (currentLevel === 2) {
        const hint = document.createElement('div');
        hint.id = 'tutorial-hint';
        hint.innerHTML = 'Oh btw, there is a mouse infestation.';
        hint.style.cssText = `
            position: absolute;
            left: 100px;
            top: 250px;
            color: rgba(255, 255, 255, 0.6);
            font-size: 24px;
            font-weight: bold;
            pointer-events: none;
            z-index: 10000;
            text-transform: uppercase;
            letter-spacing: 2px;
            width: 300px;
            text-align: center;
            font-family: 'Inter', sans-serif;
            text-shadow: 0 0 10px rgba(255,255,255,0.3);
        `;
        document.getElementById('game-viewport').appendChild(hint);
    }

    // Find bottom door for spawn position (mouse start)
    const doors = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => p.dataset.type === 'door' || p.dataset.type === 'door-metal');
    let entranceDoor = null;
    if (doors.length > 0) {
        doors.sort((a, b) => parseFloat(b.style.top) - parseFloat(a.style.top));
        entranceDoor = doors[0];
    }

    if (entranceDoor) {
        entranceDoor.dataset.isEntrance = "true";
        entranceDoor.classList.add('door-opening');

        // Initialize mouse position at entrance door center
        const rect = board.getBoundingClientRect();
        mousePos.x = parseFloat(entranceDoor.style.left) + GRID_SIZE / 2;
        mousePos.y = parseFloat(entranceDoor.style.top) + GRID_SIZE / 2;
        mousePos.clientX = rect.left + mousePos.x;
        mousePos.clientY = rect.top + mousePos.y;

        setTimeout(() => {
            entranceDoor.classList.remove('door-opening');
            entranceDoor.classList.add('door-closing');
            setTimeout(() => {
                entranceDoor.classList.remove('door-closing');
            }, 600);
        }, 1000);
    }

    // Note: gameLoop now handles mouse-based visibility and win condition
    requestAnimationFrame(gameLoop);
}

document.getElementById('btn-exit-game').addEventListener('click', () => {
    gameMode = 'editor';
    board.innerHTML = '';
    // if (player.el) player.el.remove();
    // player.heldItem = null;

    document.getElementById('btn-exit-game').classList.add('hidden');
    document.getElementById('visibility-mask')?.classList.add('hidden');
    document.getElementById('editor-ui').classList.add('hidden');
    document.querySelector('.sidebar').style.display = 'block';
    document.getElementById('main-menu').classList.remove('active');
    document.getElementById('main-menu').classList.remove('hidden');

    if (document.getElementById('toggle-grid').checked) {
        document.getElementById('board-inner').classList.add('show-grid');
    }

    checkSaves();
});

if (btnClearBoard) {
    btnClearBoard.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear the board and start a new level?")) {
            board.innerHTML = '';
            document.getElementById('bg-select').value = 'concrete';
            document.getElementById('board-inner').className = 'bg-concrete show-grid';

            const wallTemplate = document.querySelector('.pipe-item[data-type="wall"]');

            const addWall = (x, y) => {
                const clone = wallTemplate.cloneNode(true);
                clone.className = 'placed-pipe';
                clone.style.left = `${x}px`;
                clone.style.top = `${y}px`;
                board.appendChild(clone);
            };

            for (let x = 0; x < 25; x++) {
                addWall(x * GRID_SIZE, 0);
                addWall(x * GRID_SIZE, 13 * GRID_SIZE);
            }
            for (let y = 1; y < 13; y++) {
                addWall(0, y * GRID_SIZE);
                addWall(24 * GRID_SIZE, y * GRID_SIZE);
            }
        }
    });
}

btnStart.addEventListener('click', () => {
    SFX.playBlip();
    currentLevel = 1;
    if (loadLevel(currentLevel)) {
        mainMenu.classList.add('hidden');
        editorUI.classList.remove('hidden');
        document.querySelector('.sidebar').style.display = 'none';
        document.getElementById('btn-exit-game').classList.remove('hidden');
        
        // Show Splash for Level 1
        splashText.innerText = `LEVEL ${currentLevel}`;
        splash.classList.remove('hidden');
        setTimeout(() => {
            splash.classList.add('active');
            SFX.playScan();
        }, 10);
        
        startGameMode();
        
        setTimeout(() => {
            splash.classList.remove('active');
            setTimeout(() => splash.classList.add('hidden'), 600);
        }, 1200);
    } else {
        alert("Level 1 not found! Please build it in Level Maker first.");
    }
});

btnLevelSelect.addEventListener('click', () => {
    SFX.playBlip();
    openLevelSelect();
});

btnLevelBack.addEventListener('click', () => {
    SFX.playBlip();
    levelSelectMenu.classList.add('hidden');
    mainMenu.classList.remove('hidden');
});

function openLevelSelect() {
    mainMenu.classList.add('hidden');
    levelSelectMenu.classList.remove('hidden');
    levelGrid.innerHTML = '';

    const highest = parseInt(localStorage.getItem('highest_unlocked_level')) || 1;

    for (let i = 1; i <= 8; i++) {
        const slot = document.createElement('div');
        slot.className = 'level-slot';
        slot.textContent = i;

        const hasData = localStorage.getItem(`level_${i}`) || (LEVELS && LEVELS[i]);

        if (!hasData) {
            slot.classList.add('missing');
        } else if (i > highest) {
            slot.classList.add('locked');
        } else {
            if (i === highest) slot.classList.add('active');
            slot.addEventListener('click', () => {
                currentLevel = i;
                if (loadLevel(currentLevel)) {
                    levelSelectMenu.classList.add('hidden');
                    editorUI.classList.remove('hidden');
                    document.querySelector('.sidebar').style.display = 'none';
                    document.getElementById('btn-exit-game').classList.remove('hidden');
                    startGameMode();
                }
            });
        }
        levelGrid.appendChild(slot);
    }
}

if (btnCreditsBack) {
    btnCreditsBack.addEventListener('click', () => {
        creditsMenu.classList.add('hidden');
        mainMenu.classList.remove('hidden');
        checkSaves();
    });
}

if (btnBuild) {
    btnBuild.addEventListener('click', () => {
        gameMode = 'editor';
        document.getElementById('game-viewport').classList.add('editor-mode');
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('editor-ui').classList.remove('hidden');
        createNewLevel();
    });
}


let mousePos = { x: 0, y: 0, clientX: 0, clientY: 0 };
let isInitialFocus = true;
const LIGHT_OCCLUDER_TYPES = new Set([
    'wall',
    'wall-wood',
    'wall-cement',
    'wall-straw',
    'door',
    'door-metal'
]);
const BULB_LIGHT_DIAMETER_TILES = 10;
const BULB_LIGHT_RADIUS_TILES = BULB_LIGHT_DIAMETER_TILES / 2;
const MOUSE_LIGHT_RADIUS_TILES = 2;
const LIGHT_SUBDIVISIONS = 2;
const LIGHT_SUBCELL_SIZE = GRID_SIZE / LIGHT_SUBDIVISIONS;
const BULB_LIGHT_RADIUS_SUBCELLS = BULB_LIGHT_RADIUS_TILES * LIGHT_SUBDIVISIONS;
const MOUSE_LIGHT_RADIUS_SUBCELLS = MOUSE_LIGHT_RADIUS_TILES * LIGHT_SUBDIVISIONS;

function getPieceGridPosition(piece) {
    return {
        x: Math.round((parseFloat(piece.style.left) || 0) / GRID_SIZE),
        y: Math.round((parseFloat(piece.style.top) || 0) / GRID_SIZE)
    };
}

function normalizeRotation(rotation) {
    let value = rotation % 360;
    if (value < 0) value += 360;
    return value;
}

function getMouseDirectionFromRotation(rotation) {
    return ROTATION_TO_MOUSE_DIRECTION[normalizeRotation(rotation)] || 'down';
}

let lastRotateTime = 0;
function rotatePiece(piece) {
    const now = Date.now();
    if (now - lastRotateTime < 250) return; // Prevent double-triggering
    lastRotateTime = now;

    SFX.playClick();
    let rotation = parseInt(piece.dataset.rotation) || 0;
    rotation += 90;
    piece.dataset.rotation = rotation;
    applyPieceTransform(piece);
    updateWires();

    // Remove tutorial hint if present (Level 1 only)
    if (currentLevel === 1) {
        document.getElementById('tutorial-hint')?.remove();
    }
}

function updateMouseNpcSprite(piece, direction = 'down', frame = 0, action = 'walk') {
    const sprite = piece.querySelector('.mouse-npc-sprite');
    if (!sprite) return;

    const rowMap = { up: 0, down: 1, left: 2, right: 3, munch: 4 };
    const row = action === 'munch' ? rowMap.munch : rowMap[direction] ?? rowMap.down;
    const clampedFrame = ((frame % 4) + 4) % 4;

    // Precise clipping for split sprites
    const fileNameMap = { up: 'mouse_up.png', down: 'mouse_down.png', left: 'mouse_left.png', right: 'mouse_right.png', munch: 'mouse_munch.png' };
    const actionKey = action === 'munch' ? 'munch' : direction;
    const fileName = fileNameMap[actionKey] ?? 'mouse_down.png';
    
    // Exact Width Map for laser-precision slicing
    const fileWidths = { up: 102, down: 107, left: 172, right: 173, munch: 134 };
    const totalWidth = fileWidths[actionKey] || 107;
    const frameWidth = totalWidth / 4;
    const posX = (clampedFrame % 4) * frameWidth;

    sprite.style.width = `${frameWidth}px`;
    sprite.style.height = `52px`; // Height is 52px in your files
    sprite.style.backgroundImage = `url('${fileName}')`;
    sprite.style.backgroundSize = "auto"; // Original pixels only
    sprite.style.backgroundPosition = `-${posX}px 0px`;
    sprite.style.backgroundRepeat = "no-repeat";
    
    // Center the clipped sprite within the 50px tile
    sprite.style.position = "absolute";
    sprite.style.left = `${(GRID_SIZE - frameWidth) / 2}px`;
    sprite.style.top = `${(GRID_SIZE - 52) / 2}px`;
    
    sprite.style.mixBlendMode = "normal";
    piece.dataset.npcDir = direction;
    piece.dataset.npcFrame = clampedFrame;
    piece.dataset.npcAction = action;
}

function applyPieceTransform(piece) {
    const rotation = normalizeRotation(parseInt(piece.dataset.rotation) || 0);
    const flip = parseInt(piece.dataset.flip) || 1;

    if (piece.dataset.type === MOUSE_NPC_TYPE) {
        piece.style.transform = '';
        updateMouseNpcSprite(
            piece,
            piece.dataset.npcDir || getMouseDirectionFromRotation(rotation),
            parseInt(piece.dataset.npcFrame) || 0,
            piece.dataset.npcAction || 'walk'
        );
        return;
    }

    piece.style.transform = `rotate(${parseInt(piece.dataset.rotation) || 0}deg) scaleX(${flip})`;
}



function shuffleArray(values) {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function initializeMouseNpcs(now = performance.now()) {
    mouseNpcStates = new WeakMap();

    Array.from(document.querySelectorAll(`.placed-pipe[data-type="${MOUSE_NPC_TYPE}"]`)).forEach(piece => {
        piece.style.transition = `left ${MOUSE_NPC_STEP_MS}ms linear, top ${MOUSE_NPC_STEP_MS}ms linear`;
        const direction = getMouseDirectionFromRotation(parseInt(piece.dataset.rotation) || 0);
        updateMouseNpcSprite(piece, direction, 0, 'munch');
        mouseNpcStates.set(piece, {
            direction,
            nextMoveAt: now + 250 + Math.random() * 500,
            movingUntil: now,
            lastFrameAt: now,
            frame: 0
        });
    });
}

function canMouseMove(piece, dir) {
    const directionVectors = {
        up: { dx: 0, dy: -1 },
        down: { dx: 0, dy: 1 },
        left: { dx: -1, dy: 0 },
        right: { dx: 1, dy: 0 }
    };
    const vector = directionVectors[dir];
    if (!vector) return false;

    const boardRect = board.getBoundingClientRect();
    const maxX = Math.max(0, Math.round(boardRect.width / GRID_SIZE) - 1);
    const maxY = Math.max(0, Math.round(boardRect.height / GRID_SIZE) - 1);
    
    const { x, y } = getPieceGridPosition(piece);
    const nextX = x + vector.dx;
    const nextY = y + vector.dy;

    if (nextX < 0 || nextY < 0 || nextX > maxX || nextY > maxY) return false;
    
    const blockerMap = getNpcBlockerMap(piece);
    if (blockerMap.has(`${nextX},${nextY}`)) return false;

    return true;
}

function getNpcBlockerMap(ignorePiece) {
    const blockers = new Set();
    Array.from(document.querySelectorAll('.placed-pipe')).forEach(piece => {
        if (piece === ignorePiece) return;
        if (piece.dataset.type === MOUSE_NPC_TYPE || NPC_BLOCKER_TYPES.has(piece.dataset.type)) {
            const { x, y } = getPieceGridPosition(piece);
            blockers.add(`${x},${y}`);
        }
    });
    return blockers;
}

function chooseMouseNpcDirection(piece, currentDirection, targetPos = null) {
    const boardRect = board.getBoundingClientRect();
    const maxX = Math.max(0, Math.round(boardRect.width / GRID_SIZE) - 1);
    const maxY = Math.max(0, Math.round(boardRect.height / GRID_SIZE) - 1);
    const directionVectors = {
        up: { name: 'up', dx: 0, dy: -1 },
        down: { name: 'down', dx: 0, dy: 1 },
        left: { name: 'left', dx: -1, dy: 0 },
        right: { name: 'right', dx: 1, dy: 0 }
    };

    let possible = [
        directionVectors.up,
        directionVectors.down,
        directionVectors.left,
        directionVectors.right
    ];

    // If we have a target, prioritize directions that get us closer
    const { x, y } = getPieceGridPosition(piece);
    if (targetPos) {
        possible.sort((a, b) => {
            const distA = Math.hypot((x + a.dx) - targetPos.x, (y + a.dy) - targetPos.y);
            const distB = Math.hypot((x + b.dx) - targetPos.x, (y + b.dy) - targetPos.y);
            return distA - distB;
        });
    } else {
        // Randomize if no target
        possible = [
            directionVectors[currentDirection] || directionVectors.down,
            ...shuffleArray(possible.filter(d => d.name !== currentDirection))
        ];
    }

    const blockerMap = getNpcBlockerMap(piece);

    for (const direction of possible) {
        const nextX = x + direction.dx;
        const nextY = y + direction.dy;
        if (nextX < 0 || nextY < 0 || nextX > maxX || nextY > maxY) continue;
        if (blockerMap.has(`${nextX},${nextY}`)) continue;

        return direction;
    }

    return null;
}


function updateMouseNpcs(timestamp) {
    if (gameMode !== 'play') return;

    const currentLevelData = LEVELS[currentLevel] || {};
    const maxInteractions = currentLevelData.mouseInteractions ?? 0;

    Array.from(document.querySelectorAll(`.placed-pipe[data-type="${MOUSE_NPC_TYPE}"]`)).forEach(piece => {
        if (piece.dataset.trapped === "true") return; // Skip if trapped
        
        let state = mouseNpcStates.get(piece);
        if (!state) {
            const direction = getMouseDirectionFromRotation(parseInt(piece.dataset.rotation) || 0);
            state = {
                direction,
                nextMoveAt: timestamp + 250 + Math.random() * 500,
                movingUntil: timestamp,
                lastFrameAt: timestamp,
                frame: 0,
                stepsRemaining: 0,
                interactionsLeft: maxInteractions || (currentLevel * 2), // Auto-scale interactions
                lastSabotageAt: 0
            };
            mouseNpcStates.set(piece, state);
        }

        const gridPos = getPieceGridPosition(piece);
        // Sabotage Frequency: Scaled by level as requested
        // Level 2: 1200ms, Level 3: 1000ms, Level 5: 300ms, Level 9+: 150ms
        // Sabotage Frequency: Manually tuned progression
        let sabotageCooldown = 2000; // Default fallback
        
        if (currentLevel === 1) sabotageCooldown = 999999; 
        else if (currentLevel === 2) sabotageCooldown = 4000;
        else if (currentLevel === 3) sabotageCooldown = 3500;
        else if (currentLevel === 4) sabotageCooldown = 3000;
        else if (currentLevel === 5) sabotageCooldown = 500;
        else if (currentLevel === 6) sabotageCooldown = 2000;
        else if (currentLevel === 7 || currentLevel === 8) sabotageCooldown = 1000;
        else if (currentLevel === 9) sabotageCooldown = 750;
        else if (currentLevel >= 10) sabotageCooldown = 500;

        // Sabotage Logic: Sniff out wires
        if (timestamp - (state.lastSabotageAt || 0) > sabotageCooldown) {
            // Check current tile AND adjacent tiles
            const neighbors = [
                { nx: gridPos.x, ny: gridPos.y },
                { nx: gridPos.x + 1, ny: gridPos.y },
                { nx: gridPos.x - 1, ny: gridPos.y },
                { nx: gridPos.x, ny: gridPos.y + 1 },
                { nx: gridPos.x, ny: gridPos.y - 1 }
            ];

            const allPipes = Array.from(document.querySelectorAll('.placed-pipe'));
            
            let foundWire = null;
            for (const n of neighbors) {
                const wire = allPipes.find(p => {
                    const pPos = getPieceGridPosition(p);
                    return pPos.x === n.nx && pPos.y === n.ny && PLAY_ROTATABLE_TYPES.includes(p.dataset.type);
                });
                if (wire) {
                    foundWire = wire;
                    break;
                }
            }

            if (foundWire) {
                let shouldSabotage = false;
                if (state.targetPiece) {
                    const tPos = getPieceGridPosition(state.targetPiece);
                    // If near target (within 3 tiles), sabotage!
                    const dist = Math.hypot(gridPos.x - tPos.x, gridPos.y - tPos.y);
                    if (dist <= 3) {
                        shouldSabotage = true;
                    }
                }

                if (shouldSabotage) {
                    SFX.playSqueak();
                    rotatePiece(foundWire);
                    state.lastSabotageAt = timestamp;
                    state.movingUntil = timestamp; // Stop to celebrate
                    state.nextMoveAt = timestamp + 1000; 
                    state.stepsRemaining = 0;
                    state.targetPiece = null; // Target reached and sabotaged
                    return;
                }
            }
        }

        if (timestamp >= state.nextMoveAt) {
            // Speed is now constant as requested
            const moveStepTime = MOUSE_NPC_STEP_MS;
            
            // Fluid Movement: Commit to a few steps
            if (state.stepsRemaining <= 0) {
                let targetPos = null;
                if (state.targetPiece && state.targetPiece.parentNode) {
                    targetPos = getPieceGridPosition(state.targetPiece);
                } else {
                    state.targetPiece = null;
                }

                const nextDirection = chooseMouseNpcDirection(piece, state.direction, targetPos);
                if (nextDirection) {
                    state.direction = nextDirection.name;
                    state.stepsRemaining = 2 + Math.floor(Math.random() * 5); // Walk 2-6 tiles
                } else {
                    // Idle/Munch if stuck
                    state.nextMoveAt = timestamp + 1000 + Math.random() * 2000;
                    return;
                }
            }

            const dirVec = {
                up: { dx: 0, dy: -1 },
                down: { dx: 0, dy: 1 },
                left: { dx: -1, dy: 0 },
                right: { dx: 1, dy: 0 }
            }[state.direction];

            if (canMouseMove(piece, state.direction)) {
                const { x, y } = getPieceGridPosition(piece);
                piece.style.left = `${(x + dirVec.dx) * GRID_SIZE}px`;
                piece.style.top = `${(y + dirVec.dy) * GRID_SIZE}px`;
                state.movingUntil = timestamp + moveStepTime;
                state.nextMoveAt = timestamp + moveStepTime;
                state.stepsRemaining--;
                piece.dataset.rotation = MOUSE_DIRECTION_TO_ROTATION[state.direction];
            } else {
                state.stepsRemaining = 0; // Hit something
                state.nextMoveAt = timestamp + 500;
            }
        }

        const isMoving = timestamp < state.movingUntil;
        const action = isMoving ? 'walk' : 'munch';
        if (timestamp - state.lastFrameAt >= MOUSE_NPC_FRAME_MS) {
            state.frame = (state.frame + 1) % 4;
            state.lastFrameAt = timestamp;
        }

        updateMouseNpcSprite(piece, state.direction, state.frame, action);
    });
}

function buildLightOccluderMap(pieces) {
    const occluders = new Set();

    pieces.forEach(piece => {
        if (!LIGHT_OCCLUDER_TYPES.has(piece.dataset.type)) return;

        const { x, y } = getPieceGridPosition(piece);
        for (let sx = 0; sx < LIGHT_SUBDIVISIONS; sx++) {
            for (let sy = 0; sy < LIGHT_SUBDIVISIONS; sy++) {
                occluders.add(`${x * LIGHT_SUBDIVISIONS + sx},${y * LIGHT_SUBDIVISIONS + sy}`);
            }
        }
    });

    return occluders;
}

function getSvgDefsRoot() {
    return document.querySelector('body > svg defs');
}

function hasLightLineOfSight(startX, startY, targetX, targetY, occluderMap, allowedTargetKey = null) {
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(deltaX), Math.abs(deltaY)) * 4));

    for (let step = 1; step < steps; step++) {
        const t = step / steps;
        const sampleX = startX + deltaX * t;
        const sampleY = startY + deltaY * t;
        const cellX = Math.floor(sampleX);
        const cellY = Math.floor(sampleY);

        const cellKey = `${cellX},${cellY}`;
        if (occluderMap.has(cellKey) && cellKey !== allowedTargetKey) {
            return false;
        }
    }

    return true;
}

function clearDynamicLightDefs() {
    const defsRoot = getSvgDefsRoot();
    if (!defsRoot) return;

    defsRoot.querySelectorAll('[data-dynamic-light="true"]').forEach(node => node.remove());
}

function buildLitSubcells(sourceSubX, sourceSubY, radiusSubcells, boardWidthSubcells, boardHeightSubcells, occluderMap) {
    const openCells = [];
    const surfaceCells = [];

    for (let gx = Math.max(0, Math.floor(sourceSubX - radiusSubcells - 1)); gx <= Math.min(boardWidthSubcells - 1, Math.ceil(sourceSubX + radiusSubcells)); gx++) {
        for (let gy = Math.max(0, Math.floor(sourceSubY - radiusSubcells - 1)); gy <= Math.min(boardHeightSubcells - 1, Math.ceil(sourceSubY + radiusSubcells)); gy++) {
            const distance = Math.hypot((gx + 0.5) - sourceSubX, (gy + 0.5) - sourceSubY);
            if (distance > radiusSubcells + 0.4) continue;
            const targetKey = `${gx},${gy}`;
            const isSurfaceCell = occluderMap.has(targetKey);
            if (!hasLightLineOfSight(sourceSubX, sourceSubY, gx + 0.5, gy + 0.5, occluderMap, isSurfaceCell ? targetKey : null)) continue;

            const cell = { x: gx, y: gy, distance };
            if (isSurfaceCell) {
                surfaceCells.push(cell);
            } else {
                openCells.push(cell);
            }
        }
    }

    return { openCells, surfaceCells };
}

function buildLightPathData(cells, rect, areaRect) {
    return cells.map(cell => {
        const x = Math.round(rect.left - areaRect.left + cell.x * LIGHT_SUBCELL_SIZE);
        const y = Math.round(rect.top - areaRect.top + cell.y * LIGHT_SUBCELL_SIZE);
        const size = Math.ceil(LIGHT_SUBCELL_SIZE);
        return `M ${x} ${y} H ${x + size} V ${y + size} H ${x} Z`;
    }).join(' ');
}

function appendQuantizedLightBands(targetGroup, cells, rect, areaRect, radiusSubcells, opacityScale, minOpacity, steps) {
    if (!cells.length) return;

    const bands = new Map();

    cells.forEach(cell => {
        const normalized = Math.min(cell.distance / (radiusSubcells + 0.65), 1);
        const rawOpacity = Math.max(minOpacity, (1 - normalized) * opacityScale);
        const quantizedOpacity = Math.max(minOpacity, Math.round(rawOpacity * steps) / steps);
        const key = quantizedOpacity.toFixed(3);

        if (!bands.has(key)) bands.set(key, []);
        bands.get(key).push(cell);
    });

    Array.from(bands.entries())
        .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
        .forEach(([opacity, bandCells]) => {
            const field = document.createElementNS("http://www.w3.org/2000/svg", "path");
            field.setAttribute('d', buildLightPathData(bandCells, rect, areaRect));
            field.setAttribute('fill', 'black');
            field.setAttribute('fill-opacity', opacity);
            field.setAttribute('shape-rendering', 'crispEdges');
            targetGroup.appendChild(field);
        });
}

window.addEventListener('mousemove', (e) => {
    const rect = board.getBoundingClientRect();
    const currX = e.clientX - rect.left;
    const currY = e.clientY - rect.top;

    if (isInitialFocus) {
        const entranceDoor = Array.from(document.querySelectorAll('.placed-pipe')).find(p => 
            p.dataset.type === 'door' || p.dataset.type === 'door-metal'
        );
        if (entranceDoor) {
            const doorX = parseFloat(entranceDoor.style.left) + GRID_SIZE / 2;
            const doorY = parseFloat(entranceDoor.style.top) - GRID_SIZE / 2; // Tile ABOVE the door
            const dist = Math.hypot(currX - doorX, currY - doorY);
            // Only release focus if mouse is within 2 tiles of that spot
            if (dist < GRID_SIZE * 2) {
                isInitialFocus = false;
            }
        }
    }

    mousePos.x = currX;
    mousePos.y = currY;
    mousePos.clientX = e.clientX;
    mousePos.clientY = e.clientY;
});

function gameLoop(timestamp) {
    if (gameMode !== 'play') return;

    const now = timestamp || performance.now();
    updateMouseNpcs(now);
    updateBulbLights();
    checkWinCondition();

    // Mouse Squeak Proximity Check
    const mice = document.querySelectorAll('.placed-pipe[data-type="mouse-npc"]');
    mice.forEach(mouse => {
        const state = mouseNpcStates.get(mouse);
        if (state) {
            const mx = parseFloat(mouse.style.left) + GRID_SIZE/2;
            const my = parseFloat(mouse.style.top) + GRID_SIZE/2;
            const dist = Math.hypot(mx - mousePos.x, my - mousePos.y);
            if (dist < 60) {
                if (!state.lastSqueakAt || now - state.lastSqueakAt > 2000) {
                    SFX.playSqueak();
                    state.lastSqueakAt = now;
                }
            }
        }
    });

    requestAnimationFrame(gameLoop);
}

function updateBulbLights() {
    if (gameMode !== 'play') return;
    const mouseHolesGroup = document.getElementById('mouse-holes');
    const bulbHolesGroup = document.getElementById('bulb-holes');
    const backlightHoles = document.getElementById('backlight-holes');
    const rect = board.getBoundingClientRect();
    const areaRect = gameArea.getBoundingClientRect();
    const pieces = Array.from(document.querySelectorAll('.placed-pipe'));
    const boardWidthTiles = Math.round(rect.width / LIGHT_SUBCELL_SIZE);
    const boardHeightTiles = Math.round(rect.height / LIGHT_SUBCELL_SIZE);

    clearDynamicLightDefs();

    const occluderMap = buildLightOccluderMap(pieces);

    if (mouseHolesGroup) {
        mouseHolesGroup.innerHTML = '';

        let focusX = mousePos.x;
        let focusY = mousePos.y;

        if (isInitialFocus) {
            const entranceDoor = document.querySelector('.placed-pipe[data-is-entrance="true"]');
            if (entranceDoor) {
                focusX = parseFloat(entranceDoor.style.left) + GRID_SIZE / 2;
                focusY = parseFloat(entranceDoor.style.top) - GRID_SIZE / 2; // Tile ABOVE the door
            }
        }

        const snappedMouseX = Math.floor(focusX / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
        const snappedMouseY = Math.floor(focusY / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
        const mouseCenterX = rect.left - areaRect.left + snappedMouseX;
        const mouseCenterY = rect.top - areaRect.top + snappedMouseY;
        const mouseSubX = Math.floor(snappedMouseX / LIGHT_SUBCELL_SIZE);
        const mouseSubY = Math.floor(snappedMouseY / LIGHT_SUBCELL_SIZE);
        const mouseLight = buildLitSubcells(
            mouseSubX,
            mouseSubY,
            MOUSE_LIGHT_RADIUS_SUBCELLS,
            boardWidthTiles,
            boardHeightTiles,
            occluderMap
        );

        appendQuantizedLightBands(mouseHolesGroup, mouseLight.surfaceCells, rect, areaRect, MOUSE_LIGHT_RADIUS_SUBCELLS, 0.18, 0.08, 10);
        appendQuantizedLightBands(mouseHolesGroup, mouseLight.openCells, rect, areaRect, MOUSE_LIGHT_RADIUS_SUBCELLS, 0.9, 0.16, 8);

        const mouseGlow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        mouseGlow.setAttribute('cx', mouseCenterX);
        mouseGlow.setAttribute('cy', mouseCenterY);
        mouseGlow.setAttribute('r', GRID_SIZE * 0.7);
        mouseGlow.setAttribute('fill', 'black');
        mouseGlow.setAttribute('fill-opacity', '0.55');
        mouseHolesGroup.appendChild(mouseGlow);

        // --- NEW: Exit Door Spotlight ---
        const exitDoor = document.querySelector('.placed-pipe[data-unlocked="true"]');
        if (exitDoor) {
            const exitX = parseFloat(exitDoor.style.left) + GRID_SIZE / 2;
            const exitY = parseFloat(exitDoor.style.top) + GRID_SIZE * 1.5; // Tile BELOW the top door
            
            const snappedExitX = Math.floor(exitX / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
            const snappedExitY = Math.floor(exitY / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
            const exitCenterX = rect.left - areaRect.left + snappedExitX;
            const exitCenterY = rect.top - areaRect.top + snappedExitY;
            const exitSubX = Math.floor(snappedExitX / LIGHT_SUBCELL_SIZE);
            const exitSubY = Math.floor(snappedExitY / LIGHT_SUBCELL_SIZE);
            
            const exitLight = buildLitSubcells(
                exitSubX,
                exitSubY,
                MOUSE_LIGHT_RADIUS_SUBCELLS,
                boardWidthTiles,
                boardHeightTiles,
                occluderMap
            );

            appendQuantizedLightBands(mouseHolesGroup, exitLight.surfaceCells, rect, areaRect, MOUSE_LIGHT_RADIUS_SUBCELLS, 0.18, 0.08, 10);
            appendQuantizedLightBands(mouseHolesGroup, exitLight.openCells, rect, areaRect, MOUSE_LIGHT_RADIUS_SUBCELLS, 0.9, 0.16, 8);

            const exitGlow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            exitGlow.setAttribute('cx', exitCenterX);
            exitGlow.setAttribute('cy', exitCenterY);
            exitGlow.setAttribute('r', GRID_SIZE * 0.7);
            exitGlow.setAttribute('fill', 'black');
            exitGlow.setAttribute('fill-opacity', '0.55');
            mouseHolesGroup.appendChild(exitGlow);
        }
    }

    if (bulbHolesGroup) {
        bulbHolesGroup.innerHTML = '';
        const litBulbs = pieces.filter(p => p.dataset.type === 'bulb' || p.dataset.type === 'inline-bulb');

        litBulbs.forEach(bulb => {
            if (!bulb.classList.contains('lit')) return;

            const bx = parseFloat(bulb.style.left) + GRID_SIZE / 2;
            const by = parseFloat(bulb.style.top) + GRID_SIZE / 2;
            const { x: bgx, y: bgy } = getPieceGridPosition(bulb);
            const bulbSubX = bgx * LIGHT_SUBDIVISIONS + LIGHT_SUBDIVISIONS / 2;
            const bulbSubY = bgy * LIGHT_SUBDIVISIONS + LIGHT_SUBDIVISIONS / 2;

            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            const bulbLight = buildLitSubcells(
                bulbSubX,
                bulbSubY,
                BULB_LIGHT_RADIUS_SUBCELLS,
                boardWidthTiles,
                boardHeightTiles,
                occluderMap
            );

            appendQuantizedLightBands(group, bulbLight.surfaceCells, rect, areaRect, BULB_LIGHT_RADIUS_SUBCELLS, 0.24, 0.1, 10);
            appendQuantizedLightBands(group, bulbLight.openCells, rect, areaRect, BULB_LIGHT_RADIUS_SUBCELLS, 1, 0.18, 8);

            const sourceGlow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            sourceGlow.setAttribute('cx', rect.left - areaRect.left + bx);
            sourceGlow.setAttribute('cy', rect.top - areaRect.top + by);
            sourceGlow.setAttribute('r', GRID_SIZE * 0.6);
            sourceGlow.setAttribute('fill', 'black');
            sourceGlow.setAttribute('fill-opacity', '1');
            group.appendChild(sourceGlow);

            bulbHolesGroup.appendChild(group);
        });
    }

    if (backlightHoles) {
        backlightHoles.innerHTML = '';
        pieces.forEach(p => {
            const gx = Math.round(parseFloat(p.style.left) / GRID_SIZE);
            const gy = Math.round(parseFloat(p.style.top) / GRID_SIZE);

            // Restore: perimeter only backlight for the room boundaries
            if (gx === 0 || gx === 24 || gy === 0 || gy === 13) {
                const rect_bl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                rect_bl.setAttribute('x', rect.left - areaRect.left + gx * GRID_SIZE);
                rect_bl.setAttribute('y', rect.top - areaRect.top + gy * GRID_SIZE);
                rect_bl.setAttribute('width', GRID_SIZE);
                rect_bl.setAttribute('height', GRID_SIZE);
                rect_bl.setAttribute('fill', 'black');
                rect_bl.setAttribute('opacity', '0.08'); // Brighter as requested
                backlightHoles.appendChild(rect_bl);
            }
        });
    }
}


checkWinCondition();
requestAnimationFrame(gameLoop);


function checkWinCondition() {
    const doors = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => p.dataset.type === 'door' || p.dataset.type === 'door-metal');
    if (doors.length === 0) return;

    // Top door is the one with the smallest Y
    doors.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
    const exitDoor = doors[0];

    if (exitDoor && exitDoor.dataset.unlocked === "true") {
        const dx = Math.abs(mousePos.x - (parseFloat(exitDoor.style.left) + GRID_SIZE / 2));
        const dy = Math.abs(mousePos.y - (parseFloat(exitDoor.style.top) + GRID_SIZE / 2));

        if (dx < GRID_SIZE && dy < GRID_SIZE) {
            winLevel();
        }
    }
}

function winLevel() {
    gameMode = 'editor'; // Pause loop
    
    // Check if next level exists BEFORE showing splash
    if (!LEVELS[currentLevel + 1]) {
        runEndGameSequence();
        return;
    }

    // Step 1: Show Splash
    splash.classList.remove('hidden');
    setTimeout(() => {
        splash.classList.add('active');
    }, 10);

    // Step 2: Prepare next level behind the scenes
    setTimeout(() => {
        const highest = parseInt(localStorage.getItem('highest_unlocked_level')) || 1;
        if (currentLevel >= highest) {
            localStorage.setItem('highest_unlocked_level', currentLevel + 1);
        }

        currentLevel++;
        if (loadLevel(currentLevel)) {
            splashText.innerText = `LEVEL ${currentLevel}`;
            SFX.playScan();
            startGameMode();
            
            // Step 3: Hold the splash for dramatic effect then hide
            setTimeout(() => {
                splash.classList.remove('active');
                setTimeout(() => {
                    splash.classList.add('hidden');
                }, 600);
            }, 1200);
        } else {
            // No more levels: Run cinematic end sequence
            runEndGameSequence();
        }
    }, 600);
}

function runEndGameSequence() {
    // Hide UI elements
    document.getElementById('btn-exit-game').classList.add('hidden');
    if (editorUI) editorUI.classList.add('hidden');
    
    // Clear the board for the final fade
    board.innerHTML = '';
    board.style.background = '#000';

    // Show Credits Overlay
    creditsMenu.classList.remove('hidden');
    if (splash) {
        splash.classList.remove('active');
        splash.classList.add('hidden');
    }

    const winAnn = document.getElementById('win-announcement');
    const scroll = document.getElementById('credits-scroll');

    // Sequence 1: Win Announcement (5 seconds)
    winAnn.classList.remove('hidden');
    scroll.classList.add('hidden');

    setTimeout(() => {
        // Sequence 2: Fade to black and Roll Credits
        winAnn.classList.add('hidden');
        scroll.classList.remove('hidden');
    }, 5000);
}

// --- Drag & Drop Editor Logic ---

paletteItems.forEach(item => {
    item.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click

        // Create a new piece
        const clone = item.cloneNode(true);
        clone.className = 'placed-pipe';
        clone.dataset.rotation = 0;
        clone.dataset.flip = 1;
        applyPieceTransform(clone);

        if (item.dataset.flippable) {
            clone.dataset.flippable = 'true';
        }

        clone.removeAttribute('draggable');

        board.appendChild(clone);

        // Start dragging immediately
        startDragging(clone, e);
    });
});

board.addEventListener('mousedown', (e) => {
    // In play mode, NO DRAGGING allowed. Only editor mode allows movement.
    if (gameMode === 'play') return;

    const target = e.target.closest('.placed-pipe');
    if (target) {
        startDragging(target, e);
    } else {
        // Deselect if clicking empty space
        if (selectedPiece) {
            selectedPiece.classList.remove('selected');
            selectedPiece = null;
        }
    }
});

function startDragging(piece, e) {
    if (e.button !== 0) return;

    isDragging = true;
    draggedPiece = piece;

    if (selectedPiece && selectedPiece !== piece) {
        selectedPiece.classList.remove('selected');
    }

    selectedPiece = piece;
    piece.classList.add('selected');
    piece.classList.add('dragging');

    offsetX = GRID_SIZE / 2;
    offsetY = GRID_SIZE / 2;

    movePiece(e.clientX, e.clientY);
}

window.addEventListener('mousemove', (e) => {
    if (gameMode === 'play') {
        const rect = board.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (isInitialFocus) {
            const entranceDoor = document.querySelector('.placed-pipe[data-is-entrance="true"]');
            if (entranceDoor) {
                const dx = parseFloat(entranceDoor.style.left) + GRID_SIZE / 2;
                const dy = parseFloat(entranceDoor.style.top) - GRID_SIZE / 2;
                const dist = Math.hypot(mx - dx, my - dy);
                if (dist < 80) isInitialFocus = false; // Larger radius for reliability
            } else {
                isInitialFocus = false;
            }
        }

        // Reliable Hint Removal for Level 2 & 3
        if (!isInitialFocus) {
            const hint = document.getElementById('tutorial-hint');
            if (hint && (currentLevel === 2 || currentLevel === 3 || hint.innerText.includes('mouse'))) {
                hint.remove();
            }
        }

        mousePos.x = mx;
        mousePos.y = my;

        // Update held box position
        if (heldBoxEl) {
            heldBoxEl.style.left = `${e.clientX - 25}px`;
            heldBoxEl.style.top = `${e.clientY - 25}px`;
        }
    }
    if (isDragging && draggedPiece) {
        movePiece(e.clientX, e.clientY);
    }
});

window.addEventListener('mouseup', (e) => {
    if (isDragging && draggedPiece) {
        isDragging = false;
        draggedPiece.classList.remove('dragging');

        // Snap to grid on drop
        snapToGrid(draggedPiece);

        draggedPiece = null;
    }
});

function movePiece(clientX, clientY) {
    const boardRect = board.getBoundingClientRect();
    const editorMode = document.getElementById('game-viewport').classList.contains('editor-mode');
    const scale = editorMode ? 0.74 : 1;
    
    const x = Math.round(((clientX - boardRect.left) / scale - offsetX) / GRID_SIZE) * GRID_SIZE;
    const y = Math.round(((clientY - boardRect.top) / scale - offsetY) / GRID_SIZE) * GRID_SIZE;
    
    draggedPiece.style.left = `${x}px`;
    draggedPiece.style.top = `${y}px`;
}

function snapToGrid(piece) {
    const boardRect = board.getBoundingClientRect();

    let x = parseFloat(piece.style.left) || 0;
    let y = parseFloat(piece.style.top) || 0;

    const snapX = Math.round(x / GRID_SIZE) * GRID_SIZE;
    const snapY = Math.round(y / GRID_SIZE) * GRID_SIZE;

    // Delete if dropped outside the visible board
    if (
        snapX < -GRID_SIZE / 2 ||
        snapY < -GRID_SIZE / 2 ||
        snapX > 1250 - GRID_SIZE / 2 ||
        snapY > 700 - GRID_SIZE / 2
    ) {
        piece.remove();
        if (selectedPiece === piece) selectedPiece = null;
        updateWires();
        return;
    }

    piece.style.left = `${snapX}px`;
    piece.style.top = `${snapY}px`;
    updateWires();
}

// Keyboard controls
window.addEventListener('keydown', (e) => {
    if (gameMode === 'play') {
        if (e.key === ' ' || ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
            e.preventDefault(); // Prevent page scrolling
        }

        if (e.key === ' ') {
            // Pick up/Drop logic removed for play mode as per request
            // Interaction is now only Rotation (R) and Switches (E)
        }

        if (e.key === 'r' || e.key === 'R') {
            const pieces = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => PLAY_ROTATABLE_TYPES.includes(p.dataset.type));

            let closest = null;
            let minDist = Infinity;
            pieces.forEach(p => {
                let px = parseFloat(p.style.left) + GRID_SIZE / 2;
                let py = parseFloat(p.style.top) + GRID_SIZE / 2;
                let dist = Math.hypot(px - mousePos.x, py - mousePos.y);
                if (dist < 40 && dist < minDist) {
                    minDist = dist;
                    closest = p;
                }
            });

            if (closest) {
                rotatePiece(closest);
            }
        }

        if (e.key === 'e' || e.key === 'E') {
            // Interact with switch
            const switches = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => p.dataset.type === 'switch');
            switches.forEach(p => {
                let px = parseFloat(p.style.left) + GRID_SIZE / 2;
                let py = parseFloat(p.style.top) + GRID_SIZE / 2;
                if (Math.hypot(px - mousePos.x, py - mousePos.y) < 40) {
                    SFX.playClick();
                    toggleSwitch(p);
                }
            });
        }
        return;
    }

    if ((e.key === 'r' || e.key === 'R') && gameMode === 'editor') {
        const target = draggedPiece || selectedPiece;
        if (target) {
            if (target.dataset.flippable === 'true') {
                SFX.playClick();
                let flip = parseInt(target.dataset.flip) || 1;
                flip = flip === 1 ? -1 : 1;
                target.dataset.flip = flip;
                applyPieceTransform(target);
                updateWires();
            } else {
                rotatePiece(target);
            }
        }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPiece && !isDragging) {
            selectedPiece.remove();
            selectedPiece = null;
            updateWires();
        }
    }
});

// Double click to delete
board.addEventListener('dblclick', (e) => {
    if (gameMode === 'play') return;
    const target = e.target.closest('.placed-pipe');
    if (target) {
        target.remove();
        if (selectedPiece === target) selectedPiece = null;
        if (draggedPiece === target) {
            isDragging = false;
            draggedPiece = null;
        }
        updateWires();
    }
});

board.addEventListener('click', (e) => {
    const target = e.target.closest('.placed-pipe');
    if (!target) return;
    if (!target && !heldBoxEl) return;

    if (gameMode === 'play') {
        if (target && PLAY_ROTATABLE_TYPES.includes(target.dataset.type)) {
            rotatePiece(target);
        } else if (target && target.dataset.type === 'switch') {
            SFX.playClick();
            toggleSwitch(target);
        } else if (target && target.dataset.type === 'box' && !heldBoxEl) {
            // Pick up box
            heldBox = target;
            target.style.visibility = 'hidden';
            heldBoxEl = document.createElement('div');
            heldBoxEl.className = 'box-held';
            heldBoxEl.style.left = `${e.clientX - 25}px`;
            heldBoxEl.style.top = `${e.clientY - 25}px`;
            document.body.appendChild(heldBoxEl);
            SFX.playClick();
        } else if (heldBoxEl) {
            // We are holding a box, try to trap a mouse
            const mice = Array.from(document.querySelectorAll(`.placed-pipe[data-type="${MOUSE_NPC_TYPE}"]`));
            const rect = board.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            
            const targetMouse = mice.find(m => {
                const mX = parseFloat(m.style.left) + GRID_SIZE / 2;
                const mY = parseFloat(m.style.top) + GRID_SIZE / 2;
                return Math.hypot(mX - mx, mY - my) < 40;
            });

            if (targetMouse) {
                trapMouse(targetMouse);
                // Remove held box visual
                heldBoxEl.remove();
                heldBoxEl = null;
                heldBox.remove();
                heldBox = null;
            } else {
                // Drop box back
                const dropX = Math.round((mx - GRID_SIZE/2) / GRID_SIZE) * GRID_SIZE;
                const dropY = Math.round((my - GRID_SIZE/2) / GRID_SIZE) * GRID_SIZE;
                heldBox.style.left = `${dropX}px`;
                heldBox.style.top = `${dropY}px`;
                heldBox.style.visibility = 'visible';
                heldBoxEl.remove();
                heldBoxEl = null;
                heldBox = null;
                SFX.playClick();
            }
        }
    } else if (gameMode === 'editor') {
        if (target.dataset.type === 'switch') {
            SFX.playClick();
            toggleSwitch(target);
        }
    }
});

function trapMouse(mouse) {
    const x = mouse.style.left;
    const y = mouse.style.top;
    
    // Hide mouse
    mouse.style.visibility = 'hidden';
    mouse.dataset.trapped = "true";
    
    // Create trapped box visual
    const trappedBox = document.createElement('div');
    trappedBox.className = 'trapped-box';
    trappedBox.style.left = x;
    trappedBox.style.top = y;
    board.appendChild(trappedBox);
    
    SFX.playSqueak();
    
    // Trap for 10 seconds
    setTimeout(() => {
        trappedBox.remove();
        mouse.style.visibility = 'visible';
        delete mouse.dataset.trapped;
        
        // Re-create the box piece at this location so it can be used again
        const newBox = document.createElement('div');
        newBox.className = 'placed-pipe';
        newBox.dataset.type = 'box';
        newBox.style.left = x;
        newBox.style.top = y;
        
        // Create the box image inside
        const img = document.createElement('img');
        img.src = 'box.png';
        img.style.width = '40px';
        img.style.height = '40px';
        img.style.imageRendering = 'pixelated';
        img.style.pointerEvents = 'none';
        img.style.marginTop = '5px';
        img.style.marginLeft = '5px';
        newBox.appendChild(img);
        
        board.appendChild(newBox);
        
        // Escaping effect: move mouse randomly
        const state = mouseNpcStates.get(mouse);
        if (state) state.nextMoveAt = 0; // Move immediately
        SFX.playSqueak();
    }, 10000);
}

// --- Autotiling Wires Logic ---
function updateWires() {
    const pieces = Array.from(document.querySelectorAll('.placed-pipe'));

    const grid = {};
    pieces.forEach(p => {
        let x = parseFloat(p.style.left);
        let y = parseFloat(p.style.top);
        if (isNaN(x) || isNaN(y)) return;
        // Force -0 to 0 to prevent string key mismatches
        let gridX = Math.round(x / GRID_SIZE) + 0;
        let gridY = Math.round(y / GRID_SIZE) + 0;
        grid[`${gridX},${gridY}`] = p;
    });

    pieces.forEach(p => {
        const portData = getGlobalPorts(p);
        const gridX = Math.round(parseFloat(p.style.left) / GRID_SIZE) + 0;
        const gridY = Math.round(parseFloat(p.style.top) / GRID_SIZE) + 0;

        portData.forEach(port => {
            const angle = port.angle;
            const el = port.el;

            let nx = gridX;
            let ny = gridY;
            if (angle === 0) ny -= 1;
            else if (angle === 90) nx += 1;
            else if (angle === 180) ny += 1;
            else if (angle === 270) nx -= 1;

            const neighbor = grid[`${nx},${ny}`];
            if (neighbor) {
                const neighborPorts = getGlobalPorts(neighbor).map(pd => pd.angle);
                const oppositeAngle = normalizeRotation(angle + 180);
                if (neighborPorts.includes(oppositeAngle)) {
                    el.style.opacity = '0';
                    el.style.visibility = 'hidden';
                } else {
                    el.style.opacity = '1';
                    el.style.visibility = 'visible';
                }
            } else {
                el.style.opacity = '1';
                el.style.visibility = 'visible';
            }

        });
    });

    updateCircuit();
}

// --- Circuit Logic ---

function getGlobalPorts(piece) {
    const rotation = normalizeRotation(parseInt(piece.dataset.rotation) || 0);
    const flip = parseInt(piece.dataset.flip) || 1;
    const exposedElements = piece.querySelectorAll('.exposed');
    const portData = [];

    exposedElements.forEach(el => {
        const baseDir = el.getAttribute('data-dir');
        if (!baseDir) return;

        const dirAngles = { 'top': 0, 'right': 90, 'bottom': 180, 'left': 270 };
        let angle = dirAngles[baseDir];

        if (flip === -1) {
            if (angle === 90) angle = 270;
            else if (angle === 270) angle = 90;
        }

        angle = normalizeRotation(angle + rotation);
        portData.push({ angle, el });
    });
    return portData;
}

function updateCircuit() {
    const pieces = Array.from(document.querySelectorAll('.placed-pipe'));

    pieces.forEach(p => {
        if (p.dataset.type === 'bulb' || p.dataset.type === 'inline-bulb') {
            const wasLit = p.classList.contains('lit');
            p.classList.remove('lit');
            p.dataset.wasLit = wasLit; // Track for sound
        }
        if (p.dataset.type === 'wall-socket') {
            const light = p.querySelector('.socket-light');
            if (light) light.setAttribute('fill', '#d63031');
        }
    });

    const grid = {};
    pieces.forEach(p => {
        let x = parseFloat(p.style.left) || 0;
        let y = parseFloat(p.style.top) || 0;
        let gridX = Math.round(x / GRID_SIZE) + 0;
        let gridY = Math.round(y / GRID_SIZE) + 0;
        grid[`${gridX},${gridY}`] = { piece: p, ports: getGlobalPorts(p) };
    });

    const batteries = pieces.filter(p => p.dataset.type === 'battery');

    // User logic: Bottom wall socket is always a power source
    const sockets = pieces.filter(p => p.dataset.type === 'wall-socket');
    let bottomSocket = null;
    let topSocket = null;

    if (sockets.length > 0) {
        sockets.sort((a, b) => parseFloat(b.style.top) - parseFloat(a.style.top));
        bottomSocket = sockets[0];
        if (sockets.length > 1) {
            topSocket = sockets[sockets.length - 1]; // Smallest Y
        }
    }

    const powered = new Set();
    const queue = [];

    batteries.forEach(b => {
        powered.add(b);
        queue.push(b);
    });

    if (bottomSocket) {
        powered.add(bottomSocket);
        queue.push(bottomSocket);
    }

    while (queue.length > 0) {
        const curr = queue.shift();

        if (curr.dataset.type === 'switch' && curr.dataset.state === 'off') {
            continue;
        }

        let x = parseFloat(curr.style.left) || 0;
        let y = parseFloat(curr.style.top) || 0;
        let gridX = Math.round(x / GRID_SIZE);
        let gridY = Math.round(y / GRID_SIZE);

        const cell = grid[`${gridX},${gridY}`];
        if (!cell) continue;

        cell.ports.forEach(portObj => {
            const angle = portObj.angle;
            let nx = gridX;
            let ny = gridY;
            if (angle === 0) ny -= 1;
            else if (angle === 90) nx += 1;
            else if (angle === 180) ny += 1;
            else if (angle === 270) nx -= 1;

            const neighborCell = grid[`${nx},${ny}`];
            if (neighborCell) {
                const oppositeAngle = normalizeRotation(angle + 180);
                const neighborPorts = neighborCell.ports.map(pd => pd.angle);
                if (neighborPorts.includes(oppositeAngle)) {
                    if (!powered.has(neighborCell.piece)) {
                        powered.add(neighborCell.piece);
                        queue.push(neighborCell.piece);
                    }
                }
            }
        });
    }

    powered.forEach(p => {
        if (p.dataset.type === 'bulb' || p.dataset.type === 'inline-bulb') {
            p.classList.add('lit');
        }
        if (p.dataset.type === 'wall-socket') {
            const light = p.querySelector('.socket-light');
            if (light) light.setAttribute('fill', '#00b894');
        }
    });

    if (gameMode === 'play') {
        updateExitDoorStatus(topSocket && powered.has(topSocket));
    }

    // Handle bulb sounds and state
    pieces.forEach(p => {
        if (p.dataset.type === 'bulb' || p.dataset.type === 'inline-bulb') {
            const isLit = p.classList.contains('lit');
            const wasLit = p.dataset.wasLit === 'true';

            if (isLit && !wasLit) {
                SFX.playTone(120, 'sawtooth', 0.15, 0.04); // Hum On
            } else if (!isLit && wasLit) {
                SFX.playTone(100, 'sawtooth', 0.1, 0.02); // Hum Off
            }

            if (isLit) {
                // --- Targeted Sabotage Assignment ---
                // Continuously find nearest idle mouse for this lit bulb
                const mice = Array.from(document.querySelectorAll(`.placed-pipe[data-type="${MOUSE_NPC_TYPE}"]`));
                const bPos = getPieceGridPosition(p);
                
                let bestMouse = null;
                let minDist = Infinity;
                
                mice.forEach(m => {
                    const mState = mouseNpcStates.get(m);
                    if (!mState || mState.targetPiece || m.dataset.trapped === "true") return;
                    
                    const mPos = getPieceGridPosition(m);
                    const dist = Math.hypot(mPos.x - bPos.x, mPos.y - bPos.y);
                    if (dist < minDist) {
                        minDist = dist;
                        bestMouse = m;
                    }
                });
                
                if (bestMouse) {
                    const state = mouseNpcStates.get(bestMouse);
                    state.targetPiece = p;
                    state.stepsRemaining = 0; // Force redirection
                }
            } else if (!isLit && wasLit) {
                SFX.playTone(100, 'sawtooth', 0.1, 0.02); // Hum Off
                
                // Clear any mice targeting this bulb
                const mice = Array.from(document.querySelectorAll(`.placed-pipe[data-type="${MOUSE_NPC_TYPE}"]`));
                mice.forEach(m => {
                    const mState = mouseNpcStates.get(m);
                    if (mState && mState.targetPiece === p) {
                        mState.targetPiece = null;
                    }
                });
            }
        }
    });

    // NEW: Update bulb light mask after circuit state changes
    if (gameMode === 'play') {
        updateBulbLights();
    }
}

function updateExitDoorStatus(isPowered) {
    const doors = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => p.dataset.type === 'door' || p.dataset.type === 'door-metal');
    if (doors.length === 0) return;

    // Top door is the one with the smallest Y
    doors.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
    const topDoor = doors[0];

    if (!topDoor) return;

    if (isPowered) {
        if (!topDoor.classList.contains('door-unlocking')) {
            topDoor.classList.remove('door-locking');
            topDoor.classList.add('door-unlocking');
            topDoor.dataset.unlocked = "true";
        }
    } else {
        if (topDoor.classList.contains('door-unlocking')) {
            topDoor.classList.remove('door-unlocking');
            topDoor.classList.add('door-locking');
            topDoor.dataset.unlocked = "false";
        }
    }
}

// Switch toggle click handler
function toggleSwitch(target) {
    const state = target.dataset.state === 'on' ? 'off' : 'on';
    target.dataset.state = state;

    const bg = target.querySelector('.switch-bg');
    const lever = target.querySelector('.switch-lever');

    if (state === 'on') {
        bg.setAttribute('fill', '#00b894');
        lever.setAttribute('y', '25');
    } else {
        bg.setAttribute('fill', '#d63031');
        lever.setAttribute('y', '50');
    }

    updateWires();
}
