// src/ui/GUIController.ts
import GUI from 'lil-gui';
import { CameraController } from '../core/CameraController.ts';
import { WeaponController } from '../core/WeaponController.ts';
import { AimAssistant } from '../core/AimAssistant.ts';
import { COMBAT_PRESETS, CombatPreset } from '../presets/CombatPresets.ts';

export class GUIController {
  private gui: GUI;
  private cameraCtrl: CameraController;
  private weaponCtrl: WeaponController;
  private aimAssist: AimAssistant;

  public showTrajectoryLine: boolean = true;

  constructor(
    cameraCtrl: CameraController,
    weaponCtrl: WeaponController,
    aimAssist: AimAssistant
  ) {
    this.cameraCtrl = cameraCtrl;
    this.weaponCtrl = weaponCtrl;
    this.aimAssist = aimAssist;

    this.gui = new GUI({ title: '🎯 戦闘・弾道・エイム検証パネル' });
    this.gui.domElement.style.top = '10px';
    this.gui.domElement.style.right = '10px';
    this.gui.domElement.style.zIndex = '1000';

    this.setupFolders();
  }

  private setupFolders(): void {
    // 1. プリセット切り替え
    const presetFolder = this.gui.addFolder('【プリセット選択】');
    const presetNames: Record<string, string> = {
      'フォートナイト/荒野風 (BR)': 'fortnite_br',
      'デルタフォース風 (Tactical)': 'delta_tactical',
      'アーケード風 (Hitscan)': 'arcade_hitscan'
    };

    const presetObj = { current: 'fortnite_br' };
    presetFolder.add(presetObj, 'current', presetNames).name('ゲームスタイル').onChange((id: string) => {
      this.weaponCtrl.switchPreset(id);
      this.syncGUIValues();
    });
    presetFolder.open();

    // 2. カメラ・視点制御
    const camFolder = this.gui.addFolder('【カメラ・視点設定】');
    camFolder.add(this.cameraCtrl, 'mode', ['tps', 'fps']).name('視点モード').listen().onChange((m: 'tps' | 'fps') => {
      this.cameraCtrl.setViewMode(m);
    });
    camFolder.add(this.cameraCtrl, 'defaultFov', 50, 110, 1).name('腰だめFOV').listen();
    camFolder.add(this.cameraCtrl, 'adsFov', 20, 80, 1).name('ADSズームFOV').listen();
    camFolder.add(this.cameraCtrl, 'mouseSensitivity', 0.0005, 0.008, 0.0001).name('マウス感度');
    camFolder.open();

    // 3. 汎用弾道エンジン設定
    const ballisticsFolder = this.gui.addFolder('【弾道物理チューニング】');
    const p = this.weaponCtrl.currentPreset;
    ballisticsFolder.add(p, 'mode', ['projectile', 'hitscan']).name('弾道方式').listen();
    ballisticsFolder.add(p, 'muzzleVelocity', 50, 1200, 10).name('初速 (m/s)').listen();
    ballisticsFolder.add(p, 'gravity', 0, 30, 0.1).name('重力加速度 (m/s²)').listen();
    ballisticsFolder.add(p, 'dragCoefficient', 0, 0.005, 0.0001).name('空気抵抗係数').listen();
    ballisticsFolder.add(p, 'spread', 0, 0.05, 0.001).name('弾拡散 (Spread)').listen();
    ballisticsFolder.add(this, 'showTrajectoryLine').name('放物線予測ライン描画');
    ballisticsFolder.open();

    // 4. オートエイム・偏差射撃アシスト
    const aimFolder = this.gui.addFolder('【エイムアシスト / 偏差計算】');
    aimFolder.add(this.aimAssist, 'enabled').name('アシスト有効化 (Key: C)').listen();
    aimFolder.add(this.aimAssist, 'instantLock').name('瞬間ロック (Snap)').listen();
    aimFolder.add(this.aimAssist, 'aimBone', ['head', 'chest']).name('優先ボーン');
    aimFolder.add(this.aimAssist, 'assistFov', 2, 45, 1).name('索敵FOVコーン (度)');
    aimFolder.add(this.aimAssist, 'smoothStrength', 0.05, 1.0, 0.05).name('吸い付きスムージング強度');
    aimFolder.open();
  }

  public syncGUIValues(): void {
    // プリセット変更時に各フォルダの値を最新化
    this.gui.controllersRecursive().forEach(c => c.updateDisplay());
  }
}
