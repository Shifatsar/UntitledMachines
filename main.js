import { LEVELS } from './levels.js';
const board = document.getElementById('board-inner');
const gameArea = document.getElementById('game-area');
const paletteItems = document.querySelectorAll('.pipe-item');
const GRID_SIZE = 50; // Updated grid size

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

// UI Elements (continued)
const creditsMenu = document.getElementById('credits-menu');
const btnCreditsBack = document.getElementById('btn-credits-back');

// Main Menu Logic
document.getElementById('btn-build').addEventListener('click', () => {
    document.getElementById('main-menu').classList.remove('active');
    document.getElementById('editor-ui').classList.remove('hidden');
    document.querySelector('.sidebar').style.display = 'block';
    gameMode = 'editor';
    checkSaves(); // Ensure dropdown is populated
});

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
        for (let i = 1; i <= 10; i++) {
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
        const allLevels = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('level_')) {
                const lvl = key.replace('level_', '');
                allLevels[lvl] = JSON.parse(localStorage.getItem(key));
            }
        }
        const json = JSON.stringify(allLevels, null, 4);
        navigator.clipboard.writeText(json).then(() => {
            alert("All browser levels copied as JSON! Paste this into levels.js to save them permanently.");
        });
    });
}

// Initial check
checkSaves();

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

let player = { x: 100, y: 100, el: null, heldItem: null, facing: 1, direction: 'down' };
const keys = {};

window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

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
        
        clone.style.transform = `rotate(${item.rotation || 0}deg) scaleX(${item.flip || 1})`;
        
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
    
    updateWires();
    return true;
}

function startGameMode() {
    gameMode = 'play';
    document.getElementById('board-inner').classList.remove('show-grid');
    
    // Find bottom door for spawn
    const doors = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => p.dataset.type === 'door' || p.dataset.type === 'door-metal');
    let entranceDoor = null;
    if (doors.length > 0) {
        doors.sort((a, b) => parseFloat(b.style.top) - parseFloat(a.style.top));
        entranceDoor = doors[0];
    }

    player.x = entranceDoor ? parseFloat(entranceDoor.style.left) : 100;
    player.y = entranceDoor ? parseFloat(entranceDoor.style.top) : 100;
    
    player.el = document.createElement('div');
    player.el.id = 'player';
    player.el.style.width = `${GRID_SIZE}px`;
    player.el.style.height = `${GRID_SIZE}px`;
    player.el.style.position = 'absolute';
    player.el.style.left = `${player.x}px`;
    player.el.style.top = `${player.y}px`;
    player.el.style.backgroundImage = `url('assets/soldier_idle.png')`;
    player.el.style.backgroundSize = 'contain';
    player.el.style.backgroundRepeat = 'no-repeat';
    player.el.style.backgroundPosition = 'center';
    player.el.style.zIndex = '200';
    player.el.style.pointerEvents = 'none';
    board.appendChild(player.el);
    
    if (entranceDoor) {
        entranceDoor.dataset.isEntrance = "true";
        // Remove any other objects at the same spot
        const ex = parseFloat(entranceDoor.style.left);
        const ey = parseFloat(entranceDoor.style.top);
        Array.from(document.querySelectorAll('.placed-pipe')).forEach(p => {
            if (p !== entranceDoor && 
                Math.abs(parseFloat(p.style.left) - ex) < 5 && 
                Math.abs(parseFloat(p.style.top) - ey) < 5) {
                p.remove();
            }
        });

        entranceDoor.classList.add('door-opening');

        // Auto-move player up one square after a small delay
        setTimeout(() => {
            player.y -= GRID_SIZE;
            player.el.style.top = `${player.y}px`;
            player.direction = 'up';
            player.el.style.backgroundImage = `url('assets/soldier_back.png')`;
        }, 500);

        setTimeout(() => {
            entranceDoor.classList.remove('door-opening');
            entranceDoor.classList.add('door-closing');
            setTimeout(() => {
                entranceDoor.classList.remove('door-closing');
            }, 600);
        }, 1000);
    }
    
    // Also cleanup the exit door spot
    const exitDoor = doors.find(d => d !== entranceDoor);
    if (exitDoor) {
        const ex = parseFloat(exitDoor.style.left);
        const ey = parseFloat(exitDoor.style.top);
        Array.from(document.querySelectorAll('.placed-pipe')).forEach(p => {
            if (p !== exitDoor && 
                Math.abs(parseFloat(p.style.left) - ex) < 5 && 
                Math.abs(parseFloat(p.style.top) - ey) < 5) {
                p.remove();
            }
        });
    }
    
    requestAnimationFrame(gameLoop);
}

