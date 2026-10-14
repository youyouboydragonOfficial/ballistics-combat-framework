# 汎用弾道・戦闘・エイムシステム (Modular Combat & Ballistics Framework)

マルチプレイヤーTPS/FPSシューター向けに設計された、**クロスプラットフォーム（Web標準/Node.js）で動作する汎用戦闘フレームワーク＆パソコン用検証アプリ**です。

フォートナイト・荒野行動のような三人称バトルロイヤルから、デルタフォースのような戦術的ミリタリーシューター、さらにはアーケードヒットスキャンまで、弾道特性や操作感を1つの基盤上で即座に切り替え・検証できます。

---

## 1. システムアーキテクチャ

```mermaid
flowchart TD
    subgraph Client [クライアント (PCブラウザ / Three.js)]
        Input[プレイヤー入力 / マウス・キーボード] --> CamCtrl[CameraController<br>TPS/FPS切替・ADS・パララックス自動補正]
        CamCtrl --> WeaponCtrl[WeaponController<br>プリセット管理・連射・拡散・反動]
        
        Dummy[TargetDummy ダミー標的<br>頭部・胸部ボーン・移動物理] --> AimAssist[AimAssistant<br>索敵FOV・遮蔽物Raycast判定]
        
        AimAssist --> LeadMath[LeadAimMath 偏差計算<br>二次方程式インターセプト・迎角相殺]
        LeadMath -.->|照準補正/マーカー| CamCtrl
        
        WeaponCtrl --> Ballistics[BallisticsEngine<br>CCD連続衝突判定 / ヒットスキャン]
        Ballistics -->|弾道シミュレーション| BallisticsMath[BallisticsMath<br>オイラー物理・空気抵抗・重力落下]
        
        Ballistics --> HUD[HUD / GUIController<br>レティクル・銃口警告・ダメージ・lil-gui]
        WeaponCtrl --> NetClient[NetworkClient<br>WebSocketクライアント]
    end

    subgraph Server [サーバー (Node.js / ws)]
        NetClient <-->|状態同期 30Hz / 射撃イベント| ServerWS[Multiplayer Server<br>ルーム管理・ブロードキャスト]
    end
```

---

## 2. 実装モジュールの詳細

### A. プレイヤー視点・カメラ制御 (`CameraController.ts`)
- **TPS / FPS 切り替え (Key: V)**:
  - TPS（肩越し視点）とFPS（一人称視点）をワンキーで即座に切り替え。
  - FPS時は自キャラのメッシュを透過し視界をクリアに保持。
- **パララックス（視差）自動補正レイキャスト**:
  - TPSの肩越し視点では「カメラ位置」「画面中央レティクル」「銃口位置」の3点が幾何学的に乖離（パララックス）します。
  - 画面中心からRaycastを発射し、注視点（障害物または最大射程座標）を特定。銃口からその注視点に向かう正規化ベクトルを動的計算し、レティクルの中心へ正確に弾を飛ばします。
  - 近接遮蔽物検知：銃口と注視点の間に障害物がある場合、HUDに「✕ 銃口が遮蔽物に接触」警告を表示。
- **ADS（ズームエイム - 右クリック長押し）**:
  - カメラオフセットを肩越しから銃身の近傍へ滑らかにLerp補間。
  - FOVを縮小（通常時: 75° $\to$ ADS時: 35〜55°）し、マウス感度を自動減衰。

### B. 汎用弾道エンジン (`BallisticsEngine.ts` & `BallisticsMath.ts`)
- **方式1: ヒットスキャン (Hitscan)**:
  - トリガー瞬時にRaycast交差判定を行う即着弾モデル。
  - 減衰フェードするレーザービームトレーサーを描画。近接戦闘・アーケード向け。
- **方式2: リアルタイム物理弾道 (Projectile Ballistics)**:
  - 初速（$V_0$）、重力加速度（$g$）、空気抵抗係数（$k_{drag}$）を反映した放物線シミュレーション。
  - **オイラー法物理更新**:
    $$\vec{a} = \vec{g} - k_{drag} |\vec{v}| \vec{v}$$
    $$\vec{v}_{t+\Delta t} = \vec{v}_t + \vec{a} \cdot \Delta t$$
    $$\vec{x}_{t+\Delta t} = \vec{x}_t + \vec{v}_{t+\Delta t} \cdot \Delta t$$
  - **CCD（Continuous Collision Detection / 連続衝突判定）**:
    前フレーム座標 $\vec{P}_{prev}$ と現フレーム座標 $\vec{P}_{curr}$ を結ぶ線分Raycastを実施。超高速な弾丸でも壁や敵をすり抜ける「トンネリング現象」を完全防止。
  - 弾丸メッシュと直近8ステップの位置を記録する光線トレイルリボンを描画。

### C. 組み込み型オートエイム / エイムアシスト (`AimAssistant.ts` & `LeadAimMath.ts`)
- **索敵・遮蔽物判定 (Line of Sight)**:
  - カメラ視線ベクトルとなす角度 $\theta$ が指定FOVコーン内（例: 16°以内）にある敵を抽出。
  - カメラから敵のターゲットボーン（頭部 `head` / 胸部 `chest`）へRaycastを飛ばし、手前に壁やコンテナがある敵を除外。
