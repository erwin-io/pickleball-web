import * as THREE from 'three';
import { HumanLikePickleballAI } from './aiOpponent.js';
import './style.css';

const app = document.querySelector('#app');

const PLAYER = {
  fixedY: 1.16,
  stamina: 0.86,
  lastSwingPower: 0,
  serveReadyMinSwing: 5.25,
  serveMinForwardDistance: 0.34
};

const COURT = {
  width: 7.2,
  length: 17.2,
  halfLength: 8.6,

  playerServeZ: 7.45,
  playerForwardMinZ: 2.55,
  playerBackMaxZ: 9.45,

  aiPaddleZ: -7.05,
  aiForwardMaxZ: -2.45,
  aiBackMinZ: -9.45,

  netZ: 0,
  netHeight: 0.9,

  sideOutMargin: 0.52,
  backOutMargin: 1.45,
  emergencyOutMargin: 2.8
};

const BALL = {
  radius: 0.16,
  gravity: -7.45,
  bounce: 0.66,
  drag: 0.9965,
  airSpinDrag: 0.01,
  floorFriction: 0.9,
  minY: 0.16,
  resetCooldown: 0,
  hitCooldown: 0
};

const GAME_RULES = {
  winningScore: 11,
  winBy: 2
};

const CAMERA = {
  baseX: 0,
  baseY: 11,
  baseZ: 15,

  // Lower values = less camera follow and less dizziness.
  paddleXInfluence: 0.045,
  paddleZInfluence: 0.16,

  positionSmooth: 0.012,
  lookSmooth: 0.018,

  lookBaseX: 0,
  lookBaseY: 0.95,
  lookBaseZ: 2.2,

  lookPaddleXInfluence: 0.025,
  lookPaddleZInfluence: -0.18
};

const DIFFICULTIES = {
  easy: {
    label: 'Easy',
    description: 'Best for testing. AI is slower, reacts late, and makes more mistakes.',
    ai: {
      baseReaction: 0.34,
      baseMaxSpeed: 2.35,
      sprintSpeed: 3.6,
      acceleration: 6.8,
      deceleration: 6.2,
      skill: 0.34,
      stamina: 0.5,
      mistakeMultiplier: 4.2,
      shotPowerMultiplier: 0.72,
      netMistakeChance: 0.14,
      outMistakeChance: 0.14
    }
  },
  normal: {
    label: 'Normal',
    description: 'Balanced. Still easier than the original strong AI.',
    ai: {
      baseReaction: 0.23,
      baseMaxSpeed: 3.9,
      sprintSpeed: 5.35,
      acceleration: 9.2,
      deceleration: 8.5,
      skill: 0.58,
      stamina: 0.65,
      mistakeMultiplier: 2.25,
      shotPowerMultiplier: 0.84,
      netMistakeChance: 0.095,
      outMistakeChance: 0.095
    }
  },
  hard: {
    label: 'Hard',
    description: 'Original strong AI behavior.',
    ai: {
      baseReaction: 0.11,
      baseMaxSpeed: 6.8,
      sprintSpeed: 9.2,
      acceleration: 16.5,
      deceleration: 14.5,
      skill: 0.84,
      stamina: 0.84,
      mistakeMultiplier: 1.0,
      shotPowerMultiplier: 1.0,
      netMistakeChance: 0.04,
      outMistakeChance: 0.04
    }
  }
};

const STORAGE_KEY = 'pickleball_3d_game_stats_v1';
const POINT_OVERLAY_AUTO_HIDE_MS = 1000;

const stats = loadStats();

let selectedDifficulty = 'easy';

const homeScreen = document.createElement('div');
homeScreen.className = 'home-screen';
homeScreen.innerHTML = `
  <div class="home-card">
    <div class="eyebrow">3D Pickleball Game</div>
    <h1>Paddle Panic</h1>
    <p class="home-subtitle">
      First to 11 points, win by 2. Only the server scores. Win a rally while receiving to get the serve.
    </p>

    <div class="difficulty-title">Choose difficulty</div>
    <div class="difficulty-grid">
      <button class="difficulty-btn active" data-difficulty="easy">
        <strong>Easy</strong>
        <span>2–4x easier AI</span>
      </button>
      <button class="difficulty-btn" data-difficulty="normal">
        <strong>Normal</strong>
        <span>1x easier AI</span>
      </button>
      <button class="difficulty-btn" data-difficulty="hard">
        <strong>Hard</strong>
        <span>Previous strong AI</span>
      </button>
    </div>

    <div class="difficulty-description" id="difficultyDescription">
      ${DIFFICULTIES.easy.description}
    </div>

    <button id="startGameBtn" class="start-btn">Start Game</button>

    <div class="stats-panel">
      <div>
        <span>Games</span>
        <strong id="statGames">${stats.gamesPlayed}</strong>
      </div>
      <div>
        <span>Your Wins</span>
        <strong id="statPlayerWins">${stats.playerWins}</strong>
      </div>
      <div>
        <span>AI Wins</span>
        <strong id="statAiWins">${stats.aiWins}</strong>
      </div>
      <div>
        <span>Best Score</span>
        <strong id="statBestScore">${stats.bestPlayerScore}</strong>
      </div>
    </div>

    <div class="controls-help">
      <strong>Controls:</strong> drag to move paddle, click/tap court to quickly reposition, swing forward to serve/hit.
    </div>
  </div>
`;
document.body.appendChild(homeScreen);

const gameHud = document.createElement('div');
gameHud.className = 'game-hud hidden';
gameHud.innerHTML = `
  <div class="score-box player">
    <span>You</span>
    <strong id="playerScore">0</strong>
  </div>
  <div class="center-hud">
    <div id="serverText">Server: You</div>
    <div id="difficultyText">Easy</div>
    <button id="quitGameBtn">Quit</button>
  </div>
  <div class="score-box opponent">
    <span>Opponent</span>
    <strong id="aiScore">0</strong>
  </div>
`;
document.body.appendChild(gameHud);

const pointOverlay = document.createElement('div');
pointOverlay.className = 'point-overlay';
pointOverlay.innerHTML = '';
document.body.appendChild(pointOverlay);

pointOverlay.addEventListener('pointerdown', (event) => {
  if (event.target.closest('[data-point-overlay-close]')) {
    event.preventDefault();
    hidePointOverlay();
  }
}, { passive: false });

pointOverlay.addEventListener('click', (event) => {
  if (event.target.closest('[data-point-overlay-close]')) {
    event.preventDefault();
    hidePointOverlay();
  }
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071225);
scene.fog = new THREE.Fog(0x071225, 24, 62);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  120
);

camera.position.set(CAMERA.baseX, CAMERA.baseY, CAMERA.baseZ);
camera.lookAt(CAMERA.lookBaseX, CAMERA.lookBaseY, CAMERA.lookBaseZ);

const cameraLookTarget = new THREE.Vector3(
  CAMERA.lookBaseX,
  CAMERA.lookBaseY,
  CAMERA.lookBaseZ
);

const desiredCameraPosition = new THREE.Vector3();
const desiredCameraLookTarget = new THREE.Vector3();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.style.cursor = 'crosshair';
renderer.domElement.classList.add('game-canvas');
app.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const paddleTargetPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLAYER.fixedY);

const input = {
  dragging: false,
  lastX: 0,
  lastY: 0,

  pointerDownX: 0,
  pointerDownY: 0,
  pointerDownTime: 0,
  totalPointerMove: 0,

  clickMoveBoostTimer: 0,

  desiredPaddle: new THREE.Vector3(0, PLAYER.fixedY, COURT.playerServeZ)
};

const game = {
  state: 'home',
  server: 'player',
  serveTimer: 0,

  deadBallTimer: 0,
  pendingServer: null,

  serveForwardCharge: 0,
  serveLockTimer: 0,

  playerScore: 0,
  aiScore: 0,

  lastPlayerPaddlePos: new THREE.Vector3(),
  lastAiPaddlePos: new THREE.Vector3(),
  previousBallPosition: new THREE.Vector3(),

  playerPaddleVelocity: new THREE.Vector3(),
  aiPaddleVelocity: new THREE.Vector3(),

  lastHitOwner: null,
  rallyHits: 0,
  time: 0,
  difficulty: 'easy'
};

const audio = createGameAudio();

setupLights();
scene.add(createCourt());

const dustSystem = createDustSystem();
scene.add(dustSystem.points);

const playerPaddle = createPaddle({
  faceColor: 0x38bdf8,
  sideColor: 0x0f3b82,
  handleColor: 0x171717,
  gripColor: 0x8b5a2b,
  z: COURT.playerServeZ,
  name: 'Player Paddle'
});

const aiPaddle = createPaddle({
  faceColor: 0xff4f70,
  sideColor: 0x7f1235,
  handleColor: 0x171717,
  gripColor: 0x8b5a2b,
  z: COURT.aiPaddleZ,
  name: 'AI Paddle'
});

scene.add(playerPaddle, aiPaddle);

const ball = createBall();
scene.add(ball.mesh);

