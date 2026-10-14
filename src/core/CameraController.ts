// src/core/CameraController.ts
import * as THREE from 'three';

export interface CameraOffsetConfig {
  tpsNormal: THREE.Vector3;
  tpsAds: THREE.Vector3;
  fpsNormal: THREE.Vector3;
  fpsAds: THREE.Vector3;
}

export class CameraController {
  public camera: THREE.PerspectiveCamera;
  public mode: 'tps' | 'fps' = 'tps';
  public isAiming: boolean = false;

  // 回転角 (ラジアン)
  public yaw: number = 0;
  public pitch: number = 0;

  // 感度
  public mouseSensitivity: number = 0.0022;

  // FOV設定
  public defaultFov: number = 75;
  public adsFov: number = 50;
  public currentFov: number = 75;

  // カメラオフセット (ローカル空間: x=右, y=上, z=後方)
  public offsets: CameraOffsetConfig = {
    tpsNormal: new THREE.Vector3(0.55, 1.7, 2.4),
    tpsAds: new THREE.Vector3(0.42, 1.62, 1.4),
    fpsNormal: new THREE.Vector3(0, 1.65, 0.0),
    fpsAds: new THREE.Vector3(0, 1.65, -0.15)
  };

  private currentOffset: THREE.Vector3 = new THREE.Vector3();
  private targetOffset: THREE.Vector3 = new THREE.Vector3();

  // パララックス判定用
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  public isMuzzleBlocked: boolean = false;
  public aimPoint: THREE.Vector3 = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.currentOffset.copy(this.offsets.tpsNormal);
    this.targetOffset.copy(this.offsets.tpsNormal);
  }

  /**
   * マウス移動による視点回転（PointerLockから呼び出し）
   */
  public onMouseMove(movementX: number, movementY: number): void {
    // ADS時は感度を下げる
    const sensFactor = this.isAiming ? 0.6 : 1.0;
    this.yaw -= movementX * this.mouseSensitivity * sensFactor;
    this.pitch -= movementY * this.mouseSensitivity * sensFactor;

    // Pitch（上下角）の制限 (-89度 〜 +89度)
    const maxPitch = (Math.PI / 2) - 0.02;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
  }

  /**
   * TPS/FPSモード切り替え
   */
  public toggleViewMode(): void {
    this.mode = this.mode === 'tps' ? 'fps' : 'tps';
  }

  public setViewMode(mode: 'tps' | 'fps'): void {
    this.mode = mode;
  }

  public setAiming(aiming: boolean): void {
    this.isAiming = aiming;
  }

  /**
   * 毎フレームのカメラ位置・回転・FOV補間
   * @param playerPos プレイヤーの原点位置 (足元)
   * @param dt 経過時間 (秒)
   */
  public update(playerPos: THREE.Vector3, dt: number): void {
    // 1. 目標オフセットの決定
    if (this.mode === 'tps') {
      this.targetOffset.copy(this.isAiming ? this.offsets.tpsAds : this.offsets.tpsNormal);
    } else {
      this.targetOffset.copy(this.isAiming ? this.offsets.fpsAds : this.offsets.fpsNormal);
    }

    // オフセットのスムーズ補間
    const lerpSpeed = 14.0 * dt;
    this.currentOffset.lerp(this.targetOffset, Math.min(lerpSpeed, 1.0));

    // FOVのスムーズ補間
    const targetFov = this.isAiming ? this.adsFov : this.defaultFov;
    this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, Math.min(lerpSpeed, 1.0));
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    // 2. 回転クォータニオンの計算
    // 水平回転 (Yaw) -> 垂直回転 (Pitch)
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
    const cameraRotation = new THREE.Quaternion().multiplyQuaternions(qYaw, qPitch);

    this.camera.quaternion.copy(cameraRotation);

    // 3. ローカルオフセットをワールド空間に回転してプレイヤー位置に加算
    const rotatedOffset = this.currentOffset.clone().applyQuaternion(qYaw);
    this.camera.position.copy(playerPos).add(rotatedOffset);
  }

  /**
   * パララックス（視差）自動補正レイキャスト処理
   * 
   * TPSではカメラ（肩越し）と銃口の位置が離れているため、
   * 画面中央（レティクル）が見ている3D空間の目標点に向かって銃口から弾を飛ばす補正を行う。
   * 
   * @param muzzlePos 銃口のワールド座標
   * @param obstacleMeshes 衝突判定対象（壁やダミー）
   * @param maxRange 最大射程距離 (m)
   * @returns 補正された発射方向ベクトル (正規化済み)
   */
  public calculateParallaxCorrectedDirection(
    muzzlePos: THREE.Vector3,
    obstacleMeshes: THREE.Object3D[],
    maxRange: number = 300
  ): THREE.Vector3 {
    // 1. カメラの前方ベクトルを取得
    const cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(cameraForward);

    // 2. 画面中央からのRaycast（視線の注視点を求める）
    this.raycaster.set(this.camera.position, cameraForward);
    this.raycaster.far = maxRange;
    const intersects = this.raycaster.intersectObjects(obstacleMeshes, true);

    let hitPoint: THREE.Vector3;
    if (intersects.length > 0) {
      hitPoint = intersects[0].point;
    } else {
      // 障害物に当たらなかった場合は遠方の無限遠点
      hitPoint = this.camera.position.clone().addScaledVector(cameraForward, maxRange);
    }

    this.aimPoint.copy(hitPoint);

    // 3. 銃口から注視点への補正ベクトル
    const correctedDir = new THREE.Vector3().subVectors(hitPoint, muzzlePos).normalize();

    // 4. 遮蔽物めり込みチェック（銃口から注視点の間に壁がないか）
    const muzzleToHitDist = muzzlePos.distanceTo(hitPoint);
    this.raycaster.set(muzzlePos, correctedDir);
    this.raycaster.far = muzzleToHitDist;
    const muzzleIntersects = this.raycaster.intersectObjects(obstacleMeshes, true);

    // 注視点の手前で何かに当たったら銃口がブロックされている
    this.isMuzzleBlocked = (muzzleIntersects.length > 0 && muzzleIntersects[0].distance < (muzzleToHitDist - 0.2));

    return correctedDir;
  }

  /**
   * カメラの前方ベクトルを取得
   */
  public getForward(): THREE.Vector3 {
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    return fwd;
  }
}
