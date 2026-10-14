// src/core/WeaponController.ts
import * as THREE from 'three';
import { CameraController } from './CameraController.ts';
import { BallisticsEngine } from './BallisticsEngine.ts';
import { CombatPreset, COMBAT_PRESETS } from '../presets/CombatPresets.ts';

export type ShootCallback = (
  muzzlePos: THREE.Vector3,
  direction: THREE.Vector3,
  preset: CombatPreset
) => void;

export class WeaponController {
  public currentPreset: CombatPreset;
  private cameraCtrl: CameraController;
  private ballistics: BallisticsEngine;

  // 射撃状態
  private isFiring: boolean = false;
  private lastFireTime: number = 0;

  // リコイル制御
  private currentRecoilPitch: number = 0;
  private currentRecoilYaw: number = 0;
  private recoilRecoverySpeed: number = 5.0;

  // 銃口ローカルオフセット（プレイヤー原点基準: 右手・腰だめ/ADS位置）
  public muzzleOffsetTps: THREE.Vector3 = new THREE.Vector3(0.35, 1.45, 0.4);
  public muzzleOffsetFps: THREE.Vector3 = new THREE.Vector3(0.18, 1.48, 0.45);

  public onShoot: ShootCallback | null = null;

  constructor(
    cameraCtrl: CameraController,
    ballistics: BallisticsEngine,
    initialPresetId: string = 'fortnite_br'
  ) {
    this.cameraCtrl = cameraCtrl;
    this.ballistics = ballistics;
    this.currentPreset = { ...COMBAT_PRESETS[initialPresetId] };
  }

  /**
   * プリセットの切り替え
   */
  public switchPreset(presetId: string): void {
    if (COMBAT_PRESETS[presetId]) {
      this.currentPreset = { ...COMBAT_PRESETS[presetId] };
      this.cameraCtrl.setViewMode(this.currentPreset.cameraMode);
      this.cameraCtrl.defaultFov = this.currentPreset.defaultFov;
      this.cameraCtrl.adsFov = this.currentPreset.adsFov;
    }
  }

  /**
   * トリガーのON/OFF
   */
  public setFiring(firing: boolean): void {
    this.isFiring = firing;
  }

  /**
   * 銃口のワールド座標を計算
   */
  public getMuzzleWorldPosition(playerPos: THREE.Vector3): THREE.Vector3 {
    const isFps = this.cameraCtrl.mode === 'fps';
    const baseOffset = isFps ? this.muzzleOffsetFps : this.muzzleOffsetTps;

    // プレイヤーの水平回転 (Yaw) に合わせてオフセットを回転
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraCtrl.yaw);
    const worldOffset = baseOffset.clone().applyQuaternion(qYaw);

    return playerPos.clone().add(worldOffset);
  }

  /**
   * 毎フレームの更新（連射チェック、リコイル回復）
   */
  public update(playerPos: THREE.Vector3, obstacleMeshes: THREE.Object3D[], dt: number): void {
    const now = performance.now() / 1000;
    const fireInterval = 60.0 / this.currentPreset.fireRate;

    // トリガーが引かれていて発射間隔を満たしていれば発射
    if (this.isFiring && (now - this.lastFireTime >= fireInterval)) {
      this.fireOnce(playerPos, obstacleMeshes);
      this.lastFireTime = now;
    }

    // リコイルのリカバリー（カメラの戻り）
    if (Math.abs(this.currentRecoilPitch) > 0.0001 || Math.abs(this.currentRecoilYaw) > 0.0001) {
      const recFactor = Math.min(this.recoilRecoverySpeed * dt, 1.0);
      const pitchRec = this.currentRecoilPitch * recFactor;
      const yawRec = this.currentRecoilYaw * recFactor;

      this.cameraCtrl.pitch -= pitchRec;
      this.cameraCtrl.yaw -= yawRec;

      this.currentRecoilPitch -= pitchRec;
      this.currentRecoilYaw -= yawRec;
    }
  }

  /**
   * 単発射撃処理
   */
  private fireOnce(playerPos: THREE.Vector3, obstacleMeshes: THREE.Object3D[]): void {
    const muzzlePos = this.getMuzzleWorldPosition(playerPos);

    // 1. パララックス補正された基準方向ベクトルを取得
    let fireDir = this.cameraCtrl.calculateParallaxCorrectedDirection(muzzlePos, obstacleMeshes);

    // 2. 弾の拡散（Spread / Bloom）の適用
    const spread = this.cameraCtrl.isAiming ? this.currentPreset.spread * 0.4 : this.currentPreset.spread;
    if (spread > 0) {
      const spreadAngle = (Math.random() - 0.5) * spread;
      const spreadPitch = (Math.random() - 0.5) * spread;
      const qSpread = new THREE.Quaternion().setFromEuler(new THREE.Euler(spreadPitch, spreadAngle, 0, 'YXZ'));
      fireDir.applyQuaternion(qSpread).normalize();
    }

    // 3. 弾道エンジンへ射撃命令
    const isHitscan = this.currentPreset.mode === 'hitscan';
    this.ballistics.fire(
      muzzlePos,
      fireDir,
      isHitscan,
      this.currentPreset.muzzleVelocity,
      this.currentPreset.gravity,
      this.currentPreset.dragCoefficient,
      this.currentPreset.damageHead,
      this.currentPreset.damageBody,
      this.currentPreset.tracerColor
    );

    // 4. リコイル（反動キック）の適用
    const recoilP = this.currentPreset.recoilPitch * (0.8 + Math.random() * 0.4);
    const recoilY = (Math.random() - 0.5) * this.currentPreset.recoilYaw;

    this.cameraCtrl.pitch += recoilP;
    this.cameraCtrl.yaw += recoilY;
    this.currentRecoilPitch += recoilP;
    this.currentRecoilYaw += recoilY;

    // 5. ネットワーク送信等のコールバック
    if (this.onShoot) {
      this.onShoot(muzzlePos, fireDir, this.currentPreset);
    }
  }
}