const aiOpponent = new HumanLikePickleballAI(DIFFICULTIES.easy.ai);

bindHomeUI();
bindInput();
enterHomeState();
animate();

function bindHomeUI() {
  document.querySelectorAll('.difficulty-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDifficulty = btn.dataset.difficulty;

      document.querySelectorAll('.difficulty-btn').forEach((b) => {
        b.classList.remove('active');
      });

      btn.classList.add('active');

      document.querySelector('#difficultyDescription').textContent =
        DIFFICULTIES[selectedDifficulty].description;
    });
  });

  document.querySelector('#startGameBtn').addEventListener('click', () => {
    audio.resume();
    startNewGame(selectedDifficulty);
  });

  document.querySelector('#quitGameBtn').addEventListener('click', () => {
    endGameEarly();
  });
}

function startNewGame(difficulty) {
  game.state = 'starting';
  game.difficulty = difficulty;

  aiOpponent.configure(DIFFICULTIES[difficulty].ai);

  game.playerScore = 0;
  game.aiScore = 0;
  game.server = 'player';
  game.pendingServer = null;
  game.deadBallTimer = 0;
  game.lastHitOwner = null;
  game.rallyHits = 0;

  PLAYER.stamina = 0.9;
  PLAYER.lastSwingPower = 0;

  pointOverlay.classList.remove('show');

  homeScreen.classList.add('hidden');
  gameHud.classList.remove('hidden');
  renderer.domElement.classList.remove('hidden');

  document.querySelector('#difficultyText').textContent =
    DIFFICULTIES[difficulty].label;

  updateHud();
  enterServeState('player');

  camera.position.set(CAMERA.baseX, CAMERA.baseY, CAMERA.baseZ);
  cameraLookTarget.set(CAMERA.lookBaseX, CAMERA.lookBaseY, CAMERA.lookBaseZ);
  camera.lookAt(cameraLookTarget);

  window.setTimeout(() => {
    showPointOverlay('neutral', 'Game Start', 'Your serve first. Drag forward hard to serve.', false);
  }, 100);
}

function enterHomeState() {
  game.state = 'home';

  ball.position.set(0, -99, 0);
  ball.velocity.set(0, 0, 0);

  homeScreen.classList.remove('hidden');
  gameHud.classList.add('hidden');
  renderer.domElement.classList.add('hidden');
  pointOverlay.classList.remove('show');

  refreshStatsUI();
}

function endGameEarly() {
  showPointOverlay('neutral', 'Game Quit', 'Back to home', false);

  window.setTimeout(() => {
    enterHomeState();
  }, 700);
}

function finishGame(winner) {
  game.state = 'gameOver';

  const playerWon = winner === 'player';

  stats.gamesPlayed += 1;

  if (playerWon) {
    stats.playerWins += 1;
  } else {
    stats.aiWins += 1;
  }

  stats.bestPlayerScore = Math.max(stats.bestPlayerScore, game.playerScore);

  stats.lastGames.unshift({
    winner,
    difficulty: game.difficulty,
    playerScore: game.playerScore,
    aiScore: game.aiScore,
    date: new Date().toISOString()
  });

  stats.lastGames = stats.lastGames.slice(0, 10);

  saveStats(stats);

  showPointOverlay(
    winner,
    playerWon ? 'YOU WIN THE GAME!' : 'OPPONENT WINS THE GAME',
    `Final Score: You ${game.playerScore} — ${game.aiScore} Opponent`,
    true
  );

  window.setTimeout(() => {
    enterHomeState();
  }, 3200);
}

function isGameOver() {
  const high = Math.max(game.playerScore, game.aiScore);
  const diff = Math.abs(game.playerScore - game.aiScore);

  return high >= GAME_RULES.winningScore && diff >= GAME_RULES.winBy;
}

function getGameWinner() {
  if (!isGameOver()) return null;
  return game.playerScore > game.aiScore ? 'player' : 'ai';
}

function setupLights() {
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x1d2430, 1.4);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-5, 12, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -14;
  key.shadow.camera.right = 14;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  scene.add(key);

  const rim = new THREE.PointLight(0x4aa3ff, 18, 28);
  rim.position.set(0, 3, -10);
  scene.add(rim);
}

function createCourt() {
  const group = new THREE.Group();

  const floorGeo = new THREE.BoxGeometry(COURT.width, 0.08, COURT.length);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1e8f71,
    roughness: 0.78
  });

  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  floor.position.y = -0.04;
  group.add(floor);

  const kitchenGeo = new THREE.BoxGeometry(COURT.width, 0.085, 2.25);
  const kitchenMat = new THREE.MeshStandardMaterial({
    color: 0x2778b8,
    roughness: 0.78
  });

  const playerKitchen = new THREE.Mesh(kitchenGeo, kitchenMat);
  playerKitchen.position.set(0, 0.01, 1.125);
  playerKitchen.receiveShadow = true;
  group.add(playerKitchen);

  const aiKitchen = new THREE.Mesh(kitchenGeo, kitchenMat);
  aiKitchen.position.set(0, 0.011, -1.125);
  aiKitchen.receiveShadow = true;
  group.add(aiKitchen);

  addLine(group, 0, 0.04, 0, COURT.width, 0.045);
  addLine(group, 0, 0.045, COURT.halfLength, COURT.width, 0.06);
  addLine(group, 0, 0.045, -COURT.halfLength, COURT.width, 0.06);
  addLine(group, -COURT.width / 2, 0.045, 0, 0.06, COURT.length);
  addLine(group, COURT.width / 2, 0.045, 0, 0.06, COURT.length);
  addLine(group, 0, 0.045, 2.25, COURT.width, 0.05);
  addLine(group, 0, 0.045, -2.25, COURT.width, 0.05);
  addLine(group, 0, 0.046, 5.35, 0.05, 5.9);
  addLine(group, 0, 0.046, -5.35, 0.05, 5.9);

  const netPostMat = new THREE.MeshStandardMaterial({
    color: 0xf0f4ff,
    roughness: 0.4
  });

  const postGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.15, 16);

  const leftPost = new THREE.Mesh(postGeo, netPostMat);
  leftPost.position.set(-COURT.width / 2 - 0.1, 0.55, 0);
  leftPost.castShadow = true;
  group.add(leftPost);

  const rightPost = leftPost.clone();
  rightPost.position.x = COURT.width / 2 + 0.1;
  group.add(rightPost);

  const netGeo = new THREE.BoxGeometry(COURT.width + 0.1, COURT.netHeight, 0.035);
  const netMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.42,
    roughness: 0.25
  });

  const net = new THREE.Mesh(netGeo, netMat);
  net.position.set(0, COURT.netHeight / 2, COURT.netZ);
  net.castShadow = true;
  group.add(net);

  const railGeo = new THREE.BoxGeometry(COURT.width + 0.25, 0.045, 0.045);
  const rail = new THREE.Mesh(railGeo, netPostMat);
  rail.position.set(0, COURT.netHeight + 0.03, 0);
  rail.castShadow = true;
  group.add(rail);

  return group;
}

function addLine(group, x, y, z, width, depth) {
  const lineGeo = new THREE.BoxGeometry(width, 0.018, depth);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35
  });

  const line = new THREE.Mesh(lineGeo, lineMat);
  line.position.set(x, y, z);
  line.receiveShadow = true;
  group.add(line);
}

