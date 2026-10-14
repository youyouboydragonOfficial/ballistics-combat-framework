// src/entities/OtherPlayer.ts
import * as THREE from 'three';
import { PlayerNetState } from '../../server/protocol.ts';

export class OtherPlayer {
  public id: string;
  public group: THREE.Group;
  public headMesh: THREE.Mesh;
  public bodyMesh: THREE.Mesh;
  public gunMesh: THREE.Mesh;

  public targetPosition: THREE.Vector3 = new THREE.Vector3();
  public targetYaw: number = 0;
  public targetPitch: number = 0;

  constructor(id: string, initialState: PlayerNetState) {
    this.id = id;
    this.group = new THREE.Group();

    // 胴体
    const bodyGeo = new THREE.CylinderGeometry(0.32, 0.28, 1.15, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x228844, roughness: 0.6 });
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = 0.95;
    this.bodyMesh.castShadow = true;
    this.group.add(this.bodyMesh);

    // 頭部
    const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xeebb99, roughness: 0.4 });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.position.y = 1.7;
    this.headMesh.castShadow = true;
    this.group.add(this.headMesh);

    // 銃メッシュ
    const gunGeo = new THREE.BoxGeometry(0.1, 0.12, 0.7);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
    this.gunMesh = new THREE.Mesh(gunGeo, gunMat);
    this.gunMesh.position.set(0.35, 1.4, 0.25);
    this.group.add(this.gunMesh);

    // 初期位置
    this.targetPosition.set(initialState.position[0], initialState.position[1], initialState.position[2]);
    this.group.position.copy(this.targetPosition);
    this.targetYaw = initialState.rotation.yaw;
    this.targetPitch = initialState.rotation.pitch;
  }

  public updateState(state: Omit<PlayerNetState, 'id'>): void {
    this.targetPosition.set(state.position[0], state.position[1], state.position[2]);
    this.targetYaw = state.rotation.yaw;
    this.targetPitch = state.rotation.pitch;
  }

  public update(dt: number): void {
    // 位置のスムーズ補間
    this.group.position.lerp(this.targetPosition, Math.min(15.0 * dt, 1.0));

    // 水平回転の補間
    const currentYaw = this.group.rotation.y;
    let diff = this.targetYaw - currentYaw;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.group.rotation.y += diff * Math.min(15.0 * dt, 1.0);
  }

  public destroy(scene: THREE.Scene): void {
    scene.remove(this.group);
  }
}
