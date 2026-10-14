// src/main.ts
import * as THREE from 'three';
import { CameraController } from './core/CameraController.ts';
import { BallisticsEngine } from './core/BallisticsEngine.ts';
import { WeaponController } from './core/WeaponController.ts';
import { AimAssistant } from './core/AimAssistant.ts';
import { NetworkClient } from './core/NetworkClient.ts';
import { TargetDummy } from './entities/TargetDummy.ts';
import { HUD } from './ui/HUD.ts';
import { GUIController } from './ui/GUIController.ts';
import { BallisticsMath } from './math/BallisticsMath.ts';
import { COMBAT_PRESETS } from './presets/CombatPresets.ts';

class GameApp {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private cameraCtrl: CameraController;
  private ballistics: BallisticsEngine;
  private weaponCtrl: WeaponController;
  private aimAssist: AimAssistant;
  private netClient: NetworkClient;
  private hud: HUD;
  private guiCtrl: GUIController;

  // プレイヤー状態
  private playerPos: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private playerVel: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private isGrounded: boolean = true;
  private playerMeshGroup: THREE.Group;

  // 障害物・ターゲット
  private obstacleMeshes: THREE.Object3D[] = [];
  private targetDummies: TargetDummy[] = [];

  // 弾道予測ライン
  private trajectoryLine: THREE.Line;

  // 入力状態
  private keys: Record<string, boolean> = {};
  private isPointerLocked: boolean = false;
  private clock: THREE.Clock = new THREE.Clock();

  constructor() {
    // 1. シーン・カメラ・レンダラー
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121720);
    this.scene.fog = new THREE.FogExp2(0x121720, 0.008);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const container = document.getElementById('canvas-container')!;
    container.appendChild(this.renderer.domElement);

    // 2. モジュール初期化
    this.cameraCtrl = new CameraController(this.camera);
    this.ballistics = new BallisticsEngine(this.scene);
    this.weaponCtrl = new WeaponController(this.cameraCtrl, this.ballistics, 'fortnite_br');
    this.aimAssist = new AimAssistant();
    this.netClient = new NetworkClient(this.scene, this.ballistics);
    this.hud = new HUD();
    this.guiCtrl = new GUIController(this.cameraCtrl, this.weaponCtrl, this.aimAssist);

    // 3. プレイヤービジュアル作成
    this.playerMeshGroup = this.createPlayerVisual();
    this.scene.add(this.playerMeshGroup);