function createPaddle({ faceColor, sideColor, handleColor, gripColor, z, name }) {
  const group = new THREE.Group();
  group.name = name;

  const headShape = createRealPickleballPaddleShape();

  const outlineGeo = new THREE.ExtrudeGeometry(headShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.026,
    bevelSize: 0.034,
    bevelSegments: 8,
    curveSegments: 32
  });

  outlineGeo.center();

  const faceGeo = new THREE.ExtrudeGeometry(headShape, {
    depth: 0.105,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.022,
    bevelSegments: 6,
    curveSegments: 32
  });

  faceGeo.center();

  const outlineMat = new THREE.MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.58,
    metalness: 0.02
  });

  const sideMat = new THREE.MeshStandardMaterial({
    color: sideColor,
    roughness: 0.52,
    metalness: 0.04
  });

  const faceMat = new THREE.MeshStandardMaterial({
    color: faceColor,
    roughness: 0.46,
    metalness: 0.04
  });

  const outline = new THREE.Mesh(outlineGeo, outlineMat);
  outline.scale.set(1.065, 1.065, 1);
  outline.position.z = -0.03;
  outline.castShadow = true;
  outline.receiveShadow = true;
  group.add(outline);

  const sideLayer = new THREE.Mesh(faceGeo.clone(), sideMat);
  sideLayer.scale.set(1.02, 1.02, 1);
  sideLayer.position.z = 0.005;
  sideLayer.castShadow = true;
  sideLayer.receiveShadow = true;
  group.add(sideLayer);

  const face = new THREE.Mesh(faceGeo, faceMat);
  face.scale.set(0.94, 0.94, 1);
  face.position.z = 0.052;
  face.castShadow = true;
  face.receiveShadow = true;
  group.add(face);

  const neckGeo = new THREE.BoxGeometry(0.34, 0.17, 0.18);
  const neckMat = new THREE.MeshStandardMaterial({
    color: gripColor,
    roughness: 0.72,
    metalness: 0.02
  });

  const neck = new THREE.Mesh(neckGeo, neckMat);
  neck.position.set(0, -0.83, 0.01);
  neck.castShadow = true;
  neck.receiveShadow = true;
  group.add(neck);

  const handleMat = new THREE.MeshStandardMaterial({
    color: handleColor,
    roughness: 0.82,
    metalness: 0.04
  });

  const handleGeo = new THREE.CapsuleGeometry(0.105, 0.72, 10, 22);
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0, -1.25, 0);
  handle.castShadow = true;
  handle.receiveShadow = true;
  group.add(handle);

  const gripBandMat = new THREE.MeshStandardMaterial({
    color: gripColor,
    roughness: 0.78,
    metalness: 0.02
  });

  for (let i = 0; i < 4; i++) {
    const bandGeo = new THREE.BoxGeometry(0.25, 0.038, 0.16);
    const band = new THREE.Mesh(bandGeo, gripBandMat);
    band.position.set(0, -1.01 - i * 0.135, 0.085);
    band.rotation.z = THREE.MathUtils.degToRad(-7);
    band.castShadow = true;
    group.add(band);
  }

  const buttGeo = new THREE.CapsuleGeometry(0.13, 0.18, 10, 20);
  const butt = new THREE.Mesh(buttGeo, handleMat);
  butt.position.set(0, -1.65, 0);
  butt.rotation.z = Math.PI / 2;
  butt.castShadow = true;
  butt.receiveShadow = true;
  group.add(butt);

  group.scale.set(0.52, 0.52, 0.52);
  group.position.set(0, PLAYER.fixedY, z);
  group.userData.swingKick = 0;
  group.userData.hitShake = 0;

  return group;
}

function createRealPickleballPaddleShape() {
  const s = new THREE.Shape();

  s.moveTo(-0.18, -0.78);
  s.bezierCurveTo(-0.28, -0.68, -0.43, -0.58, -0.58, -0.5);
  s.bezierCurveTo(-0.76, -0.4, -0.86, -0.22, -0.87, 0.02);
  s.lineTo(-0.87, 0.46);
  s.bezierCurveTo(-0.87, 0.78, -0.67, 1.0, -0.36, 1.02);
  s.lineTo(0.36, 1.02);
  s.bezierCurveTo(0.67, 1.0, 0.87, 0.78, 0.87, 0.46);
  s.lineTo(0.87, 0.02);
  s.bezierCurveTo(0.86, -0.22, 0.76, -0.4, 0.58, -0.5);
  s.bezierCurveTo(0.43, -0.58, 0.28, -0.68, 0.18, -0.78);
  s.lineTo(-0.18, -0.78);

  return s;
}

function createBall() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.radius, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0xf9f871,
      roughness: 0.35,
      emissive: 0x343000
    })
  );

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return {
    mesh,
    position: mesh.position,
    velocity: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    driveDrop: 0,
    driveDropDelay: 0,
    bounceCount: 0,
    firstBounceChecked: false,
    firstBounceIn: false,
    firstBouncePosition: new THREE.Vector3(),
    gravity: BALL.gravity
  };
}

function enterServeState(server) {
  if (game.state === 'home' || game.state === 'gameOver') {
    return;
  }

  game.state = 'waitingServe';
  game.server = server;
  game.serveTimer = server === 'ai' ? 0.9 : 0;
  game.deadBallTimer = 0;
  game.pendingServer = null;
  game.lastHitOwner = null;
  game.rallyHits = 0;
  game.serveForwardCharge = 0;
  game.serveLockTimer = 0.3;

  BALL.resetCooldown = 0.22;
  BALL.hitCooldown = 0.16;

  resetBallRallyState();

  if (server === 'player') {
    input.desiredPaddle.set(0, PLAYER.fixedY, COURT.playerServeZ);
    playerPaddle.position.copy(input.desiredPaddle);
    placeBallForPlayerServe();
  } else {
    aiPaddle.position.set(0, PLAYER.fixedY, COURT.aiPaddleZ);
    ball.position.set(0, 1.18, COURT.aiPaddleZ + 0.62);
  }

  updateHud();
}

function resetBallRallyState() {
  ball.velocity.set(0, 0, 0);
  ball.spin.set(0, 0, 0);
  ball.driveDrop = 0;
  ball.driveDropDelay = 0;
  ball.bounceCount = 0;
  ball.firstBounceChecked = false;
  ball.firstBounceIn = false;
  ball.firstBouncePosition.set(0, 0, 0);
}

function resetFirstBounceForNewShot() {
  ball.bounceCount = 0;
  ball.firstBounceChecked = false;
  ball.firstBounceIn = false;
  ball.firstBouncePosition.set(0, 0, 0);
}

function placeBallForPlayerServe() {
  ball.position.set(
    playerPaddle.position.x,
    PLAYER.fixedY + 0.02,
    playerPaddle.position.z - 0.72
  );
}

function bindInput() {
  const unlockAudio = () => audio.resume();

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (game.state === 'home' || game.state === 'gameOver') return;

    event.preventDefault();

    unlockAudio();

    input.dragging = true;
    input.lastX = event.clientX;
    input.lastY = event.clientY;

    input.pointerDownX = event.clientX;
    input.pointerDownY = event.clientY;
    input.pointerDownTime = performance.now();
    input.totalPointerMove = 0;

    renderer.domElement.setPointerCapture(event.pointerId);
  }, { passive: false });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!input.dragging) return;

    event.preventDefault();

    const dx = event.clientX - input.lastX;
    const dy = event.clientY - input.lastY;

    input.totalPointerMove += Math.abs(dx) + Math.abs(dy);

    input.lastX = event.clientX;
    input.lastY = event.clientY;

    const xSensitivity = 0.026;
    const forwardBackSensitivity = 0.026;

    input.desiredPaddle.x += dx * xSensitivity;
    input.desiredPaddle.z += dy * forwardBackSensitivity;

    clampDesiredPaddle();
  }, { passive: false });

  renderer.domElement.addEventListener('pointerup', (event) => {
    event.preventDefault();

    const clickDuration = performance.now() - input.pointerDownTime;

    const clickDistance = Math.hypot(
      event.clientX - input.pointerDownX,
      event.clientY - input.pointerDownY
    );

    const isClickToMove =
      clickDuration < 280 &&
      clickDistance < 9 &&
      input.totalPointerMove < 14;

    if (isClickToMove && game.state !== 'home' && game.state !== 'gameOver') {
      movePaddleTargetToScreenPoint(event.clientX, event.clientY);
    }

    input.dragging = false;
  }, { passive: false });

  renderer.domElement.addEventListener('pointercancel', () => {
    input.dragging = false;
  });

  window.addEventListener('pointerup', () => {
    input.dragging = false;
  });

  window.addEventListener('keydown', (event) => {
    unlockAudio();

    if (event.code === 'Space' && game.state === 'waitingServe' && game.server === 'player') {
      placeBallForPlayerServe();
      game.serveForwardCharge = 0;
      game.serveLockTimer = 0.25;
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });
}

function movePaddleTargetToScreenPoint(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();

  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

  raycaster.setFromCamera(pointerNdc, camera);

  const hitPoint = new THREE.Vector3();
  const hasHit = raycaster.ray.intersectPlane(paddleTargetPlane, hitPoint);

  if (!hasHit) return;

  input.desiredPaddle.x = hitPoint.x;
  input.desiredPaddle.z = hitPoint.z;
  input.desiredPaddle.y = PLAYER.fixedY;

  clampDesiredPaddle();

  input.clickMoveBoostTimer = 0.32;
}

function clampDesiredPaddle() {
  input.desiredPaddle.x = THREE.MathUtils.clamp(
    input.desiredPaddle.x,
    -COURT.width / 2 + 0.45,
    COURT.width / 2 - 0.45
  );

  input.desiredPaddle.y = PLAYER.fixedY;

  input.desiredPaddle.z = THREE.MathUtils.clamp(
    input.desiredPaddle.z,
    COURT.playerForwardMinZ,
    COURT.playerBackMaxZ
  );
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 1 / 30);
  game.time += dt;

  update(dt);
  renderer.render(scene, camera);
}

