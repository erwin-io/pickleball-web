import * as THREE from 'three';

export class HumanLikePickleballAI {
  constructor(options = {}) {
    this.baseReaction = options.baseReaction ?? 0.1;
    this.baseMaxSpeed = options.baseMaxSpeed ?? 7.2;
    this.sprintSpeed = options.sprintSpeed ?? 9.7;
    this.acceleration = options.acceleration ?? 18;
    this.deceleration = options.deceleration ?? 15;
    this.skill = THREE.MathUtils.clamp(options.skill ?? 0.82, 0, 1);

    this.homeX = options.homeX ?? 0;
    this.homeY = options.homeY ?? 1.26;

    this.stamina = THREE.MathUtils.clamp(options.stamina ?? 0.82, 0.08, 1);
    this.stress = 0.18;
    this.confidence = 0.72;
    this.preparedness = 0.62;

    this.velocity = new THREE.Vector3();
    this.target = new THREE.Vector3(this.homeX, this.homeY, -5.35);
    this.lastTarget = this.target.clone();

    this.thinkTimer = 0;
    this.time = 0;
    this.lastMoveIntensity = 0;
    this.lastContactQuality = 0.7;
  }

  update({ dt, ball, paddle, court, ballConfig, rallyHits, gameState }) {
    this.time += dt;

    if (gameState === 'waitingServe') {
      this._recover(dt, true);
      this._moveToReady({ dt, paddle, court });
      return;
    }

    const ballSpeed = ball.velocity.length();
    const ballComingToAI = ball.velocity.z < 0;
    const distanceToBall = paddle.position.distanceTo(ball.position);
    const urgent = ballComingToAI && ball.position.z < court.aiPaddleZ + 2.1;

    this._updateMind({
      dt,
      ballSpeed,
      ballComingToAI,
      distanceToBall,
      rallyHits
    });

    this.thinkTimer -= dt;

    if (urgent) {
      this.target.copy(this._closeRangeTarget({ ball, court }));
    } else if (this.thinkTimer <= 0) {
      this.thinkTimer = this._currentReactionDelay();
      this.lastTarget.copy(this.target);
      this.target.copy(this._chooseTarget({ ball, court, ballConfig, rallyHits }));
    }

    this._moveLikeHuman({ dt, paddle, court, ballComingToAI });
  }

  getShotIntent({ paddle, paddleVelocity, court, rallyHits, contactOffsetX, contactOffsetY }) {
    const centerQuality =
      1 -
      THREE.MathUtils.clamp(
        Math.sqrt(contactOffsetX * contactOffsetX + contactOffsetY * contactOffsetY) / 1.25,
        0,
        1
      );

    const preparation = THREE.MathUtils.clamp(this.preparedness, 0, 1);
    const energy = THREE.MathUtils.clamp(this.stamina, 0, 1);
    const calm = 1 - THREE.MathUtils.clamp(this.stress, 0, 1);
    const movementBalance = 1 - THREE.MathUtils.clamp(this.lastMoveIntensity * 0.42, 0, 0.38);

    const contactQuality = THREE.MathUtils.clamp(
      0.2 +
        centerQuality * 0.34 +
        preparation * 0.22 +
        energy * 0.14 +
        calm * 0.12 +
        movementBalance * 0.08,
      0.1,
      1
    );

    this.lastContactQuality = contactQuality;

    const variation = this._noise(rallyHits * 1.19 + this.time * 0.37);
    const pressurePenalty = this.stress * 0.32;
    const tiredPenalty = (1 - this.stamina) * 0.28;

    const power = THREE.MathUtils.clamp(
      0.46 +
        energy * 0.27 +
        preparation * 0.22 +
        centerQuality * 0.16 -
        pressurePenalty -
        tiredPenalty +
        variation * 0.11,
      0.24,
      1.08
    );

    const attackUrge = THREE.MathUtils.clamp(
      this.confidence * 0.52 + this.stamina * 0.25 - this.stress * 0.2 + variation * 0.16,
      0,
      1
    );

    const wantsHardDrive = attackUrge > 0.61 && contactQuality > 0.55;
    const wantsSafeLob = this.stress > 0.68 || this.stamina < 0.3 || contactQuality < 0.43;

    const targetDepth = wantsHardDrive ? 5.75 : wantsSafeLob ? 4.35 : 5.05;
    const targetXNoise = this._noise(this.time * 0.91 + rallyHits * 2.17) * (wantsSafeLob ? 0.45 : 1.05);

    const targetX = THREE.MathUtils.clamp(
      paddle.position.x * 0.08 + targetXNoise + contactOffsetX * 0.82,
      -court.width / 2 + 0.55,
      court.width / 2 - 0.55
    );

    const arcBoost = wantsSafeLob ? 0.78 : wantsHardDrive ? -0.08 : 0.22;
    const speedBoost = wantsHardDrive ? 1.18 : wantsSafeLob ? 0.83 : 1;

    this.stamina = THREE.MathUtils.clamp(
      this.stamina - (0.035 + power * 0.075 + this.stress * 0.028),
      0.08,
      1
    );

    this.stress = THREE.MathUtils.clamp(
      this.stress + (1 - contactQuality) * 0.11 - contactQuality * 0.025,
      0,
      1
    );

    this.confidence = THREE.MathUtils.clamp(
      this.confidence + (contactQuality - 0.55) * 0.07,
      0.18,
      0.95
    );

    this.preparedness = THREE.MathUtils.clamp(this.preparedness - 0.15, 0, 1);

    return {
      power,
      contactQuality,
      targetX,
      targetZ: targetDepth,
      arcBoost,
      speedBoost,
      wantsHardDrive,
      wantsSafeLob,
      netSafety: THREE.MathUtils.lerp(0.36, 0.82, 1 - contactQuality + this.stress * 0.35)
    };
  }

