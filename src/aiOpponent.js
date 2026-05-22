import * as THREE from 'three';

export class HumanLikePickleballAI {
  constructor(options = {}) {
    this.baseReaction = options.baseReaction ?? 0.08;
    this.baseMaxSpeed = options.baseMaxSpeed ?? 7.8;
    this.sprintSpeed = options.sprintSpeed ?? 11.0;
    this.acceleration = options.acceleration ?? 22.0;
    this.deceleration = options.deceleration ?? 18.0;
    this.skill = options.skill ?? 0.86;
    this.stamina = options.stamina ?? 0.86;

    this.velocity = new THREE.Vector3();
    this.target = new THREE.Vector3();

    this.reactionTimer = 0;
    this.commitTimer = 0;

    this.pressure = 0.18;
    this.errorBiasX = 0;
    this.errorBiasZ = 0;

    this.lastTargetReason = 'home';
  }

  update({ dt, ball, paddle, court, gameState }) {
    if (!dt || !ball || !paddle || !court) return;

    const limits = this.getMovementLimits(court);

    if (gameState !== 'rally') {
      this.target.set(0, paddle.position.y, limits.homeZ);
      this.movePaddle(dt, paddle, court);
      this.recover(dt);
      return;
    }

    const ballOnAISide = ball.position.z <= 0.35;
    const ballMovingToAI = ball.velocity.z < -0.08;
    const ballNearNetOnAISide = ball.position.z > limits.forwardZ - 0.85 && ball.position.z < 0.45;
    const ballSlow = ball.velocity.length() < 3.1;

    const shouldChase =
      ballOnAISide ||
      ballMovingToAI ||
      ballNearNetOnAISide;

    this.updateMind(dt, ball, paddle, shouldChase);

    this.reactionTimer -= dt;
    this.commitTimer -= dt;

    if (shouldChase) {
      if (this.reactionTimer <= 0 || this.commitTimer <= 0) {
        const target = this.chooseBestMovementTarget(ball, paddle, court);

        this.target.copy(target);

        this.reactionTimer = this.getReactionDelay(ball, ballSlow);
        this.commitTimer = THREE.MathUtils.randFloat(0.08, 0.22);
      }
    } else {
      this.target.x = THREE.MathUtils.lerp(this.target.x, 0, 0.05);
      this.target.y = paddle.position.y;
      this.target.z = THREE.MathUtils.lerp(this.target.z, limits.homeZ, 0.04);
      this.lastTargetReason = 'recover-home';
    }

    this.movePaddle(dt, paddle, court);
  }

  getMovementLimits(court) {
    return {
      minX: -court.width / 2 + 0.42,
      maxX: court.width / 2 - 0.42,

      // Important:
      // AI can now move close to the net and far backward.
      // This fixes slow balls landing near the kitchen/net.
      forwardZ: court.aiForwardMaxZ ?? -1.15,
      backZ: court.aiBackMinZ ?? -(court.halfLength + 0.78),
      homeZ: court.aiPaddleZ ?? -(court.halfLength - 1.45)
    };
  }

  updateMind(dt, ball, paddle, shouldChase) {
    const distanceToBall = paddle.position.distanceTo(ball.position);
    const ballSpeed = ball.velocity.length();

    if (shouldChase) {
      this.pressure += 0.22 * dt;

      if (distanceToBall > 2.0) {
        this.pressure += 0.18 * dt;
      }

      if (ballSpeed < 2.2) {
        this.pressure -= 0.06 * dt;
      }

      const drain = THREE.MathUtils.clamp(ballSpeed / 12, 0, 1) * 0.06 * dt;
      const sprintDrain = distanceToBall > 2.4 ? 0.055 * dt : 0.02 * dt;

      this.stamina -= drain + sprintDrain;
    } else {
      this.pressure -= 0.16 * dt;
      this.stamina += 0.12 * dt;
    }

    this.pressure = THREE.MathUtils.clamp(this.pressure, 0, 1);
    this.stamina = THREE.MathUtils.clamp(this.stamina, 0.2, 1);
  }

  getReactionDelay(ball, ballSlow) {
    const fatigue = 1 - this.stamina;
    const pressureDelay = this.pressure * 0.025;
    const fatigueDelay = fatigue * 0.05;

    // If the ball is slow, the AI should react faster and walk forward to it.
    const slowBallBonus = ballSlow ? -0.035 : 0;

    return THREE.MathUtils.clamp(
      this.baseReaction + pressureDelay + fatigueDelay + slowBallBonus,
      0.025,
      0.16
    );
  }