function update(dt) {
  BALL.resetCooldown = Math.max(0, BALL.resetCooldown - dt);
  BALL.hitCooldown = Math.max(0, BALL.hitCooldown - dt);

  input.clickMoveBoostTimer = Math.max(0, input.clickMoveBoostTimer - dt);

  game.lastPlayerPaddlePos.copy(playerPaddle.position);
  game.lastAiPaddlePos.copy(aiPaddle.position);

  const paddleFollowStrength = input.clickMoveBoostTimer > 0 ? 0.000004 : 0.000035;

  playerPaddle.position.lerp(
    input.desiredPaddle,
    1 - Math.pow(paddleFollowStrength, dt)
  );

  playerPaddle.position.y = PLAYER.fixedY;

  playerPaddle.position.z = THREE.MathUtils.clamp(
    playerPaddle.position.z,
    COURT.playerForwardMinZ,
    COURT.playerBackMaxZ
  );

  playerPaddle.position.x = THREE.MathUtils.clamp(
    playerPaddle.position.x,
    -COURT.width / 2 + 0.45,
    COURT.width / 2 - 0.45
  );

  game.playerPaddleVelocity
    .copy(playerPaddle.position)
    .sub(game.lastPlayerPaddlePos)
    .divideScalar(Math.max(dt, 0.0001));

  updatePlayerEnergy(dt);

  aiOpponent.update({
    dt,
    ball,
    paddle: aiPaddle,
    court: COURT,
    ballConfig: BALL,
    rallyHits: game.rallyHits,
    gameState: game.state
  });

  game.aiPaddleVelocity
    .copy(aiPaddle.position)
    .sub(game.lastAiPaddlePos)
    .divideScalar(Math.max(dt, 0.0001));

  updatePaddleVisual(playerPaddle, game.playerPaddleVelocity, true, dt);
  updatePaddleVisual(aiPaddle, game.aiPaddleVelocity, false, dt);

  if (game.state === 'home' || game.state === 'gameOver') {
    updateDustSystem(dt);
    updateStableCamera(dt);
    return;
  }

  if (game.pendingServer) {
    game.previousBallPosition.copy(ball.position);
    stepBall(dt);
    updatePointResetTimer(dt);
  } else if (game.state === 'waitingServe') {
    updateServeState(dt);
  } else if (game.state === 'rally') {
    game.previousBallPosition.copy(ball.position);

    stepBall(dt);

    checkPaddleCollision(playerPaddle, game.playerPaddleVelocity, 'player');
    checkPaddleCollision(aiPaddle, game.aiPaddleVelocity, 'ai');
    checkNetCollision();

    const alreadyReset = checkOutOfBounds();

    if (!alreadyReset) {
      checkDeadBallAndReset();
    }
  }

  updateDustSystem(dt);
  updateStableCamera(dt);
}

function updateStableCamera(dt) {
  desiredCameraPosition.set(
    CAMERA.baseX + playerPaddle.position.x * CAMERA.paddleXInfluence,
    CAMERA.baseY,
    CAMERA.baseZ + (playerPaddle.position.z - COURT.playerServeZ) * CAMERA.paddleZInfluence
  );

  desiredCameraLookTarget.set(
    CAMERA.lookBaseX + playerPaddle.position.x * CAMERA.lookPaddleXInfluence,
    CAMERA.lookBaseY,
    CAMERA.lookBaseZ + (playerPaddle.position.z - COURT.playerServeZ) * CAMERA.lookPaddleZInfluence
  );

  camera.position.lerp(
    desiredCameraPosition,
    1 - Math.pow(CAMERA.positionSmooth, dt)
  );

  cameraLookTarget.lerp(
    desiredCameraLookTarget,
    1 - Math.pow(CAMERA.lookSmooth, dt)
  );

  camera.lookAt(cameraLookTarget);
}

function updatePointResetTimer(dt) {
  game.deadBallTimer -= dt;

  if (game.deadBallTimer <= 0) {
    const nextServer = game.pendingServer || 'player';
    enterServeState(nextServer);
  }
}

function updateServeState(dt) {
  if (game.server === 'player') {
    placeBallForPlayerServe();

    game.serveLockTimer = Math.max(0, game.serveLockTimer - dt);

    const forwardSwing = Math.max(0, -game.playerPaddleVelocity.z);
    const backwardSwing = Math.max(0, game.playerPaddleVelocity.z);
    const sideSwing = Math.abs(game.playerPaddleVelocity.x);

    if (game.serveLockTimer > 0) {
      game.serveForwardCharge = 0;
      return;
    }

    if (backwardSwing > 0.8) {
      game.serveForwardCharge *= 0.45;
    }

    if (forwardSwing > 0.8) {
      game.serveForwardCharge += forwardSwing * dt;
    } else {
      game.serveForwardCharge *= Math.pow(0.55, dt * 60);
    }

    game.serveForwardCharge = THREE.MathUtils.clamp(
      game.serveForwardCharge,
      0,
      1.35
    );

    const effortSwing =
      forwardSwing +
      game.serveForwardCharge * 3.2 +
      sideSwing * 0.12;

    const enoughSpeed = forwardSwing > PLAYER.serveReadyMinSwing;
    const enoughDistance = game.serveForwardCharge > PLAYER.serveMinForwardDistance;

    if (enoughSpeed && enoughDistance) {
      launchPlayerServe(effortSwing);
    }

    return;
  }

  game.serveTimer -= dt;

  if (game.serveTimer <= 0) {
    launchAIServe();
  }
}

function launchPlayerServe(rawSwing) {
  game.state = 'rally';
  game.deadBallTimer = 0;
  game.pendingServer = null;
  game.serveForwardCharge = 0;
  game.serveLockTimer = 0;
  BALL.hitCooldown = 0.18;
  game.lastHitOwner = 'player';
  game.rallyHits = 1;

  const swingPower = THREE.MathUtils.clamp(rawSwing / 11.5, 0.28, 1.15);
  const staminaFactor = THREE.MathUtils.lerp(0.68, 1.08, PLAYER.stamina);
  const power = THREE.MathUtils.clamp(
    0.38 + swingPower * staminaFactor,
    0.38,
    1.45
  );

  PLAYER.stamina = THREE.MathUtils.clamp(
    PLAYER.stamina - 0.03 - power * 0.035,
    0.16,
    1
  );

  resetFirstBounceForNewShot();

  ball.position.set(
    playerPaddle.position.x,
    PLAYER.fixedY + 0.02,
    playerPaddle.position.z - 0.52
  );

  const target = new THREE.Vector3(
    THREE.MathUtils.clamp(
      playerPaddle.position.x * 0.25 + game.playerPaddleVelocity.x * 0.06,
      -2.65,
      2.65
    ),
    0.52,
    THREE.MathUtils.lerp(-4.9, -7.35, THREE.MathUtils.clamp(power, 0, 1))
  );

  const dz = Math.abs(target.z - ball.position.z);

  const travelSpeed = THREE.MathUtils.lerp(
    6.4,
    13.8,
    THREE.MathUtils.clamp(power / 1.45, 0, 1)
  );

  const time = THREE.MathUtils.clamp(dz / travelSpeed, 0.58, 1.35);

  const velocity = solveBallisticVelocity({
    start: ball.position,
    target,
    time,
    gravity: BALL.gravity
  });

  velocity.x += game.playerPaddleVelocity.x * 0.12;

  velocity.y += THREE.MathUtils.lerp(
    0.08,
    0.34,
    THREE.MathUtils.clamp(power / 1.45, 0, 1)
  );

  velocity.z = -Math.abs(velocity.z);

  ensureNetClearance(velocity, -1, 0.58);

  ball.velocity.set(
    THREE.MathUtils.clamp(velocity.x, -5.6, 5.6),
    THREE.MathUtils.clamp(velocity.y, 2.1, 5.55),
    THREE.MathUtils.clamp(velocity.z, -15.3, -6.3)
  );

  ball.spin.set(
    game.playerPaddleVelocity.z * -0.08,
    game.playerPaddleVelocity.x * 0.08,
    THREE.MathUtils.clamp(game.playerPaddleVelocity.x * -0.04, -0.8, 0.8)
  );

  ball.driveDrop = THREE.MathUtils.lerp(
    0.85,
    4.2,
    THREE.MathUtils.clamp(power / 1.45, 0, 1)
  );

  ball.driveDropDelay = getNetClearDelay(ball.position, ball.velocity, -1);

  animatePaddleHit(playerPaddle, power, 'player');
  spawnHitDust(ball.position, power, 1);

  audio.playPaddleHit({
    power,
    distance: 0.4,
    isPlayer: true
  });
}

function launchAIServe() {
  game.state = 'rally';
  game.deadBallTimer = 0;
  game.pendingServer = null;
  BALL.hitCooldown = 0.18;
  game.lastHitOwner = 'ai';
  game.rallyHits = 1;

  resetFirstBounceForNewShot();

  ball.position.set(aiPaddle.position.x, 1.22, COURT.aiPaddleZ + 0.55);

  const target = new THREE.Vector3(
    THREE.MathUtils.clamp(aiPaddle.position.x * 0.15 + randomSpread(1.05), -2.55, 2.55),
    0.58,
    THREE.MathUtils.randFloat(5.0, 7.0)
  );

  const dz = Math.abs(target.z - ball.position.z);
  const time = THREE.MathUtils.clamp(dz / THREE.MathUtils.randFloat(6.2, 8.6), 0.82, 1.65);

  const velocity = solveBallisticVelocity({
    start: ball.position,
    target,
    time,
    gravity: BALL.gravity
  });

  velocity.z = Math.abs(velocity.z);
  velocity.y += 0.24;

  ensureNetClearance(velocity, 1, 0.78);

  ball.velocity.set(
    THREE.MathUtils.clamp(velocity.x, -3.8, 3.8),
    THREE.MathUtils.clamp(velocity.y, 2.45, 5.9),
    THREE.MathUtils.clamp(velocity.z, 5.6, 9.3)
  );

  ball.spin.set(randomSpread(0.25), randomSpread(0.3), randomSpread(0.35));
  ball.driveDrop = 0.85;
  ball.driveDropDelay = getNetClearDelay(ball.position, ball.velocity, 1);

  animatePaddleHit(aiPaddle, 0.75, 'ai');
  spawnHitDust(ball.position, 0.75, -1);

  audio.playPaddleHit({
    power: 0.75,
    distance: distanceFromPlayer(ball.position),
    isPlayer: false
  });
}

