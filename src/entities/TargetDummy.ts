// src/entities/TargetDummy.ts
import * as THREE from 'three';

export interface DummyHitResult {
  bone: 'head' | 'chest' | 'body';
  damage: number;
  isFatal: boolean;
  position: THREE.Vector3;
}

export class TargetDummy {
  public id: string;
  public group: THREE.Group;
  public headMesh: THREE.Mesh;
  public bodyMesh: THREE.Mesh;
  
  public position: THREE.Vector3 = new THREE.Vector3();
  public velocity: THREE.Vector3 = new THREE.Vector3();

  public health: number = 100;
  public maxHealth: number = 100;

  // 移動パラメータ
  public moveSpeed: number = 3.5; // m/s (走る速度)
  public moveRange: number = 8.0;
  private startPosition: THREE.Vector3;
  private moveDirection: number = 1;
  public movementType: 'patrol_x' | 'patrol_z' | 'stationary' = 'patrol_x';

  // コライダーリスト（Raycast用）
  public colliders: THREE.Object3D[] = [];

  constructor(id: string, initialPos: THREE.Vector3, movementType: 'patrol_x' | 'patrol_z' | 'stationary' = 'patrol_x', speed: number = 3.5) {
    this.id = id;
    this.position.copy(initialPos);
    this.startPosition = initialPos.clone();
    this.movementType = movementType;
    this.moveSpeed = speed;

    this.group = new THREE.Group();
    this.group.position.copy(initialPos);

    // ボディメッシュ作成
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.25, 1.1, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3366cc,
      roughness: 0.5,
      metalness: 0.1
    });
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = 0.95;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.bodyMesh.userData = { dummy: this, bone: 'chest' };
    this.group.add(this.bodyMesh);
    this.colliders.push(this.bodyMesh);

    // ヘッドメッシュ作成
    const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xff4444, // 赤色のヘッドで狙いやすく
      roughness: 0.3,
      metalness: 0.2
    });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.position.y = 1.7;
    this.headMesh.castShadow = true;
    this.headMesh.receiveShadow = true;
    this.headMesh.userData = { dummy: this, bone: 'head' };
    this.group.add(this.headMesh);
    this.colliders.push(this.headMesh);

    // 足元の台座
    const baseGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.1, 16);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.05;
    this.group.add(base);
  }

  /**
   * ダミーの移動更新
   */
  public update(dt: number): void {
    if (this.movementType === 'stationary') {
      this.velocity.set(0, 0, 0);
      return;
    }

    if (this.movementType === 'patrol_x') {
      const offsetX = this.position.x - this.startPosition.x;
      if (Math.abs(offsetX) > this.moveRange) {
        this.moveDirection = -Math.sign(offsetX);
      }
      this.velocity.set(this.moveDirection * this.moveSpeed, 0, 0);
    } else if (this.movementType === 'patrol_z') {
      const offsetZ = this.position.z - this.startPosition.z;
      if (Math.abs(offsetZ) > this.moveRange) {
        this.moveDirection = -Math.sign(offsetZ);
      }
      this.velocity.set(0, 0, this.moveDirection * this.moveSpeed);
    }

    this.position.addScaledVector(this.velocity, dt);
    this.group.position.copy(this.position);
  }

  /**
   * 頭部ボーンのワールド座標を取得
   */
  public getHeadWorldPosition(): THREE.Vector3 {
    const pos = new THREE.Vector3();
    this.headMesh.getWorldPosition(pos);
    return pos;
  }

  /**
   * 胸部ボーンのワールド座標を取得
   */
  public getChestWorldPosition(): THREE.Vector3 {
    const pos = new THREE.Vector3();
    this.bodyMesh.getWorldPosition(pos);
    return pos;
  }

  /**
   * 被弾処理
   */
  public applyDamage(bone: 'head' | 'chest' | 'body', damage: number): DummyHitResult {
    this.health = Math.max(0, this.health - damage);
    const isFatal = this.health <= 0;

    // 被弾時の点滅エフェクト
    const originalMat = this.bodyMesh.material as THREE.MeshStandardMaterial;
    originalMat.color.setHex(0xffffff);
    setTimeout(() => {
      originalMat.color.setHex(0x3366cc);
    }, 80);

    if (isFatal) {
      // リスポーン（2秒後に全快）
      setTimeout(() => {
        this.health = this.maxHealth;
      }, 2000);
    }

    return {
      bone,
      damage,
      isFatal,
      position: bone === 'head' ? this.getHeadWorldPosition() : this.getChestWorldPosition()
    };
  }
}
