// src/core/AimAssistant.ts
import * as THREE from 'three';
import { CameraController } from './CameraController.ts';
import { TargetDummy } from '../entities/TargetDummy.ts';
import { LeadAimMath, LeadPredictionResult } from '../math/LeadAimMath.ts';
import { CombatPreset } from '../presets/CombatPresets.ts';

export interface AimAssistTarget {
  dummy: TargetDummy;
  bone: 'head' | 'chest';
  worldPosition: THREE.Vector3;
  screenAngleDeg: number;       // 画面中央レティクルからの角度差 (度)
  prediction: LeadPredictionResult;
}

export class AimAssistant {
  public enabled: boolean = true;
  public instantLock: boolean = false;       // true: 瞬時スナップ, false: スムーズ吸い付き
  public aimBone: 'head' | 'chest' = 'head'; // 優先部位
  public assistFov: number = 16.0;           // 索敵コーン角度 (度)
  public smoothStrength: number = 0.4;       // スムージング補間速度係数 (0.05 ~ 1.0)
  public prioritizeClosestCrosshair: boolean = true;

  public currentLockedTarget: AimAssistTarget | null = null;
  public leadScreenPos: THREE.Vector2 = new THREE.Vector2(-999, -999);
  public hasLeadMarker: boolean = false;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  /**
   * 索敵・遮蔽物判定・偏差計算を行い、最適なターゲットを選定する
   * 
   * @param cameraCtrl カメラコントローラー
   * @param targets ターゲットダミー配列
   * @param obstacleMeshes 障害物メッシュ（遮蔽物判定用）
   * @param preset 現在の武器設定
   * @param muzzlePos 銃口位置
   */
  public findBestTarget(
    cameraCtrl: CameraController,
    targets: TargetDummy[],
    obstacleMeshes: THREE.Object3D[],
    preset: CombatPreset,
    muzzlePos: THREE.Vector3
  ): AimAssistTarget | null {
    if (!this.enabled || targets.length === 0) {
      this.currentLockedTarget = null;
      this.hasLeadMarker = false;
      return null;
    }

    const camera = cameraCtrl.camera;
    const cameraPos = camera.position;
    const cameraForward = cameraCtrl.getForward();

    let bestTarget: AimAssistTarget | null = null;
    let minAngle = this.assistFov;

    for (const dummy of targets) {
      if (dummy.health <= 0) continue;

      const targetPos = this.aimBone === 'head' 
        ? dummy.getHeadWorldPosition() 
        : dummy.getChestWorldPosition();

      // 1. レティクル方向となす角度の計算
      const toTarget = new THREE.Vector3().subVectors(targetPos, cameraPos).normalize();
      const dot = Math.max(-1, Math.min(1, cameraForward.dot(toTarget)));
      const angleRad = Math.acos(dot);
      const angleDeg = THREE.MathUtils.radToDeg(angleRad);

      // FOV外ならスキップ
      if (angleDeg > minAngle) continue;

      // 2. 視線（Line of Sight）遮蔽物チェック
      const distToTarget = cameraPos.distanceTo(targetPos);
      this.raycaster.set(cameraPos, toTarget);
      this.raycaster.far = distToTarget;

      const hitObstacles = this.raycaster.intersectObjects(obstacleMeshes, true);
      // ターゲットの手前に壁があれば遮蔽されている
      if (hitObstacles.length > 0 && hitObstacles[0].distance < (distToTarget - 0.3)) {
        continue;
      }

      // 3. 偏差射撃・迎角計算 (LeadAimMath)
      const isHitscan = preset.mode === 'hitscan';
      const speed = isHitscan ? 999999 : preset.muzzleVelocity;
      const gravity = isHitscan ? 0 : preset.gravity;
      const drag = isHitscan ? 0 : preset.dragCoefficient;

      const prediction = LeadAimMath.calculateLeadTarget(
        muzzlePos,
        targetPos,
        dummy.velocity,
        speed,
        gravity,
        drag
      );

      bestTarget = {
        dummy,
        bone: this.aimBone,
        worldPosition: targetPos,
        screenAngleDeg: angleDeg,
        prediction
      };
      minAngle = angleDeg;
    }

    this.currentLockedTarget = bestTarget;
    return bestTarget;
  }

  /**
   * エイムアシストのカメラ回転適用（毎フレーム更新）
   * @param cameraCtrl カメラコントローラー
   * @param dt 経過時間
   */
  public applyAimCorrection(cameraCtrl: CameraController, dt: number): void {
    if (!this.enabled || !this.currentLockedTarget) {
      this.hasLeadMarker = false;
      return;
    }

    const target = this.currentLockedTarget;
    const camera = cameraCtrl.camera;

    // 照準すべき目標点 (偏差射撃位置)
    const aimWorldPoint = target.prediction.leadPosition;

    // カメラ位置から照準目標点への方向ベクトル
    const aimDir = new THREE.Vector3().subVectors(aimWorldPoint, camera.position).normalize();

    // 目標の Yaw / Pitch を計算
    const targetYaw = Math.atan2(-aimDir.x, -aimDir.z);
    const targetPitch = Math.asin(Math.max(-1, Math.min(1, aimDir.y)));

    if (this.instantLock) {
      // 瞬間ロック (スナップ)
      cameraCtrl.yaw = targetYaw;
      cameraCtrl.pitch = targetPitch;
    } else {
      // スムージング吸い付き (Lerp / Slerp 的な角度補間)
      // 角度の最短回転差分 (-PI ~ PI) を考慮
      let diffYaw = targetYaw - cameraCtrl.yaw;
      while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
      while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;

      const diffPitch = targetPitch - cameraCtrl.pitch;

      const t = Math.min(this.smoothStrength * 25.0 * dt, 1.0);
      cameraCtrl.yaw += diffYaw * t;
      cameraCtrl.pitch += diffPitch * t;
    }

    // スクリーン投影マーカー座標の計算 (HUD表示用)
    const projected = aimWorldPoint.clone().project(camera);
    // カメラの背後にある場合は表示しない
    if (projected.z < 1.0) {
      // 正規化デバイス座標 (-1 ~ 1) をスクリーン座標 (0 ~ 1) に変換
      this.leadScreenPos.set(
        (projected.x * 0.5 + 0.5),
        (-projected.y * 0.5 + 0.5)
      );
      this.hasLeadMarker = true;
    } else {
      this.hasLeadMarker = false;
    }
  }
}