function updatePlayerEnergy(dt) {
  const swingSpeed = game.playerPaddleVelocity.length();
  const hardSwing = THREE.MathUtils.smoothstep(swingSpeed, 3.8, 13.5);

  PLAYER.lastSwingPower += (hardSwing - PLAYER.lastSwingPower) * (1 - Math.pow(0.08, dt));

  const recovering = PLAYER.lastSwingPower < 0.18;
  const recovery = recovering ? 0.17 * dt : 0.045 * dt;
  const drain = hardSwing * 0.12 * dt;

  PLAYER.stamina = THREE.MathUtils.clamp(
    PLAYER.stamina + recovery - drain,
    0.16,
    1
  );
}

function updatePaddleVisual(paddle, velocity, isPlayer, dt) {
  const swingKick = paddle.userData.swingKick || 0;
  const hitShake = paddle.userData.hitShake || 0;

  const sideTilt = THREE.MathUtils.clamp(-velocity.x * 0.045, -0.38, 0.38);

  const attackTilt = isPlayer
    ? THREE.MathUtils.clamp(velocity.z * 0.05, -0.65, 0.58)
    : THREE.MathUtils.clamp(-velocity.z * 0.045 + velocity.y * 0.018, -0.55, 0.5);

  const twist = THREE.MathUtils.clamp(velocity.x * 0.025, -0.32, 0.32);

  const shakeX = Math.sin(game.time * 95) * hitShake * 0.07;
  const shakeZ = Math.cos(game.time * 82) * hitShake * 0.06;

  const targetRotX = attackTilt + swingKick * (isPlayer ? -0.42 : 0.42) + shakeX;
  const targetRotY = twist + shakeZ;
  const targetRotZ = sideTilt;

  paddle.rotation.x += (targetRotX - paddle.rotation.x) * 0.2;
  paddle.rotation.y += (targetRotY - paddle.rotation.y) * 0.18;
  paddle.rotation.z += (targetRotZ - paddle.rotation.z) * 0.18;

  paddle.userData.swingKick = Math.max(0, swingKick - dt * 4.5);
  paddle.userData.hitShake = Math.max(0, hitShake - dt * 5.5);
}

function animatePaddleHit(paddle, power, owner) {
  paddle.userData.swingKick = THREE.MathUtils.clamp(power, 0.25, 1.5);
  paddle.userData.hitShake = THREE.MathUtils.clamp(power * 0.62, 0.12, 0.85);

  const punchDirection = owner === 'player' ? -1 : 1;

  paddle.position.z += punchDirection * THREE.MathUtils.clamp(
    power * 0.06,
    0.025,
    0.1
  );
}

function stepBall(dt) {
  const horizontalSpeed = Math.sqrt(
    ball.velocity.x * ball.velocity.x +
    ball.velocity.z * ball.velocity.z
  );

  ball.velocity.y += ball.gravity * dt;

  if (ball.driveDropDelay > 0) {
    ball.driveDropDelay = Math.max(0, ball.driveDropDelay - dt);
  }

  if (ball.driveDrop > 0 && ball.driveDropDelay <= 0 && horizontalSpeed > 0.5) {
    const speedFactor = THREE.MathUtils.clamp(horizontalSpeed / 10.5, 0.18, 1.4);
    ball.velocity.y -= ball.driveDrop * speedFactor * dt;
    ball.driveDrop = Math.max(0, ball.driveDrop - dt * 1.85);
  }

  const speed = ball.velocity.length();

  if (speed > 0.001) {
    const magnus = new THREE.Vector3()
      .crossVectors(ball.spin, ball.velocity)
      .multiplyScalar(BALL.airSpinDrag * dt);

    magnus.y = THREE.MathUtils.clamp(magnus.y, -0.06, 0.018);
    ball.velocity.add(magnus);
  }

  if (ball.velocity.y > 3.15) {
    ball.velocity.y *= Math.pow(0.987, dt * 60);
  }

  ball.velocity.multiplyScalar(Math.pow(BALL.drag, dt * 60));
  ball.spin.multiplyScalar(Math.pow(0.982, dt * 60));

  ball.position.addScaledVector(ball.velocity, dt);

  if (ball.position.y <= BALL.minY) {
    const impactSpeed = Math.abs(ball.velocity.y);
    const impactPosition = ball.position.clone();

    ball.position.y = BALL.minY;

    if (ball.velocity.y < 0) {
      ball.bounceCount += 1;

      if (!ball.firstBounceChecked) {
        ball.firstBounceChecked = true;
        ball.firstBouncePosition.copy(impactPosition);
        ball.firstBounceIn = isLandingInCourt(impactPosition);

        if (!ball.firstBounceIn) {
          const winner = oppositePlayer(game.lastHitOwner);
          const reason = getOutReasonFromLanding(impactPosition, game.lastHitOwner);
          scheduleRallyResult(winner, 0.95, reason);
          return;
        }
      }

      ball.velocity.y = -ball.velocity.y * BALL.bounce;
      ball.velocity.x *= BALL.floorFriction;
      ball.velocity.z *= BALL.floorFriction;

      ball.spin.x *= 0.74;
      ball.spin.y *= 0.74;
      ball.spin.z *= 0.78;
      ball.driveDrop *= 0.25;
      ball.driveDropDelay = 0;

      if (impactSpeed > 0.75) {
        const floorPower = THREE.MathUtils.clamp(impactSpeed / 6.2, 0.18, 1.15);

        spawnFloorDust(impactPosition, floorPower);

        audio.playFloorHit({
          power: floorPower,
          distance: distanceFromPlayer(impactPosition)
        });
      }

      if (Math.abs(ball.velocity.y) < 0.55 && Math.abs(ball.velocity.z) < 1.2) {
        ball.velocity.y = 0;
      }
    }
  }

  ball.mesh.rotation.x += ball.velocity.z * dt * 2.2;
  ball.mesh.rotation.z -= ball.velocity.x * dt * 2.2;
}

function isLandingInCourt(position) {
  const halfW = COURT.width / 2;
  const halfL = COURT.halfLength;
  const lineTolerance = 0.08;

  return (
    Math.abs(position.x) <= halfW + lineTolerance &&
    position.z >= -halfL - lineTolerance &&
    position.z <= halfL + lineTolerance
  );
}

function getOutReasonFromLanding(position, owner) {
  const halfW = COURT.width / 2;
  const halfL = COURT.halfLength;

  if (Math.abs(position.x) > halfW + 0.08) {
    return `${playerLabel(owner)} hit wide`;
  }

  if (owner === 'player' && position.z < -halfL - 0.08) {
    return 'You hit long';
  }

  if (owner === 'ai' && position.z > halfL + 0.08) {
    return 'Opponent hit long';
  }

  return `${playerLabel(owner)} hit out`;
}

function checkPaddleCollision(paddle, paddleVelocity, owner) {
  if (BALL.resetCooldown > 0 || BALL.hitCooldown > 0 || game.state !== 'rally') return;

  const direction = owner === 'player' ? -1 : 1;

  if (owner === 'player' && ball.velocity.z <= -0.15) return;
  if (owner === 'ai' && ball.velocity.z >= 0.15) return;

  const paddleHalfW = 0.48;
  const paddleHalfH = 0.52;
  const hitDepth = owner === 'player' ? 0.64 : 0.48;

  const previous = game.previousBallPosition;
  const current = ball.position;
  const planeZ = paddle.position.z;

  const crossedPlane =
    owner === 'player'
      ? previous.z <= planeZ && current.z >= planeZ
      : previous.z >= planeZ && current.z <= planeZ;

  let contactPoint;
  let local;

  if (crossedPlane) {
    const t = THREE.MathUtils.clamp(
      (planeZ - previous.z) / (current.z - previous.z || 0.0001),
      0,
      1
    );

    contactPoint = previous.clone().lerp(current, t);
    local = contactPoint.clone().sub(paddle.position);
  } else {
    contactPoint = current.clone();
    local = current.clone().sub(paddle.position);
  }

  const nearFaceNow = Math.abs(current.z - paddle.position.z) < hitDepth;
  const isNearFace = crossedPlane || nearFaceNow;

  const isInsideFace =
    Math.abs(local.x) < paddleHalfW + BALL.radius &&
    Math.abs(local.y) < paddleHalfH + BALL.radius;

  if (!isNearFace || !isInsideFace) return;

  game.lastHitOwner = owner;
  game.rallyHits += 1;
  BALL.hitCooldown = 0.15;

  resetFirstBounceForNewShot();

  const offsetX = THREE.MathUtils.clamp(local.x / paddleHalfW, -1, 1);
  const offsetY = THREE.MathUtils.clamp(local.y / paddleHalfH, -1, 1);

  ball.position.copy(contactPoint);
  ball.position.z = paddle.position.z + direction * (hitDepth + BALL.radius + 0.025);

  if (owner === 'ai') {
    applyAIHumanReturnShot({
      direction,
      offsetX,
      offsetY,
      paddleVelocity
    });
  } else {
    applyPlayerPhysicsShot({
      direction,
      offsetX,
      offsetY,
      paddleVelocity
    });
  }
}