  _updateMind({ dt, ballSpeed, ballComingToAI, distanceToBall, rallyHits }) {
    const pressureFromSpeed = THREE.MathUtils.smoothstep(ballSpeed, 5.5, 11.5);
    const pressureFromDistance = ballComingToAI
      ? 1 - THREE.MathUtils.smoothstep(distanceToBall, 0.8, 4.6)
      : 0;
    const pressureFromRally = THREE.MathUtils.clamp(rallyHits / 26, 0, 0.35);
    const lowEnergyPressure = THREE.MathUtils.clamp((0.42 - this.stamina) / 0.42, 0, 1) * 0.55;

    const targetStress = THREE.MathUtils.clamp(
      pressureFromSpeed * 0.32 +
        pressureFromDistance * 0.42 +
        pressureFromRally +
        lowEnergyPressure,
      0.06,
      0.95
    );

    this.stress += (targetStress - this.stress) * (1 - Math.pow(0.13, dt));

    const movingHard = this.lastMoveIntensity > 0.62;
    const ballAway = !ballComingToAI;
    const recoveryRate = ballAway ? 0.12 : 0.045;
    const drainRate = movingHard ? 0.125 * this.lastMoveIntensity + this.stress * 0.04 : 0;

    this.stamina = THREE.MathUtils.clamp(this.stamina + recoveryRate * dt - drainRate * dt, 0.08, 1);

    const prepGain = ballComingToAI ? 0.68 : 0.38;
    const prepLoss = this.stress * 0.18 + (1 - this.stamina) * 0.12;

    this.preparedness = THREE.MathUtils.clamp(
      this.preparedness + (prepGain - prepLoss) * dt,
      0,
      1
    );

    this.confidence = THREE.MathUtils.clamp(
      this.confidence + (0.72 - this.confidence) * dt * 0.08 - this.stress * dt * 0.018,
      0.18,
      0.94
    );
  }

  _recover(dt, relaxed = false) {
    this.stamina = THREE.MathUtils.clamp(this.stamina + (relaxed ? 0.18 : 0.1) * dt, 0.08, 1);
    this.stress = THREE.MathUtils.clamp(this.stress - (relaxed ? 0.12 : 0.05) * dt, 0.06, 1);
    this.preparedness = THREE.MathUtils.clamp(this.preparedness + 0.16 * dt, 0, 1);
  }

  _currentReactionDelay() {
    return THREE.MathUtils.clamp(
      this.baseReaction + this.stress * 0.12 + (1 - this.stamina) * 0.14,
      0.075,
      0.28
    );
  }

  _chooseTarget({ ball, court, ballConfig, rallyHits }) {
    if (ball.velocity.z >= 0) {
      return this._readyPosition({ ball, court });
    }

    const predicted = this._simulateIntercept({ ball, court, ballConfig });
    if (!predicted) return this._readyPosition({ ball, court });

    const pressureError = (this.stress * 0.62 + (1 - this.stamina) * 0.38) * (1 - this.skill + 0.26);
    const xError = this._noise(this.time * 0.77 + rallyHits * 1.13) * pressureError * 0.95;
    const yError = this._noise(this.time * 1.01 + rallyHits * 0.53) * pressureError * 0.27;

    const target = new THREE.Vector3(
      predicted.x + xError,
      predicted.y - 0.1 + yError,
      court.aiPaddleZ
    );

    target.y = Math.max(target.y, 0.82);
    return this._clampTarget(target, court);
  }

