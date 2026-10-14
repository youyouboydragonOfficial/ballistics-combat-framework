// src/presets/CombatPresets.ts
import { WeaponPresetConfig } from '../../server/protocol.ts';

export interface CombatPreset extends WeaponPresetConfig {
  description: string;
  cameraMode: 'tps' | 'fps';
  defaultFov: number;
  adsFov: number;
  aimAssistFov: number;        // エイムアシスト検知角 (度)
  aimAssistStrength: number;   // スムージング吸い付き強度 (0.0=OFF, 1.0=瞬時スナップ)
  showLeadMarker: boolean;     // 偏差予測HUDマーカーを表示するか
}

export const COMBAT_PRESETS: Record<string, CombatPreset> = {
  // 1. フォートナイト / 荒野行動風（三人称バトルロイヤル）
  fortnite_br: {
    id: 'fortnite_br',
    name: 'フォートナイト / 荒野風 (BR)',
    description: '三人称肩越し視点、中程度の弾速と重力落下。直感的な戦闘と適度な偏差射撃が特徴。',
    mode: 'projectile',
    cameraMode: 'tps',
    muzzleVelocity: 420.0,      // 420 m/s (一般的なアサルトライフル弾速)
    gravity: 12.0,              // ゲーム的な手応えを出すため少し強めの重力
    dragCoefficient: 0.0003,    // 軽微な空気抵抗
    fireRate: 550,              // 550 RPM
    damageBody: 33,
    damageHead: 66,
    recoilPitch: 0.015,
    recoilYaw: 0.008,
    spread: 0.008,
    tracerColor: '#ffaa00',     // 鮮やかなオレンジ・イエロートレーサー
    defaultFov: 75,
    adsFov: 55,
    aimAssistFov: 16.0,         // アシストFOV
    aimAssistStrength: 0.45,    // 適度な吸い付き
    showLeadMarker: true
  },

  // 2. デルタフォース / 戦術ミリタリー風（タクティカルシューター）
  delta_tactical: {
    id: 'delta_tactical',
    name: 'デルタフォース風 (Tactical)',
    description: '一人称・三人称精密射撃。リアル初速・急激な空気抵抗減衰・シビアな重力落下と長距離偏差要求。',
    mode: 'projectile',
    cameraMode: 'fps',
    muzzleVelocity: 680.0,      // 初速 680 m/s
    gravity: 9.81,              // 現実の重力加速度
    dragCoefficient: 0.0018,    // 強い空気抵抗（遠距離で著しく減速・急激にドロップ）
    fireRate: 600,              // 600 RPM
    damageBody: 45,
    damageHead: 110,
    recoilPitch: 0.035,
    recoilYaw: 0.018,
    spread: 0.003,              // 初弾精度は極めて高い
    tracerColor: '#44ff88',     // グリーンミリタリートレーサー
    defaultFov: 75,
    adsFov: 35,                 // 強いADSズーム（スコープ風）
    aimAssistFov: 8.0,          // 狭い索敵角
    aimAssistStrength: 0.2,     // 控えめなアシスト（腕前依存）
    showLeadMarker: true
  },

  // 3. アーケード / 競技ヒットスキャン風（即着弾）
  arcade_hitscan: {
    id: 'arcade_hitscan',
    name: 'アーケード風 (Hitscan)',
    description: 'トリガー瞬時に判定を行うヒットスキャン。偏差不要・超高速レスポンス。',
    mode: 'hitscan',
    cameraMode: 'fps',
    muzzleVelocity: 0,          // ヒットスキャンなので不要（即着弾）
    gravity: 0,
    dragCoefficient: 0,
    fireRate: 720,              // 720 RPM
    damageBody: 25,
    damageHead: 50,
    recoilPitch: 0.012,
    recoilYaw: 0.005,
    spread: 0.005,
    tracerColor: '#00ddff',     // シアンビーム
    defaultFov: 80,
    adsFov: 60,
    aimAssistFov: 12.0,
    aimAssistStrength: 0.6,
    showLeadMarker: false       // ヒットスキャンは偏差不要
  }
};
