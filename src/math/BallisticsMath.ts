// src/math/BallisticsMath.ts
import * as THREE from 'three';

export interface BallisticState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  time: number;
}

export class BallisticsMath {
  /**
   * 1ステップ分の物理更新（Semi-implicit Euler法）
   * @param pos 現在位置 (更新される)
   * @param vel 現在速度 (更新される)
   * @param gravity 重力加速度 (m/s^2, 正の値)
   * @param dragCoeff 空気抵抗係数 (k = 0.5 * rho * Cd * A / m)
   * @param dt 経過時間 (秒)
   */
  public static stepEuler(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    gravity: number,
    dragCoeff: number,
    dt: number
  ): void {
    const speed = vel.length();
    
    // 空気抵抗加速度: a_drag = -k * v * |v|
    const dragForce = vel.clone().multiplyScalar(-dragCoeff * speed);

    // 重力加速度: a_gravity = (0, -g, 0)
    const gravityAccel = new THREE.Vector3(0, -gravity, 0);

    // 合計加速度
    const totalAccel = dragForce.add(gravityAccel);

    // 速度更新: v = v + a * dt
    vel.addScaledVector(totalAccel, dt);

    // 位置更新: x = x + v * dt
    pos.addScaledVector(vel, dt);
  }

  /**
   * 空気抵抗を考慮しない場合の水平距離 D と初速 V0 からの着弾時間 t (秒)
   */
  public static getFlightTimeSimple(distance: number, speed: number): number {
    if (speed <= 0.001) return 0;
    return distance / speed;
  }

  /**
   * 着弾時間 t における重力による落下量 (m)
   * ΔY = 0.5 * g * t^2
   */
  public static getBulletDrop(gravity: number, flightTime: number): number {
    return 0.5 * gravity * flightTime * flightTime;
  }

  /**
   * 弾道軌道のサンプリング点を生成（デバッグ描画・着弾予想線用）
   * @param origin 発射点
   * @param direction 発射方向（正規化）
   * @param muzzleVelocity 初速 (m/s)
   * @param gravity 重力加速度 (m/s^2)
   * @param dragCoeff 空気抵抗係数
   * @param maxTime シミュレーション最長時間 (秒)
   * @param timeStep ステップ間隔 (秒)
   */
  public static sampleTrajectory(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    muzzleVelocity: number,
    gravity: number,
    dragCoeff: number,
    maxTime: number = 2.0,
    timeStep: number = 0.02
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [origin.clone()];
    const currentPos = origin.clone();
    const currentVel = direction.clone().normalize().multiplyScalar(muzzleVelocity);

    let elapsedTime = 0;
    while (elapsedTime < maxTime) {
      this.stepEuler(currentPos, currentVel, gravity, dragCoeff, timeStep);
      points.push(currentPos.clone());
      elapsedTime += timeStep;

      // 地面（Y < 0）に落ちたら終了
      if (currentPos.y <= 0) break;
    }

    return points;
  }
}