document.getElementById('btn-exit-game').addEventListener('click', () => {
    gameMode = 'editor';
    board.innerHTML = '';
    if (player.el) player.el.remove();
    player.heldItem = null;
    
    document.getElementById('btn-exit-game').classList.add('hidden');
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
    currentLevel = 1;
    if (loadLevel(currentLevel)) {
        mainMenu.classList.add('hidden');
        editorUI.classList.remove('hidden');
        document.querySelector('.sidebar').style.display = 'none';
        document.getElementById('btn-exit-game').classList.remove('hidden');
        startGameMode();
    } else {
        alert("Level 1 not found! Please build it in Level Maker first.");
    }
});

btnLevelSelect.addEventListener('click', () => {
    openLevelSelect();
});

btnLevelBack.addEventListener('click', () => {
    levelSelectMenu.classList.add('hidden');
    mainMenu.classList.remove('hidden');
});

function openLevelSelect() {
    mainMenu.classList.add('hidden');
    levelSelectMenu.classList.remove('hidden');
    levelGrid.innerHTML = '';
    
    const highest = parseInt(localStorage.getItem('highest_unlocked_level')) || 1;
    
    for (let i = 1; i <= 10; i++) {
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

function checkCollision(newX, newY) {
    const pieces = Array.from(document.querySelectorAll('.placed-pipe'));
    // Electrical stuff (except cables) blocks movement too
    const colliders = ['wall', 'wall-wood', 'wall-cement', 'wall-straw', 'rock', 'pot', 'door', 'door-metal'];
    
    // Extremely small collision box (10x10) to ensure player never gets stuck in doorways
    const pRect = { left: newX + 20, right: newX + 30, top: newY + 20, bottom: newY + 30 };
    
    for (let p of pieces) {
        if (p === player.heldItem) continue; // Do not collide with the item you are holding!
        if (colliders.includes(p.dataset.type)) {
            // Ignore door that is unlocking/opening/closing
            if (p.dataset.unlocked === "true" || 
                p.classList.contains('door-opening') || 
                p.classList.contains('door-unlocking') ||
                p.classList.contains('door-closing')) continue;

            let px = parseFloat(p.style.left) || 0;
            let py = parseFloat(p.style.top) || 0;
            let pWidth = (parseInt(p.dataset.width) || 1) * GRID_SIZE;
            let pHeight = (parseInt(p.dataset.height) || 1) * GRID_SIZE;
            let pR = { left: px, right: px + pWidth, top: py, bottom: py + pHeight };
            
            if (pRect.left < pR.right && pRect.right > pR.left && pRect.top < pR.bottom && pRect.bottom > pR.top) {
                return true;
            }
        }
    }
    return false;
}

function gameLoop() {
    if (gameMode !== 'play') return;
    
    const speed = 4;
    let dx = 0, dy = 0;
    
    if (keys['w'] || keys['arrowup']) dy -= speed;
    if (keys['s'] || keys['arrowdown']) dy += speed;
    if (keys['a'] || keys['arrowleft']) dx -= speed;
    if (keys['d'] || keys['arrowright']) dx += speed;
    
    if (dx !== 0 || dy !== 0) {
        if (!checkCollision(player.x + dx, player.y)) player.x += dx;
        if (!checkCollision(player.x, player.y + dy)) player.y += dy;
        
        if (dx < 0) { player.facing = -1; player.direction = 'left'; }
        else if (dx > 0) { player.facing = 1; player.direction = 'right'; }
        else if (dy < 0) { player.direction = 'up'; }
        else if (dy > 0) { player.direction = 'down'; }
        
        const time = Date.now();
        const walkFrame = Math.floor(time / 150) % 2 === 0 ? '1' : '2';
        
        if (player.direction === 'up') {
            player.el.style.backgroundImage = `url('assets/soldier_climb${walkFrame}.png')`;
            player.el.style.transform = `scaleX(1)`; // reset flip for back view
        } else {
            player.el.style.backgroundImage = `url('assets/soldier_walk${walkFrame}.png')`;
            player.el.style.transform = `scaleX(${player.facing})`;
        }
    } else {
        if (player.direction === 'up') {
            player.el.style.backgroundImage = `url('assets/soldier_back.png')`;
            player.el.style.transform = `scaleX(1)`;
        } else {
            player.el.style.backgroundImage = `url('assets/soldier_idle.png')`;
            player.el.style.transform = `scaleX(${player.facing})`;
        }
    }
    
    player.el.style.left = `${player.x}px`;
    player.el.style.top = `${player.y}px`;
    
    if (player.heldItem) {
        player.heldItem.style.left = `${player.x}px`;
        player.heldItem.style.top = `${player.y - 20}px`;
    }

    // Check for level completion
    checkWinCondition();
    
    requestAnimationFrame(gameLoop);
}

function checkWinCondition() {
    const doors = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => p.dataset.type === 'door' || p.dataset.type === 'door-metal');
    if (doors.length === 0) return;
    
    // Top door is the one with the smallest Y
    doors.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
    const exitDoor = doors[0];
    
    if (exitDoor && exitDoor.dataset.unlocked === "true") {
        const dx = Math.abs((player.x + 25) - (parseFloat(exitDoor.style.left) + 25));
        const dy = Math.abs((player.y + 25) - (parseFloat(exitDoor.style.top) + 25));
        
        if (dx < 20 && dy < 20) {
            winLevel();
        }
    }
}

function winLevel() {
    gameMode = 'editor'; // Pause loop
    if (player.el) player.el.remove();
    player.heldItem = null;
    
    // Unlock next level
    const highest = parseInt(localStorage.getItem('highest_unlocked_level')) || 1;
    if (currentLevel >= highest) {
        localStorage.setItem('highest_unlocked_level', currentLevel + 1);
    }

    currentLevel++;
    if (loadLevel(currentLevel)) {
        startGameMode();
    } else {
        // No more levels
        document.getElementById('btn-exit-game').classList.add('hidden');
        editorUI.classList.add('hidden');
        creditsMenu.classList.remove('hidden');
    }
}

// --- Drag & Drop Editor Logic ---

paletteItems.forEach(item => {
    item.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click
        
        // Create a new piece
        const clone = item.cloneNode(true);
        clone.className = 'placed-pipe';
        clone.style.transform = `rotate(0deg) scaleX(1)`;
        clone.dataset.rotation = 0;
        clone.dataset.flip = 1;
        
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
    if (gameMode === 'play') return; // Disable mouse dragging in play mode
    
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
    
    let x = clientX - boardRect.left - offsetX;
    let y = clientY - boardRect.top - offsetY;
    
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
        snapX < -GRID_SIZE/2 || 
        snapY < -GRID_SIZE/2 || 
        snapX > boardRect.width - GRID_SIZE/2 || 
        snapY > boardRect.height - GRID_SIZE/2
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
            if (player.heldItem) {
                // Drop
                const snapX = Math.round(player.x / GRID_SIZE) * GRID_SIZE;
                const snapY = Math.round(player.y / GRID_SIZE) * GRID_SIZE;
                player.heldItem.style.left = `${snapX}px`;
                player.heldItem.style.top = `${snapY}px`;
                player.heldItem.style.zIndex = 'auto';
                player.heldItem = null;
                updateWires();
            } else {
                // Pick up
                const electricalTypes = ['straight', 'curve', 'tshape', 'cross', 'battery', 'bulb', 'inline-bulb', 'switch', 'wall-socket'];
                const pieces = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => electricalTypes.includes(p.dataset.type));
                
                let closest = null;
                let minDist = Infinity;
                pieces.forEach(p => {
                    let px = parseFloat(p.style.left) + 20;
                    let py = parseFloat(p.style.top) + 20;
                    let dist = Math.hypot(px - (player.x + 20), py - (player.y + 20));
                    if (dist < 40 && dist < minDist) {
                        minDist = dist;
                        closest = p;
                    }
                });
                
                if (closest) {
                    player.heldItem = closest;
                    closest.style.zIndex = '300';
                    updateWires();
                }
            }
        }
        
        if (e.key === 'r' || e.key === 'R') {
            if (player.heldItem) {
                let rotation = parseInt(player.heldItem.dataset.rotation) || 0;
                rotation = (rotation + 90) % 360;
                player.heldItem.dataset.rotation = rotation;
                let flip = parseInt(player.heldItem.dataset.flip) || 1;
                player.heldItem.style.transform = `rotate(${rotation}deg) scaleX(${flip})`;
                updateWires();
            } else {
                // Rotate nearby item
                const electricalTypes = ['straight', 'curve', 'tshape', 'cross', 'battery', 'bulb', 'inline-bulb', 'switch', 'wall-socket'];
                const pieces = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => electricalTypes.includes(p.dataset.type));
                
                let closest = null;
                let minDist = Infinity;
                pieces.forEach(p => {
                    let px = parseFloat(p.style.left) + 20;
                    let py = parseFloat(p.style.top) + 20;
                    let dist = Math.hypot(px - (player.x + 20), py - (player.y + 20));
                    if (dist < 40 && dist < minDist) {
                        minDist = dist;
                        closest = p;
                    }
                });
                
                if (closest) {
                    let rotation = parseInt(closest.dataset.rotation) || 0;
                    rotation = (rotation + 90) % 360;
                    closest.dataset.rotation = rotation;
                    let flip = parseInt(closest.dataset.flip) || 1;
                    closest.style.transform = `rotate(${rotation}deg) scaleX(${flip})`;
                    updateWires();
                }
            }
        }
        
        if (e.key === 'e' || e.key === 'E') {
            // Interact with switch
            const switches = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => p.dataset.type === 'switch');
            switches.forEach(p => {
                let px = parseFloat(p.style.left) + 20;
                let py = parseFloat(p.style.top) + 20;
                if (Math.hypot(px - (player.x + 20), py - (player.y + 20)) < 40) {
                    toggleSwitch(p);
                }
            });
        }
        return;
    }

    if (e.key === 'r' || e.key === 'R') {
        const target = draggedPiece || selectedPiece;
        if (target) {
            if (target.dataset.flippable === 'true') {
                let flip = parseInt(target.dataset.flip) || 1;
                flip = flip === 1 ? -1 : 1;
                target.dataset.flip = flip;
                let rotation = parseInt(target.dataset.rotation) || 0;
                target.style.transform = `rotate(${rotation}deg) scaleX(${flip})`;
            } else {
                let rotation = parseInt(target.dataset.rotation) || 0;
                rotation = (rotation + 90) % 360;
                target.dataset.rotation = rotation;
                let flip = parseInt(target.dataset.flip) || 1;
                target.style.transform = `rotate(${rotation}deg) scaleX(${flip})`;
            }
            updateWires();
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

// --- Autotiling Wires Logic ---
function updateWires() {
    const pieces = Array.from(document.querySelectorAll('.placed-pipe'));
    
    const grid = {};
    pieces.forEach(p => {
        let x = parseFloat(p.style.left) || 0;
        let y = parseFloat(p.style.top) || 0;
        let gridX = Math.round(x / GRID_SIZE);
        let gridY = Math.round(y / GRID_SIZE);
        grid[`${gridX},${gridY}`] = p;
    });

    pieces.forEach(p => {
        let x = parseFloat(p.style.left) || 0;
        let y = parseFloat(p.style.top) || 0;
        let gridX = Math.round(x / GRID_SIZE);
        let gridY = Math.round(y / GRID_SIZE);
        
        const rotation = parseInt(p.dataset.rotation) || 0;
        const flip = parseInt(p.dataset.flip) || 1;
        
        const exposedElements = p.querySelectorAll('.exposed');
        
        exposedElements.forEach(el => {
            const baseDir = el.getAttribute('data-dir');
            if (!baseDir) return;
            
            const dirAngles = { 'top': 0, 'right': 90, 'bottom': 180, 'left': 270 };
            let angle = dirAngles[baseDir];
            
            if (flip === -1) {
                if (angle === 90) angle = 270;
                else if (angle === 270) angle = 90;
            }
            
            angle = (angle + rotation) % 360;
            if (angle < 0) angle += 360;
            
            let nx = gridX;
            let ny = gridY;
            if (angle === 0) ny -= 1;
            else if (angle === 90) nx += 1;
            else if (angle === 180) ny += 1;
            else if (angle === 270) nx -= 1;
            
            const neighbor = grid[`${nx},${ny}`];
            if (neighbor) {
                el.style.opacity = '0';
                el.style.visibility = 'hidden';
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
    const rotation = parseInt(piece.dataset.rotation) || 0;
    const flip = parseInt(piece.dataset.flip) || 1;
    const exposedElements = piece.querySelectorAll('.exposed');
    const ports = [];
    
    exposedElements.forEach(el => {
        const baseDir = el.getAttribute('data-dir');
        if (!baseDir) return;
        
        const dirAngles = { 'top': 0, 'right': 90, 'bottom': 180, 'left': 270 };
        let angle = dirAngles[baseDir];
        
        if (flip === -1) {
            if (angle === 90) angle = 270;
            else if (angle === 270) angle = 90;
        }
        
        angle = (angle + rotation) % 360;
        if (angle < 0) angle += 360;
        
        ports.push(angle);
    });
    return ports;
}

function updateCircuit() {
    const pieces = Array.from(document.querySelectorAll('.placed-pipe'));
    
    pieces.forEach(p => {
        if (p.dataset.type === 'bulb' || p.dataset.type === 'inline-bulb') {
            p.classList.remove('lit');
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
        let gridX = Math.round(x / GRID_SIZE);
        let gridY = Math.round(y / GRID_SIZE);
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
    
    while(queue.length > 0) {
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
        
        cell.ports.forEach(angle => {
            let nx = gridX;
            let ny = gridY;
            if (angle === 0) ny -= 1;
            else if (angle === 90) nx += 1;
            else if (angle === 180) ny += 1;
            else if (angle === 270) nx -= 1;
            
            const neighborCell = grid[`${nx},${ny}`];
            if (neighborCell) {
                const oppositeAngle = (angle + 180) % 360;
                if (neighborCell.ports.includes(oppositeAngle)) {
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

    // Check if exit door should unlock
    if (gameMode === 'play' && topSocket && powered.has(topSocket)) {
        unlockExitDoor();
    }
}

function unlockExitDoor() {
    const doors = Array.from(document.querySelectorAll('.placed-pipe')).filter(p => p.dataset.type === 'door' || p.dataset.type === 'door-metal');
    if (doors.length === 0) return;
    
    // Top door is the one with the smallest Y
    doors.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
    const topDoor = doors[0];
    
    if (topDoor && !topDoor.classList.contains('door-unlocking')) {
        topDoor.classList.add('door-unlocking');
        // Optional: remove after animation? No, just keep it non-collidable
        topDoor.dataset.unlocked = "true";
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
    
    updateCircuit();
}

board.addEventListener('click', (e) => {
    if (gameMode === 'play') return;
    const target = e.target.closest('.placed-pipe');
    if (target && target.dataset.type === 'switch') {
        toggleSwitch(target);
    }
});
