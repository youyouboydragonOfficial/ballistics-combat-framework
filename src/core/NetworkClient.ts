// src/core/NetworkClient.ts
import * as THREE from 'three';
import { ClientMessage, ServerMessage, PlayerNetState, ShootNetworkEvent } from '../../server/protocol.ts';
import { OtherPlayer } from '../entities/OtherPlayer.ts';
import { BallisticsEngine } from './BallisticsEngine.ts';
import { COMBAT_PRESETS } from '../presets/CombatPresets.ts';

export class NetworkClient {
  private ws: WebSocket | null = null;
  public isConnected: boolean = false;
  public myId: string = '';
  public otherPlayers: Map<string, OtherPlayer> = new Map();
  private scene: THREE.Scene;
  private ballistics: BallisticsEngine;

  private lastSendTime: number = 0;
  private sendInterval: number = 1 / 30; // 30Hz更新

  constructor(scene: THREE.Scene, ballistics: BallisticsEngine) {
    this.scene = scene;
    this.ballistics = ballistics;
  }

  /**
   * WebSocketサーバーへの接続
   */
  public connect(url: string = `ws://${window.location.hostname}:8080`): void {
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[Network] Connected to multiplayer server:', url);
        this.isConnected = true;
        this.sendMessage({
          type: 'join',
          name: 'Player_' + Math.floor(Math.random() * 1000)
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (e) {
          console.error('[Network] Error parsing message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[Network] Disconnected from server (Playing in offline mode)');
        this.isConnected = false;
        this.clearOtherPlayers();
      };

      this.ws.onerror = () => {
        // オフラインでも遊べるため警告のみ
        console.warn('[Network] WebSocket error or server offline. Running in local testbed mode.');
      };
    } catch (e) {
      console.warn('[Network] Connection failed. Running offline.', e);
    }
  }

  /**
   * 受信メッセージの処理
   */
  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'welcome':
        this.myId = msg.yourId;
        console.log('[Network] Welcomed with ID:', this.myId);
        // 既存プレイヤーの生成
        for (const p of msg.players) {
          if (p.id !== this.myId) {
            this.addOtherPlayer(p);
          }
        }
        break;

      case 'player_joined':
        if (msg.player.id !== this.myId) {
          this.addOtherPlayer(msg.player);
        }
        break;

      case 'player_left':
        this.removeOtherPlayer(msg.id);
        break;

      case 'player_updated':
        if (msg.id !== this.myId) {
          const other = this.otherPlayers.get(msg.id);
          if (other) {
            other.updateState(msg.state);
          }
        }
        break;

      case 'player_shoot':
        if (msg.event.shooterId !== this.myId) {
          this.handleRemoteShoot(msg.event);
        }
        break;
    }
  }

  private addOtherPlayer(state: PlayerNetState): void {
    if (this.otherPlayers.has(state.id)) return;
    const other = new OtherPlayer(state.id, state);
    this.otherPlayers.set(state.id, other);
    this.scene.add(other.group);
  }

  private removeOtherPlayer(id: string): void {
    const other = this.otherPlayers.get(id);
    if (other) {
      other.destroy(this.scene);
      this.otherPlayers.delete(id);
    }
  }

  private clearOtherPlayers(): void {
    for (const other of this.otherPlayers.values()) {
      other.destroy(this.scene);
    }
    this.otherPlayers.clear();
  }

  /**
   * 他プレイヤーの射撃イベントをローカル弾道エンジンで再現
   */
  private handleRemoteShoot(evt: ShootNetworkEvent): void {
    const preset = COMBAT_PRESETS[evt.presetId] || COMBAT_PRESETS['fortnite_br'];
    const muzzlePos = new THREE.Vector3().fromArray(evt.muzzlePosition);
    const direction = new THREE.Vector3().fromArray(evt.direction);

    this.ballistics.fire(
      muzzlePos,
      direction,
      evt.isHitscan,
      preset.muzzleVelocity,
      preset.gravity,
      preset.dragCoefficient,
      preset.damageHead,
      preset.damageBody,
      preset.tracerColor
    );
  }

  /**
   * 自身の状態同期送信（30Hz）
   */
  public sendUpdate(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    yaw: number,
    pitch: number,
    isAiming: boolean,
    presetId: string
  ): void {
    if (!this.isConnected || !this.ws) return;

    const now = performance.now() / 1000;
    if (now - this.lastSendTime < this.sendInterval) return;
    this.lastSendTime = now;

    const msg: ClientMessage = {
      type: 'update',
      state: {
        name: 'Player',
        position: [position.x, position.y, position.z],
        velocity: [velocity.x, velocity.y, velocity.z],
        rotation: { yaw, pitch },
        isAiming,
        currentPresetId: presetId
      }
    };
    this.sendMessage(msg);
  }

  /**
   * 射撃イベントの送信
   */
  public sendShoot(muzzlePos: THREE.Vector3, direction: THREE.Vector3, presetId: string, isHitscan: boolean): void {
    if (!this.isConnected || !this.ws) return;

    const msg: ClientMessage = {
      type: 'shoot',
      event: {
        muzzlePosition: [muzzlePos.x, muzzlePos.y, muzzlePos.z],
        direction: [direction.x, direction.y, direction.z],
        presetId,
        isHitscan
      }
    };
    this.sendMessage(msg);
  }

  private sendMessage(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public update(dt: number): void {
    for (const other of this.otherPlayers.values()) {
      other.update(dt);
    }
  }
}