  _simulateIntercept({ ball, court, ballConfig }) {
    const pos = ball.position.clone();
    const vel = ball.velocity.clone();
    const step = 1 / 120;
    const maxSteps = 340;

    let prev = pos.clone();

    for (let i = 0; i < maxSteps; i++) {
      prev.copy(pos);

      vel.y += ball.gravity * step;
      vel.multiplyScalar(Math.pow(ballConfig.drag, step * 60));
      pos.addScaledVector(vel, step);

      if (pos.y <= ballConfig.minY) {
        pos.y = ballConfig.minY;
        if (vel.y < 0) {
          vel.y = -vel.y * ballConfig.bounce;
          vel.x *= ballConfig.floorFriction;
          vel.z *= ballConfig.floorFriction;
        }
      }

      if (prev.z >= court.aiPaddleZ && pos.z <= court.aiPaddleZ) {
        const t = (court.aiPaddleZ - prev.z) / (pos.z - prev.z || 0.0001);
        return new THREE.Vector3(
          THREE.MathUtils.lerp(prev.x, pos.x, t),
          THREE.MathUtils.lerp(prev.y, pos.y, t),
          court.aiPaddleZ
        );
      }
    }

    return null;
  }

  _closeRangeTarget({ ball, court }) {
    const pressureLag = THREE.MathUtils.lerp(0.08, 0.35, this.stress + (1 - this.stamina) * 0.45);

    const target = new THREE.Vector3(
      THREE.MathUtils.lerp(ball.position.x, this.target.x, pressureLag),
      THREE.MathUtils.lerp(ball.position.y - 0.08, this.target.y, pressureLag),
      court.aiPaddleZ
    );

    return this._clampTarget(target, court);
  }

  _readyPosition({ ball, court }) {
    const anticipationX = THREE.MathUtils.clamp(ball.position.x * 0.18, -0.75, 0.75);
    const energyPostureDrop = (1 - this.stamina) * 0.14;

    return this._clampTarget(
      new THREE.Vector3(this.homeX + anticipationX, this.homeY - energyPostureDrop, court.aiPaddleZ),
      court
    );
  }

  _moveToReady({ dt, paddle, court }) {
    this.target.copy(this._clampTarget(new THREE.Vector3(this.homeX, this.homeY, court.aiPaddleZ), court));
    this._moveLikeHuman({ dt, paddle, court, ballComingToAI: false });
  }

  _moveLikeHuman({ dt, paddle, court, ballComingToAI }) {
    const desired = this.target.clone().sub(paddle.position);
    const distance = desired.length();

    let desiredVelocity = new THREE.Vector3();

    if (distance > 0.015) {
      const urgency = ballComingToAI
        ? THREE.MathUtils.clamp(distance / 2.4 + this.stress * 0.38, 0.18, 1)
        : 0.35;

      const staminaSpeed = THREE.MathUtils.lerp(0.52, 1.0, this.stamina);
      const stressBoost = this.stress > 0.58 && this.stamina > 0.34 ? 1.08 : 1;
      const maxSpeed = THREE.MathUtils.lerp(this.baseMaxSpeed, this.sprintSpeed, urgency) * staminaSpeed * stressBoost;

      desiredVelocity.copy(desired.normalize().multiplyScalar(maxSpeed));
    }

    const diff = desiredVelocity.sub(this.velocity);
    const accelLimit = desiredVelocity.length() > this.velocity.length() ? this.acceleration : this.deceleration;
    const maxChange = accelLimit * dt;

    if (diff.length() > maxChange) {
      diff.normalize().multiplyScalar(maxChange);
    }

    this.velocity.add(diff);

    const stumble = this._noise(this.time * 8.0) * this.stress * (1 - this.stamina) * 0.025;

    paddle.position.addScaledVector(this.velocity, dt);
    paddle.position.x += stumble;

    this._clampPaddle(paddle, court);

    this.lastMoveIntensity = THREE.MathUtils.clamp(this.velocity.length() / Math.max(this.sprintSpeed, 0.001), 0, 1);
  }

  _clampTarget(target, court) {
    target.x = THREE.MathUtils.clamp(target.x, -court.width / 2 + 0.5, court.width / 2 - 0.5);
    target.y = THREE.MathUtils.clamp(target.y, 0.74, 2.55);
    target.z = court.aiPaddleZ;
    return target;
  }

  _clampPaddle(paddle, court) {
    paddle.position.x = THREE.MathUtils.clamp(paddle.position.x, -court.width / 2 + 0.45, court.width / 2 - 0.45);
    paddle.position.y = THREE.MathUtils.clamp(paddle.position.y, 0.72, 2.58);
    paddle.position.z = court.aiPaddleZ;
  }

  _noise(seed) {
    const v = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
    return (v - Math.floor(v)) * 2 - 1;
  }
}