  chooseBestMovementTarget(ball, paddle, court) {
    const limits = this.getMovementLimits(court);

    const directTarget = this.getDirectChaseTarget(ball, paddle, court);
    const predictedTarget = this.predictIntercept(ball, paddle, court);

    const ballSlow = ball.velocity.length() < 3.0;
    const ballNearNet = ball.position.z > limits.forwardZ - 0.75 && ball.position.z < 0.6;
    const ballAlreadyOnAISide = ball.position.z < 0;

    let chosen = predictedTarget;

    // Important fix:
    // For slow balls, dinks, and balls near the net, prediction often waits too deep.
    // A human would step forward. So AI directly moves toward the ball position.
    if (ballSlow || ballNearNet || ballAlreadyOnAISide) {
      chosen = directTarget;
      this.lastTargetReason = 'direct-chase';
    } else {
      this.lastTargetReason = 'prediction';
    }

    const fatigue = 1 - this.stamina;
    const pressureMiss = this.pressure * (1 - this.skill);

    const errorX = THREE.MathUtils.randFloatSpread(0.08 + fatigue * 0.16 + pressureMiss * 0.24);
    const errorZ = THREE.MathUtils.randFloatSpread(0.08 + fatigue * 0.16 + pressureMiss * 0.24);

    chosen.x += errorX;
    chosen.z += errorZ;

    chosen.x = THREE.MathUtils.clamp(chosen.x, limits.minX, limits.maxX);
    chosen.z = THREE.MathUtils.clamp(chosen.z, limits.backZ, limits.forwardZ);
    chosen.y = paddle.position.y;

    return chosen;
  }

  getDirectChaseTarget(ball, paddle, court) {
    const limits = this.getMovementLimits(court);

    const target = new THREE.Vector3();

    target.x = ball.position.x;

    // Put paddle slightly behind the ball relative to AI side.
    // If ball is close to net, AI moves forward close to kitchen/net.
    // If ball is deep, AI moves backward.
    target.z = ball.position.z - 0.18;

    // If the ball is still flying and moving toward AI, meet it a bit earlier.
    if (ball.velocity.z < -0.2) {
      target.z = ball.position.z - 0.35;
    }

    // If ball is almost stopped near net, AI should rush forward.
    if (ball.velocity.length() < 2.2 && ball.position.z > limits.forwardZ - 0.9) {
      target.z = ball.position.z - 0.08;
    }

    target.x = THREE.MathUtils.clamp(target.x, limits.minX, limits.maxX);
    target.z = THREE.MathUtils.clamp(target.z, limits.backZ, limits.forwardZ);
    target.y = paddle.position.y;

    return target;
  }

  predictIntercept(ball, paddle, court) {
    const limits = this.getMovementLimits(court);

    const start = ball.position.clone();
    const velocity = ball.velocity.clone();

    const gravity = ball.gravity ?? -7.25;
    const minY = 0.16;

    let bestTarget = new THREE.Vector3(
      THREE.MathUtils.clamp(ball.position.x, limits.minX, limits.maxX),
      paddle.position.y,
      THREE.MathUtils.clamp(ball.position.z, limits.backZ, limits.forwardZ)
    );

    let bestScore = Infinity;

    for (let t = 0.05; t <= 2.4; t += 0.035) {
      const predicted = start.clone().addScaledVector(velocity, t);
      predicted.y += 0.5 * gravity * t * t;

      if (predicted.y < minY) {
        predicted.y = minY;
      }

      // Only target AI side or near-net transition.
      if (predicted.z > 0.65) {
        continue;
      }

      const candidate = new THREE.Vector3(
        THREE.MathUtils.clamp(predicted.x, limits.minX, limits.maxX),
        paddle.position.y,
        THREE.MathUtils.clamp(predicted.z - 0.2, limits.backZ, limits.forwardZ)
      );

      const distance = candidate.distanceTo(paddle.position);

      const staminaSpeed = THREE.MathUtils.lerp(this.baseMaxSpeed * 0.7, this.sprintSpeed, this.stamina);
      const reachableTime = distance / Math.max(staminaSpeed, 0.001);

      const heightPenalty = Math.abs(predicted.y - paddle.position.y) * 0.13;
      const forwardReward = predicted.z > limits.forwardZ - 1.2 ? -0.18 : 0;
      const score = Math.abs(reachableTime - t) + heightPenalty + forwardReward;

      if (reachableTime <= t + 0.22 && score < bestScore) {
        bestScore = score;
        bestTarget.copy(candidate);
      }
    }

    return bestTarget;
  }

