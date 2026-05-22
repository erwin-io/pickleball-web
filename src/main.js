import * as THREE from 'three';
import { HumanLikePickleballAI } from './aiOpponent.js';
import './style.css';

const app = document.querySelector('#app');

// app.innerHTML = `
//   <div class="hud">
//     <div class="hud-title">3D Pickleball Human-AI POC</div>
//     <div class="hud-text">
//       Drag left/right to move sideways. Drag up/down to move forward/back. First serve waits for your swing.
//     </div>
//   </div>
//   <div class="crosshair"></div>
// `;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071225);
scene.fog = new THREE.Fog(0x071225, 18, 42);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 6.4, 10.7);
camera.lookAt(0, 1.1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const clock = new THREE.Clock();

const COURT = {
  width: 6.1,
  length: 13.4,
  halfLength: 6.7,

  playerServeZ: 5.95,
  playerForwardMinZ: 2.35,
  playerBackMaxZ: 7.42,

  aiPaddleZ: -5.35,

  netZ: 0,
  netHeight: 0.9,

  sideOutMargin: 0.46,
  backOutMargin: 1.35
};

const BALL = {
  radius: 0.16,
  gravity: -7.25,
  bounce: 0.68,
  drag: 0.9955,
  airSpinDrag: 0.018,
  floorFriction: 0.9,
  minY: 0.16,
  resetCooldown: 0,
  hitCooldown: 0
};

const PLAYER = {
  fixedY: 1.16,
  stamina: 0.86,
  lastSwingPower: 0,
  serveReadyMinSwing: 2.35
};

const input = {
  dragging: false,
  lastX: 0,
  lastY: 0,
  desiredPaddle: new THREE.Vector3(0, PLAYER.fixedY, COURT.playerServeZ)
};

const game = {
  state: 'waitingServe',
  server: 'player',
  serveTimer: 0,

  lastPlayerPaddlePos: new THREE.Vector3(),
  lastAiPaddlePos: new THREE.Vector3(),
  previousBallPosition: new THREE.Vector3(),

  playerPaddleVelocity: new THREE.Vector3(),
  aiPaddleVelocity: new THREE.Vector3(),

  lastHitOwner: null,
  rallyHits: 0,
  time: 0
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

const aiOpponent = new HumanLikePickleballAI({
  baseReaction: 0.105,
  baseMaxSpeed: 7.15,
  sprintSpeed: 9.65,
  acceleration: 18.0,
  deceleration: 15.5,
  skill: 0.82,
  stamina: 0.82
});

enterServeState('player');
bindInput();
animate();

function setupLights() {
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x1d2430, 1.4);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-5, 12, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 14;
  key.shadow.camera.bottom = -14;
  scene.add(key);

  const rim = new THREE.PointLight(0x4aa3ff, 18, 24);
  rim.position.set(0, 3, -8);
  scene.add(rim);
}

function createCourt() {
  const group = new THREE.Group();

  const floorGeo = new THREE.BoxGeometry(COURT.width, 0.08, COURT.length);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e8f71, roughness: 0.78 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  floor.position.y = -0.04;
  group.add(floor);

  const kitchenGeo = new THREE.BoxGeometry(COURT.width, 0.085, 2.1);
  const kitchenMat = new THREE.MeshStandardMaterial({ color: 0x2778b8, roughness: 0.78 });

  const playerKitchen = new THREE.Mesh(kitchenGeo, kitchenMat);
  playerKitchen.position.set(0, 0.01, 1.05);
  playerKitchen.receiveShadow = true;
  group.add(playerKitchen);

  const aiKitchen = new THREE.Mesh(kitchenGeo, kitchenMat);
  aiKitchen.position.set(0, 0.011, -1.05);
  aiKitchen.receiveShadow = true;
  group.add(aiKitchen);

  addLine(group, 0, 0.04, 0, COURT.width, 0.045);
  addLine(group, 0, 0.045, COURT.halfLength, COURT.width, 0.06);
  addLine(group, 0, 0.045, -COURT.halfLength, COURT.width, 0.06);
  addLine(group, -COURT.width / 2, 0.045, 0, 0.06, COURT.length);
  addLine(group, COURT.width / 2, 0.045, 0, 0.06, COURT.length);
  addLine(group, 0, 0.045, 2.1, COURT.width, 0.05);
  addLine(group, 0, 0.045, -2.1, COURT.width, 0.05);
  addLine(group, 0, 0.046, 4.4, 0.05, 4.6);
  addLine(group, 0, 0.046, -4.4, 0.05, 4.6);

  const netPostMat = new THREE.MeshStandardMaterial({ color: 0xf0f4ff, roughness: 0.4 });
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
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
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
    gravity: BALL.gravity
  };
}

