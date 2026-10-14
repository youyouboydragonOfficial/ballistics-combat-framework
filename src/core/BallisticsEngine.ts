// src/core/BallisticsEngine.ts
import * as THREE from 'three';
import { BallisticsMath } from '../math/BallisticsMath.ts';
import { TargetDummy } from '../entities/TargetDummy.ts';

export interface ProjectileHitCallbackResult {
  hitObject: THREE.Object3D;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  bone?: 'head' | 'chest' | 'body';
  damage: number;
  dummy?: TargetDummy;
  isFatal?: boolean;
}

export type HitCallback = (result: ProjectileHitCallbackResult) => void;

interface ActiveProjectile {
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  gravity: number;
  dragCoefficient: number;
  maxLifetime: number;
  elapsedTime: number;
  damageHead: number;
  damageBody: number;
  mesh: THREE.Mesh;
  trailLine: THREE.Line;
  trailPositions: Float32Array;
  trailCount: number;
  color: THREE.Color;
}

interface ActiveTracer {
  line: THREE.Line;
  opacity: number;
  fadeSpeed: number;
}

export class BallisticsEngine {
  private scene: THREE.Scene;
  private projectiles: ActiveProjectile[] = [];
  private tracers: ActiveTracer[] = [];
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  // 衝突判定対象（壁・障害物・ダミー）
  public colliders: THREE.Object3D[] = [];
  public onHit: HitCallback | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * 射撃実行（ヒットスキャン または 弾道物理）
   */
  public fire(
    muzzlePos: THREE.Vector3,
    direction: THREE.Vector3,
    isHitscan: boolean,
    muzzleVelocity: number,
    gravity: number,
    dragCoefficient: number,
    damageHead: number,
    damageBody: number,
    colorHex: string = '#ffaa00'
  ): void {
    if (isHitscan) {
      this.fireHitscan(muzzlePos, direction, damageHead, damageBody, colorHex);
    } else {
      this.fireProjectile(muzzlePos, direction, muzzleVelocity, gravity, dragCoefficient, damageHead, damageBody, colorHex);
    }
  }

  /**
   * 1. ヒットスキャン方式
   */
  private fireHitscan(
    muzzlePos: THREE.Vector3,
    direction: THREE.Vector3,
    damageHead: number,
    damageBody: number,
    colorHex: string
  ): void {
    const maxRange = 500;
    this.raycaster.set(muzzlePos, direction.clone().normalize());
    this.raycaster.far = maxRange;

    const intersects = this.raycaster.intersectObjects(this.colliders, true);

    let endPoint = muzzlePos.clone().addScaledVector(direction, maxRange);

    if (intersects.length > 0) {
      const hit = intersects[0];
      endPoint = hit.point;

      this.processHit(hit.object, hit.point, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0), damageHead, damageBody);
    }

