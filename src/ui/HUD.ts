// src/ui/HUD.ts
import * as THREE from 'three';
import { CombatPreset } from '../presets/CombatPresets.ts';

export class HUD {
  private container: HTMLElement;
  private crosshair: HTMLElement;
  private muzzleBlockIndicator: HTMLElement;
  private leadMarker: HTMLElement;
  private damageContainer: HTMLElement;
  private weaponInfo: HTMLElement;
  private hitmarker: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'hud-container';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      user-select: none;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    document.body.appendChild(this.container);

    // 1. レティクル（クロスヘア）
    this.crosshair = document.createElement('div');
    this.crosshair.id = 'crosshair';
    this.crosshair.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 16px;
      height: 16px;
      transform: translate(-50%, -50%);
      pointer-events: none;
    `;
    this.crosshair.innerHTML = `
      <div style="position:absolute; top:7px; left:0; width:16px; height:2px; background:rgba(255,255,255,0.85); box-shadow:0 0 2px rgba(0,0,0,0.8);"></div>
      <div style="position:absolute; top:0; left:7px; width:2px; height:16px; background:rgba(255,255,255,0.85); box-shadow:0 0 2px rgba(0,0,0,0.8);"></div>
      <div style="position:absolute; top:6px; left:6px; width:4px; height:4px; border-radius:50%; background:#00ffcc;"></div>
    `;
    this.container.appendChild(this.crosshair);

    // 2. 銃口ブロック警告 (✕)
    this.muzzleBlockIndicator = document.createElement('div');
    this.muzzleBlockIndicator.style.cssText = `
      position: absolute;
      top: 55%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #ff3344;
      font-weight: bold;
      font-size: 20px;
      display: none;
      text-shadow: 0 0 4px #000;
    `;
    this.muzzleBlockIndicator.innerText = '✕ 銃口が遮蔽物に接触';
    this.container.appendChild(this.muzzleBlockIndicator);

    // 3. 偏差予測マーカー (Lead Marker)
    this.leadMarker = document.createElement('div');
    this.leadMarker.style.cssText = `
      position: absolute;
      width: 22px;
      height: 22px;
      border: 2px dashed #00ff88;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      display: none;
      box-shadow: 0 0 8px #00ff88;
      pointer-events: none;
      transition: border-color 0.1s;
    `;
    this.leadMarker.innerHTML = `
      <div style="position:absolute; top:9px; left:3px; width:12px; height:1px; background:#00ff88;"></div>
      <div style="position:absolute; top:3px; left:9px; width:1px; height:12px; background:#00ff88;"></div>
    `;
    this.container.appendChild(this.leadMarker);

    // 4. ヒットマーカー
    this.hitmarker = document.createElement('div');
    this.hitmarker.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 24px;
      height: 24px;
      transform: translate(-50%, -50%);
      display: none;
      pointer-events: none;
    `;
    this.hitmarker.innerHTML = `
      <div style="position:absolute; width:10px; height:2px; background:#ff2222; transform:rotate(45deg); top:4px; left:4px;"></div>
      <div style="position:absolute; width:10px; height:2px; background:#ff2222; transform:rotate(-45deg); top:4px; right:4px;"></div>
      <div style="position:absolute; width:10px; height:2px; background:#ff2222; transform:rotate(-45deg); bottom:4px; left:4px;"></div>
      <div style="position:absolute; width:10px; height:2px; background:#ff2222; transform:rotate(45deg); bottom:4px; right:4px;"></div>
    `;
    this.container.appendChild(this.hitmarker);

    // 5. ダメージ数値コンテナ
    this.damageContainer = document.createElement('div');
    this.damageContainer.style.cssText = `position: absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;`;
    this.container.appendChild(this.damageContainer);

