// server/protocol.ts
// マルチプレイヤー・弾道・戦闘フレームワーク 共有通信プロトコル

export type WeaponMode = 'hitscan' | 'projectile';

export interface WeaponPresetConfig {
  id: string;
  name: string;
  mode: WeaponMode;
  muzzleVelocity: number;    // 初速 (m/s)
  gravity: number;           // 重力加速度 (m/s^2)
  dragCoefficient: number;   // 空気抵抗係数
  fireRate: number;          // 連射速度 (発/分 RPM)
  damageBody: number;        // 胴体ダメージ
  damageHead: number;        // ヘッドショットダメージ
  recoilPitch: number;       // 上方向リコイル
  recoilYaw: number;         // 横方向リコイル
  spread: number;            // 弾の拡散角 (ラジアン)
  tracerColor: string;       // 弾道色
}

export interface PlayerNetState {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: { yaw: number; pitch: number };
  velocity: [number, number, number];
  isAiming: boolean;
  health: number;
  currentPresetId: string;
}

export interface ShootNetworkEvent {
  shooterId: string;
  timestamp: number;
  muzzlePosition: [number, number, number];
  direction: [number, number, number];
  presetId: string;
  isHitscan: boolean;
}

export interface HitNetworkEvent {
  shooterId: string;
  victimId: string;
  bone: 'head' | 'chest' | 'body';
  damage: number;
  hitPosition: [number, number, number];
}

export interface BotNetState {
  id: string;
  position: [number, number, number];
  velocity: [number, number, number];
  health: number;
  maxHealth: number;
}

// クライアント -> サーバー メッセージ
export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'update'; state: Omit<PlayerNetState, 'id' | 'health'> }
  | { type: 'shoot'; event: Omit<ShootNetworkEvent, 'shooterId' | 'timestamp'> }
  | { type: 'hit'; event: Omit<HitNetworkEvent, 'shooterId'> };

// サーバー -> クライアント メッセージ
export type ServerMessage =
  | { type: 'welcome'; yourId: string; players: PlayerNetState[]; bots: BotNetState[] }
  | { type: 'player_joined'; player: PlayerNetState }
  | { type: 'player_left'; id: string }
  | { type: 'player_updated'; id: string; state: Omit<PlayerNetState, 'id'> }
  | { type: 'player_shoot'; event: ShootNetworkEvent }
  | { type: 'player_hit'; event: HitNetworkEvent }
  | { type: 'bot_sync'; bots: BotNetState[] };