function enterServeState(server) {
  game.state = 'waitingServe';
  game.server = server;
  game.serveTimer = server === 'ai' ? 0.9 : 0;
  game.lastHitOwner = null;
  game.rallyHits = 0;

  BALL.resetCooldown = 0.2;
  BALL.hitCooldown = 0.12;

  ball.velocity.set(0, 0, 0);
  ball.spin.set(0, 0, 0);

  if (server === 'player') {
    input.desiredPaddle.set(0, PLAYER.fixedY, COURT.playerServeZ);
    playerPaddle.position.copy(input.desiredPaddle);
    placeBallForPlayerServe();
  } else {
    aiPaddle.position.set(0, PLAYER.fixedY, COURT.aiPaddleZ);
    ball.position.set(0, 1.18, COURT.aiPaddleZ + 0.62);
  }
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
    unlockAudio();

    input.dragging = true;
    input.lastX = event.clientX;
    input.lastY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!input.dragging) return;

    const dx = event.clientX - input.lastX;
    const dy = event.clientY - input.lastY;

    input.lastX = event.clientX;
    input.lastY = event.clientY;

    const xSensitivity = 0.0125;
    const forwardBackSensitivity = 0.021;

    input.desiredPaddle.x += dx * xSensitivity;
    input.desiredPaddle.z += dy * forwardBackSensitivity;

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
  });

  window.addEventListener('pointerup', () => {
    input.dragging = false;
  });

  window.addEventListener('keydown', (event) => {
    unlockAudio();

    if (event.code === 'Space' && game.state === 'waitingServe' && game.server === 'player') {
      launchPlayerServe(0.75);
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });
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

  game.lastPlayerPaddlePos.copy(playerPaddle.position);
  game.lastAiPaddlePos.copy(aiPaddle.position);

  playerPaddle.position.lerp(input.desiredPaddle, 1 - Math.pow(0.0007, dt));
  playerPaddle.position.y = PLAYER.fixedY;
  playerPaddle.position.z = THREE.MathUtils.clamp(
    playerPaddle.position.z,
    COURT.playerForwardMinZ,
    COURT.playerBackMaxZ
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

  if (game.state === 'waitingServe') {
    updateServeState(dt);
  } else {
    game.previousBallPosition.copy(ball.position);

    stepBall(dt);

    checkPaddleCollision(playerPaddle, game.playerPaddleVelocity, 'player');
    checkPaddleCollision(aiPaddle, game.aiPaddleVelocity, 'ai');
    checkNetCollision();
    checkOutOfBounds();
  }

  updateDustSystem(dt);

  camera.position.x += (playerPaddle.position.x * 0.2 - camera.position.x) * 0.025;
  camera.position.z += (playerPaddle.position.z + 4.85 - camera.position.z) * 0.018;
  camera.lookAt(playerPaddle.position.x * 0.12, 1.05, 0);
}

function updateServeState(dt) {
  if (game.server === 'player') {
    placeBallForPlayerServe();

    const forwardSwing = Math.max(0, -game.playerPaddleVelocity.z);
    const sideSwing = Math.abs(game.playerPaddleVelocity.x);
    const serveSwing = forwardSwing + sideSwing * 0.22;

    if (serveSwing > PLAYER.serveReadyMinSwing) {
      launchPlayerServe(serveSwing);
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
  BALL.hitCooldown = 0.18;
  game.lastHitOwner = 'player';
  game.rallyHits = 1;

  const swingPower = THREE.MathUtils.clamp(rawSwing / 9.0, 0.32, 1.15);
  const staminaFactor = THREE.MathUtils.lerp(0.68, 1.08, PLAYER.stamina);
  const power = THREE.MathUtils.clamp(0.48 + swingPower * staminaFactor, 0.5, 1.45);

  PLAYER.stamina = THREE.MathUtils.clamp(PLAYER.stamina - 0.035 - power * 0.04, 0.16, 1);

  ball.position.set(
    playerPaddle.position.x,
    PLAYER.fixedY + 0.02,
    playerPaddle.position.z - 0.52
  );

  const target = new THREE.Vector3(
    THREE.MathUtils.clamp(playerPaddle.position.x * 0.25 + game.playerPaddleVelocity.x * 0.06, -2.35, 2.35),
    0.5,
    THREE.MathUtils.lerp(-3.95, -5.55, THREE.MathUtils.clamp(power, 0, 1))
  );

  const dz = Math.abs(target.z - ball.position.z);
  const travelSpeed = THREE.MathUtils.lerp(5.8, 10.8, THREE.MathUtils.clamp(power / 1.45, 0, 1));
  const time = THREE.MathUtils.clamp(dz / travelSpeed, 0.72, 1.55);

  const velocity = solveBallisticVelocity({
    start: ball.position,
    target,
    time,
    gravity: BALL.gravity
  });

  velocity.x += game.playerPaddleVelocity.x * 0.1;
  velocity.y += THREE.MathUtils.lerp(0.1, 0.58, THREE.MathUtils.clamp(power / 1.45, 0, 1));
  velocity.z = -Math.abs(velocity.z);

  ensureNetClearance(velocity, -1, 0.5);

  ball.velocity.set(
    THREE.MathUtils.clamp(velocity.x, -4.8, 4.8),
    THREE.MathUtils.clamp(velocity.y, 2.2, 6.2),
    THREE.MathUtils.clamp(velocity.z, -11.5, -5.6)
  );

  ball.spin.set(
    game.playerPaddleVelocity.z * -0.08,
    game.playerPaddleVelocity.x * 0.08,
    THREE.MathUtils.clamp(game.playerPaddleVelocity.x * -0.04, -0.8, 0.8)
  );

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
  BALL.hitCooldown = 0.18;
  game.lastHitOwner = 'ai';
  game.rallyHits = 1;

  ball.position.set(aiPaddle.position.x, 1.22, COURT.aiPaddleZ + 0.55);

  const target = new THREE.Vector3(
    THREE.MathUtils.clamp(aiPaddle.position.x * 0.15 + randomSpread(0.95), -2.25, 2.25),
    0.5,
    THREE.MathUtils.randFloat(4.1, 5.45)
  );

  const dz = Math.abs(target.z - ball.position.z);
  const time = THREE.MathUtils.clamp(dz / THREE.MathUtils.randFloat(6.2, 8.4), 0.8, 1.55);

  const velocity = solveBallisticVelocity({
    start: ball.position,
    target,
    time,
    gravity: BALL.gravity
  });

  velocity.z = Math.abs(velocity.z);
  ensureNetClearance(velocity, 1, 0.56);

  ball.velocity.set(
    THREE.MathUtils.clamp(velocity.x, -3.8, 3.8),
    THREE.MathUtils.clamp(velocity.y, 2.35, 5.8),
    THREE.MathUtils.clamp(velocity.z, 5.8, 9.5)
  );

  ball.spin.set(randomSpread(0.25), randomSpread(0.3), randomSpread(0.35));

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

  PLAYER.stamina = THREE.MathUtils.clamp(PLAYER.stamina + recovery - drain, 0.16, 1);
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
  paddle.position.z += punchDirection * THREE.MathUtils.clamp(power * 0.06, 0.025, 0.1);
}

function stepBall(dt) {
  ball.velocity.y += ball.gravity * dt;

  const speed = ball.velocity.length();
  if (speed > 0.001) {
    const magnus = new THREE.Vector3()
      .crossVectors(ball.spin, ball.velocity)
      .multiplyScalar(BALL.airSpinDrag * dt);

    ball.velocity.add(magnus);
  }

  ball.velocity.multiplyScalar(Math.pow(BALL.drag, dt * 60));
  ball.spin.multiplyScalar(Math.pow(0.985, dt * 60));

  ball.position.addScaledVector(ball.velocity, dt);

  if (ball.position.y <= BALL.minY) {
    const impactSpeed = Math.abs(ball.velocity.y);
    const impactPosition = ball.position.clone();

    ball.position.y = BALL.minY;

    if (ball.velocity.y < 0) {
      ball.velocity.y = -ball.velocity.y * BALL.bounce;

      ball.velocity.x *= BALL.floorFriction;
      ball.velocity.z *= BALL.floorFriction;

      ball.spin.x *= 0.78;
      ball.spin.y *= 0.78;
      ball.spin.z *= 0.82;

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

  const offsetX = THREE.MathUtils.clamp(local.x / paddleHalfW, -1, 1);
  const offsetY = THREE.MathUtils.clamp(local.y / paddleHalfH, -1, 1);

  ball.position.copy(contactPoint);
  ball.position.z = paddle.position.z + direction * (hitDepth + BALL.radius + 0.025);

  if (owner === 'ai') {
    applyAIHumanReturnShot({ direction, offsetX, offsetY, paddleVelocity });
  } else {
    applyPlayerPhysicsShot({ direction, offsetX, offsetY, paddleVelocity });
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
    intent.wantsSafeLob ? 0.72 : 0.5,
    intent.targetZ
  );

  const dz = Math.abs(target.z - ball.position.z);
  const baseTravelSpeed = THREE.MathUtils.lerp(6.2, 10.2, intent.power) * intent.speedBoost;
  const time = THREE.MathUtils.clamp(dz / baseTravelSpeed, 0.76, 1.58);

  const velocity = solveBallisticVelocity({
    start: ball.position,
    target,
    time,
    gravity: BALL.gravity
  });

  velocity.x += paddleVelocity.x * 0.045;
  velocity.y += intent.arcBoost;
  velocity.z = Math.abs(velocity.z) * direction;

  ensureNetClearance(velocity, direction, intent.netSafety);

  const quality = intent.contactQuality;
  const maxZ = THREE.MathUtils.lerp(7.4, 11.2, intent.power);
  const minZ = THREE.MathUtils.lerp(5.4, 7.0, quality);

  ball.velocity.set(
    THREE.MathUtils.clamp(velocity.x, -4.3, 4.3),
    THREE.MathUtils.clamp(velocity.y, 2.2, 6.35),
    direction > 0
      ? THREE.MathUtils.clamp(velocity.z, minZ, maxZ)
      : THREE.MathUtils.clamp(velocity.z, -maxZ, -minZ)
  );

  ball.spin.set(
    THREE.MathUtils.clamp(-offsetY * 0.8 + paddleVelocity.y * 0.04, -1.2, 1.2),
    THREE.MathUtils.clamp(offsetX * 0.75 + paddleVelocity.x * 0.035, -1.2, 1.2),
    THREE.MathUtils.clamp(-offsetX * 0.55, -0.9, 0.9)
  );

  const hitPower = THREE.MathUtils.clamp(intent.power * (0.65 + quality * 0.5), 0.18, 1.35);
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
    incomingSpeed * 0.095 +
    forwardSwing * 0.16 +
    lateralSwing * 0.045 -
    backwardSwing * 0.055;

  const staminaFactor = THREE.MathUtils.lerp(0.66, 1.08, PLAYER.stamina);

  const power = THREE.MathUtils.clamp(
    0.34 + relativeEnergy * staminaFactor + cleanContact * 0.24,
    0.28,
    1.62
  );

  PLAYER.stamina = THREE.MathUtils.clamp(
    PLAYER.stamina - 0.018 - THREE.MathUtils.clamp(power, 0, 1.4) * 0.042,
    0.16,
    1
  );

  const isDefensiveBackHit = backwardSwing > forwardSwing * 1.2;

  const depthByPower = THREE.MathUtils.clamp(power / 1.62, 0, 1);
  const targetZ = isDefensiveBackHit
    ? THREE.MathUtils.lerp(-2.9, -4.4, depthByPower)
    : THREE.MathUtils.lerp(-3.8, -6.05, depthByPower);

  const targetX = THREE.MathUtils.clamp(
    playerPaddle.position.x * 0.14 + offsetX * 1.45 + paddleVelocity.x * 0.065,
    -COURT.width / 2 + 0.45,
    COURT.width / 2 - 0.45
  );

  const targetY = isDefensiveBackHit ? 0.72 : 0.48;

  const target = new THREE.Vector3(targetX, targetY, targetZ);
  const dz = Math.abs(target.z - ball.position.z);

  const travelSpeed = isDefensiveBackHit
    ? THREE.MathUtils.lerp(4.8, 7.4, depthByPower)
    : THREE.MathUtils.lerp(5.8, 12.4, depthByPower);

  const time = THREE.MathUtils.clamp(dz / travelSpeed, 0.72, isDefensiveBackHit ? 1.85 : 1.48);

  const velocity = solveBallisticVelocity({
    start: ball.position,
    target,
    time,
    gravity: BALL.gravity
  });

  velocity.x += paddleVelocity.x * 0.11;
  velocity.y += THREE.MathUtils.clamp(offsetY * 0.28 + power * 0.26, -0.06, 0.8);
  velocity.z = -Math.abs(velocity.z);

  ensureNetClearance(
    velocity,
    direction,
    isDefensiveBackHit
      ? THREE.MathUtils.lerp(0.55, 0.82, 1 - PLAYER.stamina)
      : THREE.MathUtils.lerp(0.34, 0.62, 1 - PLAYER.stamina)
  );

  const minForward = isDefensiveBackHit
    ? THREE.MathUtils.lerp(3.8, 5.8, depthByPower)
    : THREE.MathUtils.lerp(5.4, 8.2, depthByPower);

  const maxForward = isDefensiveBackHit
    ? THREE.MathUtils.lerp(5.4, 8.4, depthByPower)
    : THREE.MathUtils.lerp(7.6, 13.6, depthByPower);

  ball.velocity.set(
    THREE.MathUtils.clamp(velocity.x, -5.4, 5.4),
    THREE.MathUtils.clamp(velocity.y, 2.0, 6.9),
    THREE.MathUtils.clamp(velocity.z, -maxForward, -minForward)
  );

  ball.spin.set(
    THREE.MathUtils.clamp(-offsetY * 1.0 + paddleVelocity.z * -0.04, -1.5, 1.5),
    THREE.MathUtils.clamp(offsetX * 0.9 + paddleVelocity.x * 0.045, -1.4, 1.4),
    THREE.MathUtils.clamp(-paddleVelocity.x * 0.035, -1.0, 1.0)
  );

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

function ensureNetClearance(velocity, direction, extraSafety = 0.42) {
  const dzToNet = COURT.netZ - ball.position.z;

  if (Math.sign(dzToNet) !== direction) return;

  const timeToNet = dzToNet / velocity.z;
  if (!Number.isFinite(timeToNet) || timeToNet <= 0) return;

  const requiredHeight = COURT.netHeight + BALL.radius + extraSafety;
  const predictedNetY =
    ball.position.y + velocity.y * timeToNet + 0.5 * BALL.gravity * timeToNet * timeToNet;

  if (predictedNetY < requiredHeight) {
    const missing = requiredHeight - predictedNetY;
    velocity.y += missing / timeToNet + 0.22;
  }
}

function checkNetCollision() {
  const previous = game.previousBallPosition;
  const current = ball.position;

  const crossedNet =
    (previous.z < COURT.netZ && current.z >= COURT.netZ) ||
    (previous.z > COURT.netZ && current.z <= COURT.netZ);

  if (!crossedNet) return;

  const t = THREE.MathUtils.clamp(
    (COURT.netZ - previous.z) / (current.z - previous.z || 0.0001),
    0,
    1
  );

  const yAtNet = THREE.MathUtils.lerp(previous.y, current.y, t);

  if (yAtNet < COURT.netHeight + BALL.radius) {
    ball.position.z = ball.velocity.z > 0 ? -0.09 : 0.09;
    ball.velocity.z *= -0.38;
    ball.velocity.y = Math.max(ball.velocity.y, 1.15);
    ball.velocity.x *= 0.72;
    ball.spin.multiplyScalar(0.55);

    audio.playFloorHit({
      power: 0.36,
      distance: distanceFromPlayer(ball.position)
    });
  }
}

function checkOutOfBounds() {
  const sideLimit = COURT.width / 2 + COURT.sideOutMargin;
  const backLimit = COURT.halfLength + COURT.backOutMargin;

  const sideOut = Math.abs(ball.position.x) > sideLimit;
  const playerBackOut = ball.position.z > backLimit;
  const aiBackOut = ball.position.z < -backLimit;
  const deadLow = ball.position.y < -1.2;

  if (!sideOut && !playerBackOut && !aiBackOut && !deadLow) return;

  let nextServer = 'player';

  if (playerBackOut || deadLow) {
    nextServer = 'ai';
  } else if (aiBackOut) {
    nextServer = 'player';
  } else if (sideOut) {
    nextServer = game.lastHitOwner === 'player' ? 'ai' : 'player';
  }

  enterServeState(nextServer);
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
  const count = Math.floor(THREE.MathUtils.lerp(8, 34, THREE.MathUtils.clamp(power / 1.5, 0, 1)));

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
    if (ctx.state === 'suspended') ctx.resume();
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
    osc.frequency.setValueAtTime(THREE.MathUtils.lerp(165, 430, THREE.MathUtils.clamp(p / 1.6, 0, 1)), now);
    osc.frequency.exponentialRampToValueAtTime(THREE.MathUtils.lerp(90, 190, THREE.MathUtils.clamp(p / 1.6, 0, 1)), now + 0.1);

    filter.type = 'bandpass';
    filter.frequency.value = THREE.MathUtils.lerp(620, 1650, THREE.MathUtils.clamp(p / 1.6, 0, 1));
    filter.Q.value = 1.1;

    body.gain.setValueAtTime(0.0001, now);
    body.gain.exponentialRampToValueAtTime(THREE.MathUtils.clamp(0.22 + p * 0.28, 0.16, 0.58) * gainByDistance, now + 0.007);
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
    osc.frequency.setValueAtTime(THREE.MathUtils.lerp(82, 190, p), now);
    osc.frequency.exponentialRampToValueAtTime(THREE.MathUtils.lerp(42, 82, p), now + 0.115);

    filter.type = 'lowpass';
    filter.frequency.value = THREE.MathUtils.lerp(360, 850, p);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(THREE.MathUtils.clamp(0.14 + p * 0.24, 0.08, 0.42) * gainByDistance, now + 0.006);
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
    playFloorHit
  };
}

function distanceFromPlayer(position) {
  return position.distanceTo(playerPaddle.position);
}

function randomSpread(amount) {
  return (Math.random() - 0.5) * amount * 2;
}