function applyAIHumanReturnShot({ direction, offsetX, offsetY, paddleVelocity }) {
  const intent = aiOpponent.getShotIntent({
    ball,
    paddle: aiPaddle,
    paddleVelocity,
    court: COURT,
    rallyHits: game.rallyHits,
    contactOffsetX: offsetX,
    contactOffsetY: offsetY
  });

  const target = new THREE.Vector3(
    intent.targetX,
    intent.wantsSafeLob ? 0.78 : 0.58,
    intent.targetZ
  );

  const dz = Math.abs(target.z - ball.position.z);
  const baseTravelSpeed = THREE.MathUtils.lerp(6.2, 10.2, intent.power) * intent.speedBoost;
  const time = THREE.MathUtils.clamp(dz / baseTravelSpeed, 0.78, 1.64);

  const velocity = solveBallisticVelocity({
    start: ball.position,
    target,
    time,
    gravity: BALL.gravity
  });

  velocity.x += paddleVelocity.x * 0.045;
  velocity.y += intent.arcBoost + (intent.wantsSafeLob ? 0.18 : 0.1);
  velocity.z = Math.abs(velocity.z) * direction;

  ensureNetClearance(velocity, direction, intent.netSafety);

  const quality = intent.contactQuality;
  const maxZ = THREE.MathUtils.lerp(7.2, 10.8, intent.power);
  const minZ = THREE.MathUtils.lerp(5.2, 6.8, quality);

  ball.velocity.set(
    THREE.MathUtils.clamp(velocity.x, -4.3, 4.3),
    THREE.MathUtils.clamp(velocity.y, 2.1, 6.2),
    direction > 0
      ? THREE.MathUtils.clamp(velocity.z, minZ, maxZ)
      : THREE.MathUtils.clamp(velocity.z, -maxZ, -minZ)
  );

  ball.spin.set(
    THREE.MathUtils.clamp(-offsetY * 0.8 + paddleVelocity.y * 0.04, -1.2, 1.2),
    THREE.MathUtils.clamp(offsetX * 0.75 + paddleVelocity.x * 0.035, -1.2, 1.2),
    THREE.MathUtils.clamp(-offsetX * 0.55, -0.9, 0.9)
  );

  ball.driveDrop = intent.wantsSafeLob
    ? THREE.MathUtils.lerp(0.12, 0.55, intent.power)
    : THREE.MathUtils.lerp(0.75, 3.0, intent.power);

  ball.driveDropDelay = getNetClearDelay(ball.position, ball.velocity, direction);

  const hitPower = THREE.MathUtils.clamp(
    intent.power * (0.65 + quality * 0.5),
    0.18,
    1.35
  );

  animatePaddleHit(aiPaddle, hitPower, 'ai');
  spawnHitDust(ball.position, hitPower, -1);

  audio.playPaddleHit({
    power: hitPower,
    distance: distanceFromPlayer(ball.position),
    isPlayer: false
  });
}

function applyPlayerPhysicsShot({ direction, offsetX, offsetY, paddleVelocity }) {
  const incomingSpeed = Math.abs(ball.velocity.z);
  const forwardSwing = Math.max(0, -paddleVelocity.z);
  const backwardSwing = Math.max(0, paddleVelocity.z);
  const lateralSwing = Math.abs(paddleVelocity.x);

  const cleanContact =
    1 -
    THREE.MathUtils.clamp(
      Math.sqrt(offsetX * offsetX + offsetY * offsetY) / 1.25,
      0,
      1
    );

  const relativeEnergy =
    incomingSpeed * 0.11 +
    forwardSwing * 0.22 +
    lateralSwing * 0.055 -
    backwardSwing * 0.045;

  const staminaFactor = THREE.MathUtils.lerp(0.68, 1.12, PLAYER.stamina);

  const power = THREE.MathUtils.clamp(
    0.42 + relativeEnergy * staminaFactor + cleanContact * 0.26,
    0.34,
    1.85
  );

  PLAYER.stamina = THREE.MathUtils.clamp(
    PLAYER.stamina - 0.018 - THREE.MathUtils.clamp(power, 0, 1.4) * 0.042,
    0.16,
    1
  );

  const isDefensiveBackHit = backwardSwing > forwardSwing * 1.2;
  const depthByPower = THREE.MathUtils.clamp(power / 1.85, 0, 1);

  const targetZ = isDefensiveBackHit
    ? THREE.MathUtils.lerp(-3.25, -5.45, depthByPower)
    : THREE.MathUtils.lerp(-5.05, -7.85, depthByPower);

  const targetX = THREE.MathUtils.clamp(
    playerPaddle.position.x * 0.16 + offsetX * 1.65 + paddleVelocity.x * 0.085,
    -COURT.width / 2 + 0.45,
    COURT.width / 2 - 0.45
  );

  const targetY = isDefensiveBackHit ? 0.82 : 0.56;

  const target = new THREE.Vector3(targetX, targetY, targetZ);
  const dz = Math.abs(target.z - ball.position.z);

  const travelSpeed = isDefensiveBackHit
    ? THREE.MathUtils.lerp(5.2, 8.4, depthByPower)
    : THREE.MathUtils.lerp(7.0, 15.4, depthByPower);

  const time = THREE.MathUtils.clamp(
    dz / travelSpeed,
    0.54,
    isDefensiveBackHit ? 1.75 : 1.32
  );

  const velocity = solveBallisticVelocity({
    start: ball.position,
    target,
    time,
    gravity: BALL.gravity
  });

  velocity.x += paddleVelocity.x * 0.14;

  const liftFromContact = THREE.MathUtils.clamp(offsetY * 0.16, -0.05, 0.18);

  const liftByPower = isDefensiveBackHit
    ? THREE.MathUtils.lerp(0.42, 0.24, depthByPower)
    : THREE.MathUtils.lerp(0.32, -0.06, depthByPower);

  velocity.y += liftFromContact + liftByPower;
  velocity.z = -Math.abs(velocity.z);

  ensureNetClearance(
    velocity,
    direction,
    isDefensiveBackHit
      ? THREE.MathUtils.lerp(0.72, 0.86, 1 - PLAYER.stamina)
      : THREE.MathUtils.lerp(0.5, 0.68, 1 - PLAYER.stamina)
  );

  const minForward = isDefensiveBackHit
    ? THREE.MathUtils.lerp(4.1, 6.2, depthByPower)
    : THREE.MathUtils.lerp(6.5, 9.2, depthByPower);

  const maxForward = isDefensiveBackHit
    ? THREE.MathUtils.lerp(6.2, 9.0, depthByPower)
    : THREE.MathUtils.lerp(9.0, 16.5, depthByPower);

  ball.velocity.set(
    THREE.MathUtils.clamp(velocity.x, -6.2, 6.2),
    THREE.MathUtils.clamp(velocity.y, 2.0, 5.75),
    THREE.MathUtils.clamp(velocity.z, -maxForward, -minForward)
  );

  ball.spin.set(
    THREE.MathUtils.clamp(-offsetY * 0.75 + paddleVelocity.z * -0.04, -1.35, 1.35),
    THREE.MathUtils.clamp(offsetX * 0.95 + paddleVelocity.x * 0.05, -1.45, 1.45),
    THREE.MathUtils.clamp(-paddleVelocity.x * 0.035, -1.0, 1.0)
  );

  ball.driveDrop = isDefensiveBackHit
    ? THREE.MathUtils.lerp(0.4, 1.3, depthByPower)
    : THREE.MathUtils.lerp(1.55, 5.9, depthByPower);

  ball.driveDropDelay = getNetClearDelay(ball.position, ball.velocity, direction);

  animatePaddleHit(playerPaddle, power, 'player');
  spawnHitDust(ball.position, power, 1);

  audio.playPaddleHit({
    power,
    distance: 0.4,
    isPlayer: true
  });
}

function solveBallisticVelocity({ start, target, time, gravity }) {
  return new THREE.Vector3(
    (target.x - start.x) / time,
    (target.y - start.y - 0.5 * gravity * time * time) / time,
    (target.z - start.z) / time
  );
}