- **偏差射撃（リードエイム）計算**:
  - 相対位置 $\vec{R} = \vec{P}_t - \vec{P}_m$、ターゲット速度 $\vec{V}_t$、弾速 $V_b$ による二次方程式：
    $$(|\vec{V}_t|^2 - V_b^2) t^2 + 2(\vec{R} \cdot \vec{V}_t) t + |\vec{R}|^2 = 0$$
    この最小の正の実数解 $t$ を着弾時間として算出。
  - **重力迎角補正（Bullet Drop Compensation）**:
    弾丸は飛行中に $\Delta Y = \frac{1}{2} g t^2$ 落下するため、目標位置の高度を $+ \Delta Y$ 上方にオフセット補正：
    $$\vec{P}_{lead} = \vec{P}_t + \vec{V}_t t + \begin{pmatrix} 0 \\ \frac{1}{2} g t^2 \\ 0 \end{pmatrix}$$
  - 空気抵抗がある場合、ニュートン法の反復補正により平均弾速の低下率を加味して高精度に着弾点を収束。
- **追従挙動**:
  - **Smooth Assist**: 最短回転角差分をLerp補間（自然な吸い付き）。
  - **Instant Lock**: 目標迎角へ瞬時にカメラ角度をスナップ。
  - **Lead Marker**: HUD上に未来予測座標のサークルマーカーを描画（アシストOFF時でも偏差の目安が視覚化）。

### D. マルチプレイヤー連携 (`protocol.ts` & `server.ts` & `NetworkClient.ts`)
- 軽量WebSocketプロトコル（JSON形式）。
- 各クライアントの「位置」「移動速度」「視点回転」「ADS状態」を30Hzで同期。
- 射撃イベント（発射座標・発射ベクトル・武器プリセットID）を受信し、リモートクライアント側でローカル弾道エンジンによって同一の弾道・着弾判定を再現。

---

## 3. パラメータ設定プリセット

| パラメータ | ① フォートナイト / 荒野風 | ② デルタフォース風 | ③ アーケード風 |
| :--- | :--- | :--- | :--- |
| **弾道方式** | Projectile (物理弾道) | Projectile (物理弾道) | Hitscan (即着弾) |
| **視点モード** | TPS (肩越し三人称) | FPS (一人称) / TPS | FPS (一人称) |
| **初速 (Muzzle Velocity)** | 420 m/s | 680 m/s | 即着弾 (∞) |
| **重力加速度 (Gravity)** | 12.0 m/s² (やや強め) | 9.81 m/s² (実弾物理) | 0 m/s² (落下なし) |
| **空気抵抗係数 (Drag)** | 0.0003 (軽微) | 0.0018 (急激な減速・ドロップ) | 0 |
| **連射速度 (Fire Rate)** | 550 RPM | 600 RPM | 720 RPM |
| **拡散角 (Spread)** | 0.008 rad (適度なブレ) | 0.003 rad (高精度) | 0.005 rad |
| **反動 (Recoil Pitch/Yaw)** | 中程度 | 強いキックバック | 軽微 |
| **ADS FOV** | 55° | 35° (高倍率ズーム) | 60° |
| **エイムアシスト検知角** | 16° (広域) | 8° (狭小・シビア) | 12° |
| **偏差HUDマーカー** | 表示 (直感的) | 表示 (ミリタリー偏差) | 非表示 |

---

## 4. 起動・実行方法

### 🚀 ワンクリック起動 (Windows)
プロジェクトフォルダ内の **`start.bat`** をダブルクリックするだけです。
自動的にWebSocketサーバーとVite開発サーバーが起動し、ブラウザでアプリが開きます。

### 💻 コマンドラインからの起動
```bash
# 依存関係のインストール (初回のみ)
npm install

# サーバーとアプリの同時起動
npm start
```

ブラウザで **`http://localhost:3000/`** を開いてください。

---

## 5. 操作方法

| キー / 操作 | 動作 |
| :--- | :--- |
| **画面クリック** | マウス操作の開始 (Pointer Lock) |
| **Esc** | マウス操作の一時解除 |
| **W / A / S / D** | プレイヤー移動 |
| **Space** | ジャンプ |
| **Shift (長押し)** | ダッシュ (移動速度向上) |
| **マウス移動** | 視点回転 (Yaw / Pitch) |
| **右クリック (長押し)** | ADS (ズームエイム) |
| **左クリック** | 射撃 (連射対応) |
| **V キー** | TPS (三人称) / FPS (一人称) 視点切り替え |
| **1 / 2 / 3 キー** | プリセット切り替え (1:フォートナイト風, 2:デルタフォース風, 3:アーケード風) |
| **C キー** | オートエイム / エイムアシスト ON / OFF |
| **画面右上 GUI** | 弾速・重力・空気抵抗・FOV・アシスト強度のリアルタイム調整 |