    // ヒットスキャン用の瞬間ビームトレーサーを生成
    this.createInstantTracer(muzzlePos, endPoint, colorHex);
  }

  /**
   * 2. リアルタイム物理弾道方式
   */
  private fireProjectile(
    muzzlePos: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    gravity: number,
    dragCoeff: number,
    damageHead: number,
    damageBody: number,
    colorHex: string
  ): void {
    const color = new THREE.Color(colorHex);

    // 弾丸の光球メッシュ
    const bulletGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const bulletMat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(bulletGeo, bulletMat);
    mesh.position.copy(muzzlePos);
    this.scene.add(mesh);

    // 弾道トレイル（直近8点の軌跡）
    const maxTrailPoints = 8;
    const trailPositions = new Float32Array(maxTrailPoints * 3);
    for (let i = 0; i < maxTrailPoints; i++) {
      trailPositions[i * 3 + 0] = muzzlePos.x;
      trailPositions[i * 3 + 1] = muzzlePos.y;
      trailPositions[i * 3 + 2] = muzzlePos.z;
    }

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    this.scene.add(trailLine);

    const initialVelocity = direction.clone().normalize().multiplyScalar(speed);

    this.projectiles.push({
      position: muzzlePos.clone(),
      previousPosition: muzzlePos.clone(),
      velocity: initialVelocity,
      gravity,
      dragCoefficient: dragCoeff,
      maxLifetime: 6.0,
      elapsedTime: 0,
      damageHead,
      damageBody,
      mesh,
      trailLine,
      trailPositions,
      trailCount: maxTrailPoints,
      color
    });
  }

  /**
   * 毎フレームの弾道シミュレーション更新 (CCD: Continuous Collision Detection)
   */
  public update(dt: number): void {
    // 物理弾丸の更新
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.elapsedTime += dt;

      if (p.elapsedTime > p.maxLifetime || p.position.y < -10) {
        this.destroyProjectile(p, i);
        continue;
      }

      // 前フレームの位置を記憶
      p.previousPosition.copy(p.position);

      // 物理ステップ (Semi-implicit Euler)
      BallisticsMath.stepEuler(p.position, p.velocity, p.gravity, p.dragCoefficient, dt);

      // --- CCD（連続衝突判定）---
      // 前フレーム座標から現フレーム座標の線分でレイキャスト
      const stepVec = new THREE.Vector3().subVectors(p.position, p.previousPosition);
      const stepDist = stepVec.length();

      if (stepDist > 0.001) {
        const stepDir = stepVec.clone().normalize();
        this.raycaster.set(p.previousPosition, stepDir);
        this.raycaster.far = stepDist;

        const intersects = this.raycaster.intersectObjects(this.colliders, true);

        if (intersects.length > 0) {
          const hit = intersects[0];
          this.processHit(hit.object, hit.point, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0), p.damageHead, p.damageBody);
          this.createHitImpactEffect(hit.point, p.color);
          this.destroyProjectile(p, i);
          continue;
        }
      }

      // メッシュ位置更新
      p.mesh.position.copy(p.position);

      // トレイル更新（最新位置を先頭にシフト）
      const posAttr = p.trailLine.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let j = p.trailCount - 1; j > 0; j--) {
        arr[j * 3 + 0] = arr[(j - 1) * 3 + 0];
        arr[j * 3 + 1] = arr[(j - 1) * 3 + 1];
        arr[j * 3 + 2] = arr[(j - 1) * 3 + 2];
      }
      arr[0] = p.position.x;
      arr[1] = p.position.y;
      arr[2] = p.position.z;
      posAttr.needsUpdate = true;
    }

    // ヒットスキャントレーサーのフェードアウト更新
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.opacity -= t.fadeSpeed * dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.opacity);

      if (t.opacity <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  /**
   * 着弾判定処理
   */
  private processHit(
    hitObj: THREE.Object3D,
    hitPoint: THREE.Vector3,
    normal: THREE.Vector3,
    damageHead: number,
    damageBody: number
  ): void {
    let current: THREE.Object3D | null = hitObj;
    let dummy: TargetDummy | undefined;
    let bone: 'head' | 'chest' | 'body' = 'body';

    while (current) {
      if (current.userData && current.userData.dummy) {
        dummy = current.userData.dummy;
        bone = current.userData.bone || 'chest';
        break;
      }
      current = current.parent;
    }

    const damage = (bone === 'head') ? damageHead : damageBody;
    let isFatal = false;

    if (dummy) {
      const hitResult = dummy.applyDamage(bone, damage);
      isFatal = hitResult.isFatal;
    }

    if (this.onHit) {
      this.onHit({
        hitObject: hitObj,
        point: hitPoint,
        normal,
        bone,
        damage,
        dummy,
        isFatal
      });
    }
  }

  /**
   * 弾丸の破棄
   */
  private destroyProjectile(p: ActiveProjectile, index: number): void {
    this.scene.remove(p.mesh);
    this.scene.remove(p.trailLine);
    p.mesh.geometry.dispose();
    (p.mesh.material as THREE.Material).dispose();
    p.trailLine.geometry.dispose();
    (p.trailLine.material as THREE.Material).dispose();
    this.projectiles.splice(index, 1);
  }

  /**
   * ヒットスキャンのビームトレーサー作成
   */
  private createInstantTracer(start: THREE.Vector3, end: THREE.Vector3, colorHex: string): void {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    this.tracers.push({
      line,
      opacity: 1.0,
      fadeSpeed: 5.0
    });
  }

  /**
   * 着弾インパクトエフェクト
   */
  private createHitImpactEffect(point: THREE.Vector3, color: THREE.Color): void {
    const pGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const pMat = new THREE.MeshBasicMaterial({ color, wireframe: true });
    const mesh = new THREE.Mesh(pGeo, pMat);
    mesh.position.copy(point);
    this.scene.add(mesh);

    let scale = 1.0;
    const interval = setInterval(() => {
      scale += 0.3;
      mesh.scale.set(scale, scale, scale);
      (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1.0 - (scale - 1) * 0.5);
      if (scale > 2.5) {
        clearInterval(interval);
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }, 20);
  }

  public clear(): void {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      this.scene.remove(p.trailLine);
    }
    this.projectiles = [];
    for (const t of this.tracers) {
      this.scene.remove(t.line);
    }
    this.tracers = [];
  }
}