function ensureNetClearance(velocity, direction, extraSafety = 0.72) {
  const dzToNet = COURT.netZ - ball.position.z;

  if (Math.sign(dzToNet) !== direction) return;

  const timeToNet = dzToNet / velocity.z;

  if (!Number.isFinite(timeToNet) || timeToNet <= 0) return;

  const requiredHeight = COURT.netHeight + BALL.radius + extraSafety;

  const predictedNetY =
    ball.position.y +
    velocity.y * timeToNet +
    0.5 * BALL.gravity * timeToNet * timeToNet;

  if (predictedNetY < requiredHeight) {
    const missing = requiredHeight - predictedNetY;
    velocity.y += missing / timeToNet + 0.24;
  }
}

function getNetClearDelay(position, velocity, direction) {
  const dzToNet = COURT.netZ - position.z;

  if (Math.sign(dzToNet) !== direction) return 0;

  const timeToNet = dzToNet / velocity.z;

  if (!Number.isFinite(timeToNet) || timeToNet <= 0) return 0;

  return THREE.MathUtils.clamp(timeToNet + 0.08, 0.12, 0.78);
}

function checkNetCollision() {
  const previous = game.previousBallPosition;
  const current = ball.position;

  const crossedNet =
    (previous.z < COURT.netZ && current.z >= COURT.netZ) ||
    (previous.z > COURT.netZ && current.z <= COURT.netZ);

  if (!crossedNet) return false;

  const t = THREE.MathUtils.clamp(
    (COURT.netZ - previous.z) / (current.z - previous.z || 0.0001),
    0,
    1
  );

  const yAtNet = THREE.MathUtils.lerp(previous.y, current.y, t);

  if (yAtNet < COURT.netHeight + BALL.radius) {
    const faultOwner = game.lastHitOwner;
    const winner = oppositePlayer(faultOwner);

    ball.position.z = ball.velocity.z > 0 ? -0.09 : 0.09;
    ball.velocity.z *= -0.28;
    ball.velocity.y = Math.max(ball.velocity.y, 0.85);
    ball.velocity.x *= 0.62;
    ball.spin.multiplyScalar(0.45);
    ball.driveDrop *= 0.25;
    ball.driveDropDelay = 0;

    audio.playFloorHit({
      power: 0.36,
      distance: distanceFromPlayer(ball.position)
    });

    scheduleRallyResult(winner, 1.15, `${playerLabel(faultOwner)} hit the net`);
    return true;
  }

  return false;
}

function checkOutOfBounds() {
  if (ball.firstBounceChecked) return false;

  const emergencySideLimit =
    COURT.width / 2 +
    COURT.sideOutMargin +
    COURT.emergencyOutMargin;

  const emergencyBackLimit =
    COURT.halfLength +
    COURT.backOutMargin +
    COURT.emergencyOutMargin;

  const farSideOut = Math.abs(ball.position.x) > emergencySideLimit;
  const farBackOut = Math.abs(ball.position.z) > emergencyBackLimit;
  const deadLow = ball.position.y < -1.2;

  if (!farSideOut && !farBackOut && !deadLow) return false;

  const winner = oppositePlayer(game.lastHitOwner);

  const reason = farSideOut
    ? `${playerLabel(game.lastHitOwner)} hit very wide`
    : farBackOut
      ? `${playerLabel(game.lastHitOwner)} hit very long`
      : 'Dead ball';

  scheduleRallyResult(winner, 1.0, reason);

  return true;
}

function checkDeadBallAndReset() {
  const horizontalSpeed = Math.sqrt(
    ball.velocity.x * ball.velocity.x +
    ball.velocity.z * ball.velocity.z
  );

  const totalSpeed = ball.velocity.length();
  const onFloor = ball.position.y <= BALL.minY + 0.025;

  if (ball.bounceCount >= 2) {
    scheduleRallyResult(determineWinnerFromDeadBall(), 0.85, 'Double bounce');
    return;
  }

  if (onFloor && totalSpeed < 0.9 && horizontalSpeed < 0.75) {
    scheduleRallyResult(determineWinnerFromDeadBall(), 0.9, 'Ball stopped');
    return;
  }

  if (Math.abs(ball.position.z - COURT.netZ) < 0.35 && totalSpeed < 1.15 && onFloor) {
    scheduleRallyResult(oppositePlayer(game.lastHitOwner), 0.85, 'Ball died near net');
  }
}

function scheduleRallyResult(rallyWinner, delay = 0.75, reason = '') {
  if (game.pendingServer || game.state === 'gameOver') return;

  if (!rallyWinner) rallyWinner = 'player';

  const serverWonRally = rallyWinner === game.server;

  let scoreChanged = false;
  let nextServer = game.server;
  let pointText = '';

  if (serverWonRally) {
    scoreChanged = true;

    if (rallyWinner === 'player') {
      game.playerScore += 1;
    } else {
      game.aiScore += 1;
    }

    nextServer = rallyWinner;
    pointText = '+1 Point';
  } else {
    nextServer = rallyWinner;
    pointText = 'Side Out — serve changes';
  }

  updateHud();

  const gameWinner = getGameWinner();

  if (gameWinner) {
    game.pendingServer = null;
    game.state = 'gameOver';

    ball.velocity.multiplyScalar(0.25);
    ball.spin.multiplyScalar(0.25);
    ball.driveDrop = 0;
    ball.driveDropDelay = 0;

    if (gameWinner === 'player') {
      audio.playPointWin();
    } else {
      audio.playPointLose();
    }

    finishGame(gameWinner);
    return;
  }

  game.pendingServer = nextServer;
  game.deadBallTimer = delay;
  game.state = 'pointOver';

  ball.velocity.multiplyScalar(0.35);
  ball.spin.multiplyScalar(0.3);
  ball.driveDrop = 0;
  ball.driveDropDelay = 0;

  showPointOverlay(
    rallyWinner,
    rallyWinner === 'player' ? 'You win the rally' : 'Opponent wins the rally',
    `${reason}<br>${pointText}<br>Next serve: ${nextServer === 'player' ? 'You' : 'Opponent'}`,
    scoreChanged
  );

  if (rallyWinner === 'player') {
    audio.playPointWin();
  } else {
    audio.playPointLose();
  }
}

function showPointOverlay(
  owner,
  title,
  subtitle = '',
  important = false,
  durationMs = POINT_OVERLAY_AUTO_HIDE_MS
) {
  let color = '#ffffff';

  if (owner === 'player') {
    color = '#38bdf8';
  } else if (owner === 'ai') {
    color = '#fb7185';
  }

  window.clearTimeout(pointOverlay._hideTimer);

  pointOverlay.innerHTML = `
    <button class="point-overlay-close" type="button" data-point-overlay-close aria-label="Close">
      ×
    </button>

    <div class="point-title" style="color:${color};">${title}</div>
    <div class="point-subtitle">${subtitle}</div>
    <div class="point-score">You ${game.playerScore} — ${game.aiScore} Opponent</div>
  `;

  pointOverlay.classList.add('show');

  const finalDuration = Number.isFinite(durationMs)
    ? durationMs
    : POINT_OVERLAY_AUTO_HIDE_MS;

  if (finalDuration > 0) {
    pointOverlay._hideTimer = window.setTimeout(() => {
      hidePointOverlay();
    }, finalDuration);
  }
}

function hidePointOverlay() {
  window.clearTimeout(pointOverlay._hideTimer);
  pointOverlay._hideTimer = null;
  pointOverlay.classList.remove('show');
}


function updateHud() {
  document.querySelector('#playerScore').textContent = game.playerScore;
  document.querySelector('#aiScore').textContent = game.aiScore;
  document.querySelector('#serverText').textContent =
    `Server: ${game.server === 'player' ? 'You' : 'Opponent'}`;
  document.querySelector('#difficultyText').textContent =
    DIFFICULTIES[game.difficulty]?.label ?? 'Easy';
}

function refreshStatsUI() {
  document.querySelector('#statGames').textContent = stats.gamesPlayed;
  document.querySelector('#statPlayerWins').textContent = stats.playerWins;
  document.querySelector('#statAiWins').textContent = stats.aiWins;
  document.querySelector('#statBestScore').textContent = stats.bestPlayerScore;
}

function determineWinnerFromDeadBall() {
  if (game.lastHitOwner === 'player') {
    return ball.firstBounceIn && ball.firstBouncePosition.z < COURT.netZ
      ? 'player'
      : 'ai';
  }

  if (game.lastHitOwner === 'ai') {
    return ball.firstBounceIn && ball.firstBouncePosition.z > COURT.netZ
      ? 'ai'
      : 'player';
  }

  return game.server || 'player';
}

function oppositePlayer(owner) {
  if (owner === 'player') return 'ai';
  if (owner === 'ai') return 'player';

  return game.server === 'player' ? 'ai' : 'player';
}

function playerLabel(owner) {
  if (owner === 'player') return 'You';
  if (owner === 'ai') return 'Opponent';

  return 'Player';
}

