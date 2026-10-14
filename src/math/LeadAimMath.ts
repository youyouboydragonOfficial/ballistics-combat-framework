// src/math/LeadAimMath.ts
import * as THREE from 'three';
import { BallisticsMath } from './BallisticsMath.ts';

export interface LeadPredictionResult {
  canIntercept: boolean;
  interceptTime: number;         // 着弾予測時間 (秒)
  leadPosition: THREE.Vector3;    // 照準すべき3D目標点 (偏差+重力迎角補正済み)
  aimDirection: THREE.Vector3;    // 発射すべき正規化ベクトル
  distance: number;              // 射撃点から目標までの距離 (m)
  dropCompensation: number;      // 上方向に加算した重力落下相殺量 (m)
}

export class LeadAimMath {
  /**
   * 移動するターゲットに対する偏差射撃（リードエイム）と重力迎角補正を計算する
   * 
   * @param muzzlePos 発射地点 (銃口位置)
   * @param targetPos ターゲットの現在の位置 (狙うボーン: 頭部 or 胸部)
   * @param targetVel ターゲットの現在の移動速度ベクトル (m/s)
   * @param projectileSpeed 弾速 (m/s)
   * @param gravity 重力加速度 (m/s^2)
   * @param dragCoeff 空気抵抗係数
   * @returns LeadPredictionResult
   */
  public static calculateLeadTarget(
    muzzlePos: THREE.Vector3,
    targetPos: THREE.Vector3,
    targetVel: THREE.Vector3,
    projectileSpeed: number,
    gravity: number = 9.81,
    dragCoeff: number = 0.0
  ): LeadPredictionResult {
    const toTarget = new THREE.Vector3().subVectors(targetPos, muzzlePos);
    const distance = toTarget.length();

    // 弾速が異常に小さい、またはゼロ除算防止
    if (projectileSpeed <= 0.1) {
      return {
        canIntercept: false,
        interceptTime: 0,
        leadPosition: targetPos.clone(),
        aimDirection: toTarget.clone().normalize(),
        distance,
        dropCompensation: 0
      };
    }

    // --- ステップ1: 二次方程式による迎撃時間の算出 ---
    // |R + V_t * t|^2 = (V_b * t)^2
    // a * t^2 + b * t + c = 0
    // a = |V_t|^2 - V_b^2
    // b = 2 * (R · V_t)
    // c = |R|^2
    const targetSpeedSq = targetVel.lengthSq();
    const projSpeedSq = projectileSpeed * projectileSpeed;

    const a = targetSpeedSq - projSpeedSq;
    const b = 2 * toTarget.dot(targetVel);
    const c = toTarget.lengthSq();

    let interceptTime = -1;

    // a がほぼ 0 の場合 (ターゲット速度 == 弾速) -> 一次方程式 b * t + c = 0
    if (Math.abs(a) < 1e-6) {
      if (Math.abs(b) > 1e-6) {
        const t = -c / b;
        if (t > 0) interceptTime = t;
      }
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const sqrtDisc = Math.sqrt(discriminant);
        const t1 = (-b - sqrtDisc) / (2 * a);
        const t2 = (-b + sqrtDisc) / (2 * a);

        if (t1 > 0 && t2 > 0) {
          interceptTime = Math.min(t1, t2);
        } else if (t1 > 0) {
          interceptTime = t1;
        } else if (t2 > 0) {
          interceptTime = t2;
        }
      }
    }

    // 解が見つからない場合（ターゲットが遠ざかり弾が追いつかない等）
    // 近似として直線距離 / 弾速 を採用
    let canIntercept = true;
    if (interceptTime <= 0 || !isFinite(interceptTime)) {
      canIntercept = false;
      interceptTime = distance / projectileSpeed;
    }

    // --- ステップ2: 空気抵抗がある場合の反復補正 (Newton-Raphson近似) ---
    if (dragCoeff > 0.0001 && canIntercept) {
      // 空気抵抗により弾速は指数的または二乗的に減衰する: v(t) = v0 / (1 + k*v0*t)
      // 平均速度 v_avg < v0 となるため、飛行時間は延びる
      for (let iter = 0; iter < 2; iter++) {
        const predictedPos = new THREE.Vector3().copy(targetPos).addScaledVector(targetVel, interceptTime);
        const currentDist = predictedPos.distanceTo(muzzlePos);
        // ドラッグによる平均弾速の低下率
        const dragFactor = 1.0 + 0.5 * dragCoeff * projectileSpeed * interceptTime;
        const effectiveSpeed = Math.max(projectileSpeed / dragFactor, 10.0);
        interceptTime = currentDist / effectiveSpeed;
      }
    }

    // --- ステップ3: ターゲットの未来位置を計算 ---
    // P_future = P_target + V_target * t
    const futureTargetPos = new THREE.Vector3().copy(targetPos).addScaledVector(targetVel, interceptTime);

    // --- ステップ4: 弾丸の重力落下分を相殺する迎角補正 (Bullet Drop Compensation) ---
    // 弾丸は発射後 t 秒で ΔY = 0.5 * g * t^2 落下する。
    // 着弾時にちょうど目標高度になるよう、目標位置を上方に +ΔY オフセットする。
    const dropCompensation = BallisticsMath.getBulletDrop(gravity, interceptTime);
    const leadPosition = futureTargetPos.clone();
    leadPosition.y += dropCompensation;

    // 発射方向ベクトル
    const aimDirection = new THREE.Vector3().subVectors(leadPosition, muzzlePos).normalize();

    return {
      canIntercept,
      interceptTime,
      leadPosition,
      aimDirection,
      distance,
      dropCompensation
    };
  }
}