    // 6. 武器・状態情報パネル
    this.weaponInfo = document.createElement('div');
    this.weaponInfo.style.cssText = `
      position: absolute;
      bottom: 24px;
      right: 28px;
      background: rgba(12, 16, 24, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(8px);
      padding: 16px 20px;
      border-radius: 8px;
      color: #fff;
      font-size: 13px;
      line-height: 1.6;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;
    this.container.appendChild(this.weaponInfo);

    // 7. 操作ガイドパネル (左下)
    const guide = document.createElement('div');
    guide.style.cssText = `
      position: absolute;
      bottom: 24px;
      left: 28px;
      background: rgba(12, 16, 24, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(8px);
      padding: 14px 18px;
      border-radius: 8px;
      color: #ddd;
      font-size: 12px;
      line-height: 1.6;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;
    guide.innerHTML = `
      <div style="font-weight:bold; color:#00ffcc; margin-bottom:4px;">🎮 操作ガイド</div>
      <div><b>WASD</b>: 移動 / <b>Space</b>: ジャンプ / <b>Shift</b>: ダッシュ</div>
      <div><b>マウス移動</b>: 視点回転 (クリックしてロック)</div>
      <div><b>右クリック (長押し)</b>: ADS (ズームエイム)</div>
      <div><b>左クリック</b>: 射撃 (連射対応)</div>
      <div><b>V キー</b>: TPS / FPS 視点切り替え</div>
      <div><b>1 / 2 / 3 キー</b>: プリセット即時切替</div>
      <div><b>C キー</b>: オートエイム / アシスト ON/OFF</div>
    `;
    this.container.appendChild(guide);
  }

  public updateWeaponInfo(preset: CombatPreset, viewMode: string, isAiming: boolean, assistEnabled: boolean): void {
    const modeBadge = preset.mode === 'hitscan' 
      ? '<span style="color:#00ddff; font-weight:bold;">HITSCAN (即着弾)</span>' 
      : '<span style="color:#ffaa00; font-weight:bold;">PROJECTILE (リアル弾道)</span>';

    this.weaponInfo.innerHTML = `
      <div style="font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 6px;">
        ${preset.name}
      </div>
      <div>方式: ${modeBadge}</div>
      <div>カメラ: <b style="color:#fff;">${viewMode.toUpperCase()}</b> ${isAiming ? '(ADS)' : ''}</div>
      <div>初速: <b>${preset.muzzleVelocity} m/s</b> | 重力: <b>${preset.gravity} m/s²</b></div>
      <div>空気抵抗: <b>${preset.dragCoefficient}</b> | 連射: <b>${preset.fireRate} RPM</b></div>
      <div>エイムアシスト: <b>${assistEnabled ? '<span style="color:#00ff88">ON</span>' : '<span style="color:#888">OFF</span>'}</b></div>
    `;
  }

  public setMuzzleBlocked(blocked: boolean): void {
    this.muzzleBlockIndicator.style.display = blocked ? 'block' : 'none';
  }

  public updateLeadMarker(screenPos: THREE.Vector2 | null, visible: boolean): void {
    if (visible && screenPos) {
      this.leadMarker.style.display = 'block';
      this.leadMarker.style.left = `${screenPos.x * 100}%`;
      this.leadMarker.style.top = `${screenPos.y * 100}%`;
    } else {
      this.leadMarker.style.display = 'none';
    }
  }

  public showHitmarker(isFatal: boolean): void {
    this.hitmarker.style.display = 'block';
    setTimeout(() => {
      this.hitmarker.style.display = 'none';
    }, 90);
  }

  public showDamagePopup(damage: number, isHeadshot: boolean, screenPos: THREE.Vector2): void {
    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute;
      left: ${screenPos.x * 100}%;
      top: ${screenPos.y * 100}%;
      transform: translate(-50%, -50%);
      color: ${isHeadshot ? '#ff2244' : '#ffcc00'};
      font-size: ${isHeadshot ? '24px' : '18px'};
      font-weight: 800;
      text-shadow: 0 0 6px #000;
      pointer-events: none;
      animation: floatUp 0.8s forwards ease-out;
    `;
    el.innerText = `${isHeadshot ? 'CRIT! ' : ''}${damage}`;
    this.damageContainer.appendChild(el);

    setTimeout(() => {
      el.remove();
    }, 800);
  }
}