function createDustSystem() {
  const maxParticles = 180;
  const positions = new Float32Array(maxParticles * 3);
  const colors = new Float32Array(maxParticles * 3);
  const sizes = new Float32Array(maxParticles);

  const particles = [];

  for (let i = 0; i < maxParticles; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = -99;
    positions[i * 3 + 2] = 0;

    colors[i * 3] = 1;
    colors[i * 3 + 1] = 1;
    colors[i * 3 + 2] = 1;

    sizes[i] = 0;

    particles.push({
      active: false,
      life: 0,
      maxLife: 1,
      velocity: new THREE.Vector3(),
      size: 0.04,
      opacity: 0
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    size: 0.08,
    transparent: true,
    opacity: 0.72,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);

  return {
    points,
    geometry,
    positions,
    colors,
    sizes,
    particles,
    cursor: 0
  };
}

function spawnHitDust(position, power, direction) {
  const count = Math.floor(
    THREE.MathUtils.lerp(
      8,
      34,
      THREE.MathUtils.clamp(power / 1.5, 0, 1)
    )
  );

  for (let i = 0; i < count; i++) {
    emitParticle({
      position,
      velocity: new THREE.Vector3(
        randomSpread(0.8 + power * 0.45),
        Math.random() * (0.42 + power * 0.28),
        direction * (0.5 + Math.random() * (1.5 + power))
      ),
      life: THREE.MathUtils.randFloat(0.28, 0.64),
      size: THREE.MathUtils.randFloat(0.035, 0.095) * (0.8 + power * 0.6),
      color: new THREE.Color(0xffffff)
    });
  }
}

function spawnFloorDust(position, power) {
  const count = Math.floor(THREE.MathUtils.lerp(4, 18, power));

  for (let i = 0; i < count; i++) {
    emitParticle({
      position,
      velocity: new THREE.Vector3(
        randomSpread(0.5 + power * 0.5),
        Math.random() * (0.22 + power * 0.18),
        randomSpread(0.5 + power * 0.5)
      ),
      life: THREE.MathUtils.randFloat(0.18, 0.48),
      size: THREE.MathUtils.randFloat(0.025, 0.07) * (0.8 + power),
      color: new THREE.Color(0xeef2ff)
    });
  }
}

function emitParticle({ position, velocity, life, size, color }) {
  const i = dustSystem.cursor;
  dustSystem.cursor = (dustSystem.cursor + 1) % dustSystem.particles.length;

  const p = dustSystem.particles[i];
  p.active = true;
  p.life = life;
  p.maxLife = life;
  p.velocity.copy(velocity);
  p.size = size;
  p.opacity = 1;

  dustSystem.positions[i * 3] = position.x + randomSpread(0.05);
  dustSystem.positions[i * 3 + 1] = position.y + randomSpread(0.04);
  dustSystem.positions[i * 3 + 2] = position.z + randomSpread(0.05);

  dustSystem.colors[i * 3] = color.r;
  dustSystem.colors[i * 3 + 1] = color.g;
  dustSystem.colors[i * 3 + 2] = color.b;

  dustSystem.sizes[i] = size;
}

function updateDustSystem(dt) {
  for (let i = 0; i < dustSystem.particles.length; i++) {
    const p = dustSystem.particles[i];

    if (!p.active) {
      dustSystem.positions[i * 3 + 1] = -99;
      dustSystem.sizes[i] = 0;
      continue;
    }

    p.life -= dt;

    if (p.life <= 0) {
      p.active = false;
      dustSystem.positions[i * 3 + 1] = -99;
      dustSystem.sizes[i] = 0;
      continue;
    }

    const fade = THREE.MathUtils.clamp(p.life / p.maxLife, 0, 1);

    p.velocity.y += 0.24 * dt;
    p.velocity.multiplyScalar(Math.pow(0.88, dt * 60));

    dustSystem.positions[i * 3] += p.velocity.x * dt;
    dustSystem.positions[i * 3 + 1] += p.velocity.y * dt;
    dustSystem.positions[i * 3 + 2] += p.velocity.z * dt;

    dustSystem.sizes[i] = p.size * fade;
  }

  dustSystem.geometry.attributes.position.needsUpdate = true;
  dustSystem.geometry.attributes.color.needsUpdate = true;
  dustSystem.geometry.attributes.size.needsUpdate = true;
}

function createGameAudio() {
  let context = null;
  let master = null;

  function ensureContext() {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain();
      master.gain.value = 1.0;
      master.connect(context.destination);
    }

    return context;
  }

  function resume() {
    const ctx = ensureContext();

    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  function distanceGain(distance) {
    return THREE.MathUtils.clamp(1 / (1 + distance * 0.105), 0.28, 1);
  }

  function playPaddleHit({ power, distance, isPlayer }) {
    const ctx = ensureContext();
    const now = ctx.currentTime;
    const p = THREE.MathUtils.clamp(power, 0.05, 1.6);
    const gainByDistance = isPlayer ? 1 : distanceGain(distance);

    const osc = ctx.createOscillator();
    const body = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(
      THREE.MathUtils.lerp(165, 430, THREE.MathUtils.clamp(p / 1.6, 0, 1)),
      now
    );

    osc.frequency.exponentialRampToValueAtTime(
      THREE.MathUtils.lerp(90, 190, THREE.MathUtils.clamp(p / 1.6, 0, 1)),
      now + 0.1
    );

    filter.type = 'bandpass';
    filter.frequency.value = THREE.MathUtils.lerp(
      620,
      1650,
      THREE.MathUtils.clamp(p / 1.6, 0, 1)
    );
    filter.Q.value = 1.1;

    body.gain.setValueAtTime(0.0001, now);
    body.gain.exponentialRampToValueAtTime(
      THREE.MathUtils.clamp(0.22 + p * 0.28, 0.16, 0.58) * gainByDistance,
      now + 0.007
    );
    body.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(filter);
    filter.connect(body);
    body.connect(master);

    osc.start(now);
    osc.stop(now + 0.16);

    playNoiseBurst({
      duration: 0.052,
      volume: THREE.MathUtils.clamp(0.07 + p * 0.105, 0.055, 0.24) * gainByDistance,
      frequency: 2100 + p * 760,
      q: 0.75
    });
  }

  function playFloorHit({ power, distance }) {
    const ctx = ensureContext();
    const now = ctx.currentTime;
    const p = THREE.MathUtils.clamp(power, 0.04, 1.2);
    const gainByDistance = distanceGain(distance);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(
      THREE.MathUtils.lerp(82, 190, p),
      now
    );

    osc.frequency.exponentialRampToValueAtTime(
      THREE.MathUtils.lerp(42, 82, p),
      now + 0.115
    );

    filter.type = 'lowpass';
    filter.frequency.value = THREE.MathUtils.lerp(360, 850, p);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      THREE.MathUtils.clamp(0.14 + p * 0.24, 0.08, 0.42) * gainByDistance,
      now + 0.006
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    osc.start(now);
    osc.stop(now + 0.2);

    playNoiseBurst({
      duration: 0.05,
      volume: THREE.MathUtils.clamp(0.06 + p * 0.08, 0.045, 0.17) * gainByDistance,
      frequency: 650 + p * 780,
      q: 0.6
    });
  }

  function playPointWin() {
    const ctx = ensureContext();
    const now = ctx.currentTime;

    playTone({ frequency: 523.25, start: now, duration: 0.08, volume: 0.16, type: 'sine' });
    playTone({ frequency: 659.25, start: now + 0.08, duration: 0.08, volume: 0.18, type: 'sine' });
    playTone({ frequency: 783.99, start: now + 0.16, duration: 0.16, volume: 0.22, type: 'triangle' });

    playNoiseBurst({
      duration: 0.09,
      volume: 0.08,
      frequency: 2800,
      q: 0.9
    });
  }

  function playPointLose() {
    const ctx = ensureContext();
    const now = ctx.currentTime;

    playTone({ frequency: 246.94, start: now, duration: 0.12, volume: 0.2, type: 'sawtooth' });
    playTone({ frequency: 196.0, start: now + 0.12, duration: 0.16, volume: 0.18, type: 'triangle' });
    playTone({ frequency: 146.83, start: now + 0.26, duration: 0.22, volume: 0.16, type: 'sine' });

    playNoiseBurst({
      duration: 0.12,
      volume: 0.06,
      frequency: 520,
      q: 0.5
    });
  }

  function playTone({ frequency, start, duration, volume, type }) {
    const ctx = ensureContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(master);

    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function playNoiseBurst({ duration, volume, frequency, q }) {
    const ctx = ensureContext();
    const now = ctx.currentTime;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.7);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    source.start(now);
    source.stop(now + duration);
  }

  return {
    resume,
    playPaddleHit,
    playFloorHit,
    playPointWin,
    playPointLose
  };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return createDefaultStats();
    }

    return {
      ...createDefaultStats(),
      ...JSON.parse(raw)
    };
  } catch {
    return createDefaultStats();
  }
}

function saveStats(nextStats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStats));
}

function createDefaultStats() {
  return {
    gamesPlayed: 0,
    playerWins: 0,
    aiWins: 0,
    bestPlayerScore: 0,
    lastGames: []
  };
}

function distanceFromPlayer(position) {
  return position.distanceTo(playerPaddle.position);
}

function randomSpread(amount) {
  return (Math.random() - 0.5) * amount * 2;
}