    // 4. 弾道プレビューライン
    const trajGeo = new THREE.BufferGeometry();
    const trajMat = new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.65,
      linewidth: 2
    });
    this.trajectoryLine = new THREE.Line(trajGeo, trajMat);
    this.scene.add(this.trajectoryLine);

    // 5. 環境構築（射撃訓練場）
    this.setupLighting();
    this.setupEnvironment();

    // 6. イベントバインド
    this.setupInputs();
    this.setupCallbacks();

    // 7. マルチプレイヤー接続（バックグラウンドで接続試行）
    this.netClient.connect();

    // リサイズ対応
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // メインループ開始
    this.animate();
  }

  private createPlayerVisual(): THREE.Group {
    const group = new THREE.Group();

    // 体
    const bodyGeo = new THREE.CylinderGeometry(0.32, 0.28, 1.15, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b384e, roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.95;
    body.castShadow = true;
    group.add(body);

    // 頭
    const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xefd1b8, roughness: 0.4 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.7;
    head.castShadow = true;
    group.add(head);

    // 武器
    const gunGeo = new THREE.BoxGeometry(0.08, 0.12, 0.65);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.35, 1.45, 0.3);
    group.add(gun);

    return group;
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x7090b0, 0x203040, 0.6);
    this.scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(50, 80, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 250;
    dirLight.shadow.camera.left = -60;
    dirLight.shadow.camera.right = 60;
    dirLight.shadow.camera.top = 60;
    dirLight.shadow.camera.bottom = -60;
    this.scene.add(dirLight);
  }

  private setupEnvironment(): void {
    // 地面（グリッド調）
    const floorGeo = new THREE.PlaneGeometry(300, 300, 60, 60);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a212d,
      roughness: 0.8,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.obstacleMeshes.push(floor);
    this.ballistics.colliders.push(floor);

    // グリッドヘルパー
    const grid = new THREE.GridHelper(300, 60, 0x00ffcc, 0x2c3b52);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // 距離マーカー板・ターゲットダミーの配置
    const ranges = [
      { dist: 15, speed: 3.0, type: 'patrol_x' as const },
      { dist: 30, speed: 4.5, type: 'patrol_x' as const },
      { dist: 50, speed: 6.0, type: 'patrol_x' as const },   // 高速移動ダミー（偏差検証に最適）
      { dist: 80, speed: 3.5, type: 'patrol_z' as const },
      { dist: 120, speed: 0, type: 'stationary' as const }   // 遠距離長距離ダミー
    ];

    ranges.forEach((r, idx) => {
      // 距離表示板
      this.createDistanceSign(r.dist);

      // 移動ダミー
      const dummy = new TargetDummy(
        `dummy_${idx}`,
        new THREE.Vector3((idx % 2 === 0 ? -2 : 2) * (idx + 1), 0, r.dist),
        r.type,
        r.speed
      );
      this.targetDummies.push(dummy);
      this.scene.add(dummy.group);
      this.ballistics.colliders.push(...dummy.colliders);
    });

    // 遮蔽物（コンテナ・壁）
    this.createCoverBox(new THREE.Vector3(-6, 1.5, 20), new THREE.Vector3(4, 3, 1), 0x884433);
    this.createCoverBox(new THREE.Vector3(6, 1.5, 25), new THREE.Vector3(5, 3, 1), 0x335588);
    this.createCoverBox(new THREE.Vector3(0, 1.0, 12), new THREE.Vector3(6, 2, 1), 0x556677);

    // 遮蔽物の裏から頭だけ出しているダミー（視線判定テスト用）
    const coverDummy = new TargetDummy('dummy_cover', new THREE.Vector3(-6, 0, 22), 'stationary', 0);
    this.targetDummies.push(coverDummy);
    this.scene.add(coverDummy.group);
    this.ballistics.colliders.push(...coverDummy.colliders);
  }

  private createDistanceSign(distance: number): void {
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(-10, 1.25, distance);
    pole.castShadow = true;
    this.scene.add(pole);

    // 看板
    const boardGeo = new THREE.BoxGeometry(2.5, 1.2, 0.1);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x223344 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(-10, 2.2, distance);
    board.castShadow = true;
    this.scene.add(board);
  }

  private createCoverBox(pos: THREE.Vector3, size: THREE.Vector3, colorHex: number): void {
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.obstacleMeshes.push(mesh);
    this.ballistics.colliders.push(mesh);
  }

  private setupCallbacks(): void {
    // 弾丸着弾イベントコールバック
    this.ballistics.onHit = (result) => {
      this.hud.showHitmarker(result.isFatal || false);

      // ダメージ数値を3D空間からスクリーン座標に投影してポップアップ
      const screenPos = result.point.clone().project(this.camera);
      const isHeadshot = result.bone === 'head';
      if (screenPos.z < 1.0) {
        this.hud.showDamagePopup(
          result.damage,
          isHeadshot,
          new THREE.Vector2(screenPos.x * 0.5 + 0.5, -screenPos.y * 0.5 + 0.5)
        );
      }
    };

    // 射撃イベントのネットワーク送信
    this.weaponCtrl.onShoot = (muzzlePos, direction, preset) => {
      this.netClient.sendShoot(
        muzzlePos,
        direction,
        preset.id,
        preset.mode === 'hitscan'
      );
    };
  }

  private setupInputs(): void {
    const blocker = document.getElementById('blocker')!;

    blocker.addEventListener('click', () => {
      document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === document.body) {
        this.isPointerLocked = true;
        blocker.style.display = 'none';
      } else {
        this.isPointerLocked = false;
        blocker.style.display = 'flex';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      this.cameraCtrl.onMouseMove(e.movementX, e.movementY);
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked) return;
      if (e.button === 0) {
        // 左クリック: 射撃
        this.weaponCtrl.setFiring(true);
      } else if (e.button === 2) {
        // 右クリック: ADS (ズームエイム)
        this.cameraCtrl.setAiming(true);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.weaponCtrl.setFiring(false);
      } else if (e.button === 2) {
        this.cameraCtrl.setAiming(false);
      }
    });

    // 右クリックのコンテキストメニュー抑制
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // キーボード操作
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      // 視点切り替え (V)
      if (e.code === 'KeyV') {
        this.cameraCtrl.toggleViewMode();
        this.guiCtrl.syncGUIValues();
      }

      // エイムアシスト ON/OFF (C)
      if (e.code === 'KeyC') {
        this.aimAssist.enabled = !this.aimAssist.enabled;
        this.guiCtrl.syncGUIValues();
      }

      // プリセット切替 (1, 2, 3)
      if (e.code === 'Digit1') {
        this.weaponCtrl.switchPreset('fortnite_br');
        this.guiCtrl.syncGUIValues();
      } else if (e.code === 'Digit2') {
        this.weaponCtrl.switchPreset('delta_tactical');
        this.guiCtrl.syncGUIValues();
      } else if (e.code === 'Digit3') {
        this.weaponCtrl.switchPreset('arcade_hitscan');
        this.guiCtrl.syncGUIValues();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  private updatePlayerMovement(dt: number): void {
    const moveSpeed = this.keys['ShiftLeft'] ? 9.0 : 5.5; // ダッシュ対応
    const inputVec = new THREE.Vector3(0, 0, 0);

    if (this.keys['KeyW']) inputVec.z += 1;
    if (this.keys['KeyS']) inputVec.z -= 1;
    if (this.keys['KeyA']) inputVec.x += 1;
    if (this.keys['KeyD']) inputVec.x -= 1;

    if (inputVec.lengthSq() > 0) {
      inputVec.normalize();

      // カメラのYaw角に合わせて移動方向を回転
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraCtrl.yaw);
      const moveDir = inputVec.applyQuaternion(qYaw);

      this.playerVel.x = moveDir.x * moveSpeed;
      this.playerVel.z = moveDir.z * moveSpeed;
    } else {
      // 減速摩擦
      this.playerVel.x *= Math.max(0, 1.0 - 15.0 * dt);
      this.playerVel.z *= Math.max(0, 1.0 - 15.0 * dt);
    }

    // ジャンプ (Space)
    if (this.keys['Space'] && this.isGrounded) {
      this.playerVel.y = 6.5;
      this.isGrounded = false;
    }

    // 重力
    if (!this.isGrounded) {
      this.playerVel.y -= 19.6 * dt;
    }

    // 位置更新
    this.playerPos.addScaledVector(this.playerVel, dt);

    // 地面接地判定
    if (this.playerPos.y <= 0) {
      this.playerPos.y = 0;
      this.playerVel.y = 0;
      this.isGrounded = true;
    }

    // プレイヤーメッシュの位置・向き同期
    this.playerMeshGroup.position.copy(this.playerPos);
    this.playerMeshGroup.rotation.y = this.cameraCtrl.yaw;

    // FPS時は自キャラメッシュを非表示にして視界をクリアに
    this.playerMeshGroup.visible = (this.cameraCtrl.mode === 'tps');
  }

  private updateTrajectoryPreview(): void {
    if (!this.guiCtrl.showTrajectoryLine || this.weaponCtrl.currentPreset.mode === 'hitscan') {
      this.trajectoryLine.visible = false;
      return;
    }

    this.trajectoryLine.visible = true;
    const muzzlePos = this.weaponCtrl.getMuzzleWorldPosition(this.playerPos);
    const fireDir = this.cameraCtrl.calculateParallaxCorrectedDirection(muzzlePos, this.obstacleMeshes);

    const points = BallisticsMath.sampleTrajectory(
      muzzlePos,
      fireDir,
      this.weaponCtrl.currentPreset.muzzleVelocity,
      this.weaponCtrl.currentPreset.gravity,
      this.weaponCtrl.currentPreset.dragCoefficient,
      2.0,
      0.03
    );

    this.trajectoryLine.geometry.setFromPoints(points);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);

    // 1. プレイヤー物理移動
    this.updatePlayerMovement(dt);

    // 2. ダミーの更新
    for (const dummy of this.targetDummies) {
      dummy.update(dt);
    }

    // 3. 銃口位置の算出
    const muzzlePos = this.weaponCtrl.getMuzzleWorldPosition(this.playerPos);

    // 4. エイムアシスト・索敵・偏差計算
    this.aimAssist.findBestTarget(
      this.cameraCtrl,
      this.targetDummies,
      this.obstacleMeshes,
      this.weaponCtrl.currentPreset,
      muzzlePos
    );

    // ADS中または射撃中かつアシスト有効なら吸い付き補正
    if (this.cameraCtrl.isAiming || this.keys['KeyC']) {
      this.aimAssist.applyAimCorrection(this.cameraCtrl, dt);
    }

    // 5. カメラ更新（パララックス自動補正レイキャスト含む）
    this.cameraCtrl.update(this.playerPos, dt);
    this.cameraCtrl.calculateParallaxCorrectedDirection(muzzlePos, this.obstacleMeshes);

    // 6. 武器・射撃制御（連射・反動リカバリー）
    this.weaponCtrl.update(this.playerPos, this.obstacleMeshes, dt);

    // 7. 弾道物理シミュレーション (CCD更新)
    this.ballistics.update(dt);

    // 8. 弾道予測ライン更新
    this.updateTrajectoryPreview();

    // 9. ネットワーク同期（他プレイヤー更新 & 自身の座標送信）
    this.netClient.update(dt);
    this.netClient.sendUpdate(
      this.playerPos,
      this.playerVel,
      this.cameraCtrl.yaw,
      this.cameraCtrl.pitch,
      this.cameraCtrl.isAiming,
      this.weaponCtrl.currentPreset.id
    );

    // 10. HUD更新
    this.hud.updateWeaponInfo(
      this.weaponCtrl.currentPreset,
      this.cameraCtrl.mode,
      this.cameraCtrl.isAiming,
      this.aimAssist.enabled
    );
    this.hud.setMuzzleBlocked(this.cameraCtrl.isMuzzleBlocked);
    this.hud.updateLeadMarker(
      this.aimAssist.hasLeadMarker ? this.aimAssist.leadScreenPos : null,
      this.aimAssist.hasLeadMarker && this.weaponCtrl.currentPreset.showLeadMarker
    );

    // 11. レンダリング
    this.renderer.render(this.scene, this.camera);
  };
}

// アプリケーション起動
window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