  movePaddle(dt, paddle, court) {
    const limits = this.getMovementLimits(court);

    const toTarget = new THREE.Vector3().subVectors(this.target, paddle.position);
    toTarget.y = 0;

    const distance = toTarget.length();

    if (distance < 0.015) {
      this.velocity.multiplyScalar(Math.pow(0.82, dt * 60));
      return;
    }

    const direction = toTarget.normalize();

    const fatigue = 1 - this.stamina;
    const pressureSprint = THREE.MathUtils.clamp(this.pressure, 0, 1);

    const maxSpeed = THREE.MathUtils.lerp(
      this.baseMaxSpeed,
      this.sprintSpeed,
      pressureSprint
    ) * THREE.MathUtils.lerp(0.68, 1.0, this.stamina);

    const desiredSpeed = THREE.MathUtils.clamp(distance * 5.2, 0, maxSpeed);
    const desiredVelocity = direction.multiplyScalar(desiredSpeed);

    const currentSpeed = this.velocity.length();
    const accel = desiredSpeed > currentSpeed ? this.acceleration : this.deceleration;

    this.velocity.lerp(
      desiredVelocity,
      1 - Math.pow(0.001, dt * accel)
    );

    // Human-ish fatigue, but still allows forward/back/side movement.
    const movementFactor = THREE.MathUtils.lerp(0.74, 1.0, 1 - fatigue);

    paddle.position.x += this.velocity.x * dt * movementFactor;
    paddle.position.z += this.velocity.z * dt * movementFactor;

    paddle.position.x = THREE.MathUtils.clamp(paddle.position.x, limits.minX, limits.maxX);
    paddle.position.z = THREE.MathUtils.clamp(paddle.position.z, limits.backZ, limits.forwardZ);
    paddle.position.y = paddle.position.y;
  }

  getShotIntent({ ball, paddle, paddleVelocity, court, contactOffsetX = 0, contactOffsetY = 0 }) {
    const limits = this.getMovementLimits(court);

    const fatigue = 1 - this.stamina;
    const pressure = this.pressure;

    const contactDistance = Math.sqrt(
      contactOffsetX * contactOffsetX +
      contactOffsetY * contactOffsetY
    );

    const contactQuality = THREE.MathUtils.clamp(
      1 - contactDistance * 0.5 - fatigue * 0.18,
      0.22,
      1
    );

    const nearNet = paddle.position.z > limits.forwardZ - 0.85;
    const tired = this.stamina < 0.36;
    const highPressure = pressure > 0.78;

    const wantsSafeLob = tired || highPressure || nearNet;

    const powerBase = wantsSafeLob
      ? THREE.MathUtils.randFloat(0.42, 0.72)
      : THREE.MathUtils.randFloat(0.58, 1.08);

    const power = THREE.MathUtils.clamp(
      powerBase * contactQuality * THREE.MathUtils.lerp(0.78, 1.08, this.stamina),
      0.24,
      1.12
    );

    const targetX = THREE.MathUtils.clamp(
      -paddle.position.x * 0.16 + THREE.MathUtils.randFloatSpread(wantsSafeLob ? 1.4 : 1.9),
      -court.width / 2 + 0.72,
      court.width / 2 - 0.72
    );

    const targetZ = wantsSafeLob
      ? THREE.MathUtils.randFloat(4.7, Math.min(court.halfLength - 0.9, 7.4))
      : THREE.MathUtils.randFloat(5.2, Math.min(court.halfLength - 0.55, 8.0));

    return {
      targetX,
      targetZ,
      power,
      speedBoost: wantsSafeLob ? 0.82 : THREE.MathUtils.randFloat(0.92, 1.1),
      arcBoost: wantsSafeLob ? THREE.MathUtils.randFloat(0.42, 0.78) : THREE.MathUtils.randFloat(0.12, 0.32),
      netSafety: wantsSafeLob ? 0.92 : 0.78,
      contactQuality,
      wantsSafeLob
    };
  }

  recover(dt) {
    this.stamina = THREE.MathUtils.clamp(this.stamina + 0.12 * dt, 0.2, 1);
    this.pressure = THREE.MathUtils.clamp(this.pressure - 0.16 * dt, 0, 1);
  }
}