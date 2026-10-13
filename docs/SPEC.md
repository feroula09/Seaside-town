# Seaside Town — 技術規格書（Spec）

> 版本：v0.1（草稿）　|　日期：2026-10-13　|　狀態：待評審
> 上游文件：[`docs/PRD.md`](./PRD.md)
> 本文件把 PRD 的需求轉成可直接實作的工程規格：座標與尺寸、資料結構、模組介面、演算法常數、狀態機、渲染管線、測試方式。PRD 的需求 ID（R-xx、P-xx、G-xx、C-xx、A-xx）在本文中以 `[R-01]` 形式標註追溯。

---

## 0. 對 PRD 待決問題的預設假設

PRD §15 的問題尚未定案，本規格先採以下預設，定案後只需修改對應章節：

| PRD 問題 | 本規格預設 | 影響章節 |
|----------|-----------|----------|
| 正式名稱 | 標題 `Seaside Town`，小標 `MINIATURE STUDIES` | §9 |
| 行動裝置 | v1 不正式支援；觸控不得報錯，單指＝拖水、雙指＝環繞 | §7 |
| 美術資產 | 全程式化生成；燈塔、起重機、貨輪亦以程式建模（不依賴外部 glTF） | §5 |
| 分享功能 | v1 不做 | — |
| 每船箱數 | 固定 8 箱 | §6 |

---

## 1. 技術棧與專案結構

### 1.1 依賴
| 套件 | 版本要求 | 用途 |
|------|---------|------|
| `three` | ≥ r170，實作時鎖定當下最新穩定版 | `three/webgpu`（WebGPURenderer）、`three/tsl`（著色器與 compute） |
| `typescript` | 5.x，`strict: true` | — |
| `vite` | 最新穩定版 | 開發伺服器與打包 |
| `vitest` | 最新穩定版 | 單元測試 |
| `@playwright/test` | 最新穩定版 | 端對端與截圖測試（使用環境預裝的 Chromium） |
| `lil-gui`、`stats-gl` | 最新穩定版，僅 `?debug=1` 時動態載入 | 除錯面板 |

不引入 UI 框架；面板以原生 DOM + CSS 實作。

### 1.2 目錄結構
```
/
├── index.html
├── public/
│   └── fallback.jpg            // 無 WebGPU / WebGL2 時顯示
├── src/
│   ├── main.ts
│   ├── config.ts               // 所有可調常數（本文件中的數值集中於此）
│   ├── core/                   // loop、store、events、input、rng、quality
│   ├── sim/                    // heightfield、jellyBody、buoyancy、boids
│   ├── world/                  // block、water、seabed、town、terminal、ship、pier、lighthouse、props、colliders
│   ├── game/                   // harborMachine、cranes、actions
│   ├── atmosphere/             // presets、flavours、sky、applyAtmosphere
│   ├── camera/                 // rig、orbit、firstPerson、presets
│   ├── render/                 // pipeline、post
│   ├── audio/                  // sound、synth
│   └── ui/                     // panel、hud、styles.css、strings.ts
└── tests/
    ├── unit/                   // vitest
    └── e2e/                    // playwright
```

### 1.3 npm scripts
| 指令 | 行為 |
|------|------|
| `dev` | `vite` |
| `build` | `tsc --noEmit && vite build` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:e2e` | `playwright test` |
| `lint` | `eslint .`（typescript-eslint recommended） |

### 1.4 URL 參數（除錯與測試用）
| 參數 | 值 | 作用 |
|------|----|------|
| `debug` | `1` | 顯示 lil-gui 與 FPS 面板 |
| `renderer` | `webgpu` \| `webgl` | 強制渲染後端 |
| `quality` | `high` \| `medium` \| `low` | 鎖定品質等級，停用自動調整 |
| `atmo` | `day` \| `sunset` \| `night` \| `cosmos` | 初始氛圍（覆蓋存檔） |
| `flavour` | `seaglass` \| `blueberry` \| `lime` | 初始口味 |
| `seed` | 整數 | 程式化生成種子，預設 `20261013` |
| `freeze` | `1` | 凍結時間於 t=10s、停用隨機動畫，供截圖測試 |
| `nosave` | `1` | 不讀不寫 localStorage |

---

## 2. 世界座標與尺寸

### 2.1 單位與座標系
- 右手座標系，**Y 軸向上**。1 單位（u）≈ 實際 4 公尺（微縮比例），一棟房子約 1–1.4 u 高。
- 方塊（Block）底面中心為世界原點的正下方：方塊佔 `x ∈ [-20, 20]`、`z ∈ [-20, 20]`、`y ∈ [-8, …]`。
- **靜水面**：`y = 0 + tideOffset`。Tide 滑桿 ±40 cm 對應 `tideOffset = cm × 0.01`（u），即 ±0.4 u。
- 預設鏡頭從 `+x, +y, +z` 方向的左前方俯視（見 §8），陸地位於畫面後方（−z）與右側（+x）。

### 2.2 平面配置（俯視，單位 u）
```
 z=-20 ┌────────────────────────────────────────────────┐
       │  Hillside 小鎮（梯田 4 階，y=2.5→8.5）  ⛪教堂    │
 z=-12 ├──────────────┬─────────────────────────────────┤
       │ 貨櫃堆場/起重機 │ 倉庫 Terminal │ 沿岸步道         │ quay y=1.5
 z=-8  ├══ 岸壁(拱) ══┴════════════════╧═══╗           │
       │  貨輪泊位 x∈[-16,-2], z=-6        ║ 右側陸地    │
       │                                    ║ x∈[12,20]  │
       │        果 凍 海                ┌──Pier (木棧) x 7→12, z=-2
       │                         🗼────防波堤────────────┤ z=3, x 4→12
       │  ⛵小艇巡航迴圈                                  ║
 z=20  └────────────────────────────────────────────────┘
      x=-20                                          x=20
```

| 區域 | 範圍 | 頂面高度 |
|------|------|---------|
| 方塊底 | 全區 | y = -8 |
| 海床 | 水域 | y = -6.0（外海）→ -2.0（近岸），以 fBm 噪聲 ±0.6 起伏 |
| 岸壁／碼頭面（Quay） | z ∈ [-12, -8]、x ∈ [-20, 12]；x ∈ [12, 20]、z ∈ [-12, 20] | y = 1.5 |
| 山坡梯田 | z ∈ [-20, -12]，4 階，每階深 2 u | y = 2.5、4.5、6.5、8.5 |
| 木棧碼頭（Pier） | x ∈ [7, 12]、z ∈ [-2.6, -1.4] | y = 0.9（樁柱至海床） |
| 防波堤 | x ∈ [4, 12]、z ∈ [2.4, 3.6] | y = 1.0；外側亂石帶寬 1.5 u |
| 燈塔 | 圓柱，底心 (4, 1.0, 3)，半徑 0.55，高 3.2 | — |
| 貨輪泊位 | 船中心 (-9, 0, -6)，船首朝 +x | — |

所有數值寫在 `src/config.ts` 的 `LAYOUT` 物件內，不可散落於各模組。

### 2.3 水域遮罩（Water Mask）
- 一張 256×256 的 R8 遮罩，`1` = 可動水、`0` = 陸地／防波堤／船體下方以外的固定邊界。
- 啟動時由 `LAYOUT` 的多邊形在 CPU 端光柵化，上傳為 storage buffer。
- 方塊外緣四邊為反射邊界。

---

## 3. 核心框架

### 3.1 主迴圈 `core/loop.ts`
- 模擬採**固定步長** `SIM_DT = 1/120 s`，每幀最多追趕 4 步（避免分頁切回時爆衝）。
- 渲染每個 `requestAnimationFrame` 一次，動畫插值使用 `alpha = accumulator / SIM_DT`。
- `paused === true` 時跳過所有模擬步與遊戲狀態機，但鏡頭、UI、背景星星閃爍照常更新。[G-04]
- 分頁隱藏（`visibilitychange`）時自動暫停音效並停止累積時間。

```ts
interface Tickable {
  /** 固定步長，僅在未暫停時呼叫 */
  fixedUpdate?(dt: number, t: number): void;
  /** 每幀呼叫，含暫停狀態 */
  frameUpdate?(dt: number, t: number, paused: boolean): void;
}
```

### 3.2 全域狀態 `core/store.ts`
單一 store，訂閱制，所有 UI 與系統透過它讀寫設定。

```ts
type Atmosphere = 'day' | 'sunset' | 'night' | 'cosmos';
type Flavour = 'seaglass' | 'blueberry' | 'lime';
type CameraMode = 'orbit' | 'firstPerson';
type CameraPreset = 'quay' | 'pier' | 'lighthouse' | 'hillside' | 'terminal' | 'shipDeck' | 'default';
type HarborPhase = 'arriving' | 'unloading' | 'unloaded' | 'departing' | 'atSea';

interface AppState {
  settings: {
    atmosphere: Atmosphere;      // 預設 'sunset'
    flavour: Flavour;            // 預設 'seaglass'
    firmness: number;            // 0.25–2.00，預設 1.00，步進 0.05
    waveDamping: number;         // 0.00–1.00，預設 0.35，步進 0.01
    tideCm: number;              // -40–40，預設 0，步進 1
    sound: boolean;              // 預設 true
  };
  stats: { boxes: number; voyages: number; fed: number };
  harbor: { phase: HarborPhase; unloaded: number; total: 8 };
  camera: { mode: CameraMode; preset: CameraPreset; label: string };
  paused: boolean;
  renderer: { backend: 'webgpu' | 'webgl2'; quality: 'high' | 'medium' | 'low' };
}

interface Store {
  get(): Readonly<AppState>;
  set(patch: DeepPartial<AppState>): void;
  subscribe(selector: (s: AppState) => unknown, cb: (value: unknown) => void): () => void;
}
```

### 3.3 事件匯流排 `core/events.ts`
瞬時事件（不屬於狀態）走事件匯流排，主要給音效與特效使用。

```ts
type GameEvent =
  | { type: 'box:landed'; slot: number }
  | { type: 'ship:castOff' } | { type: 'ship:departed' } | { type: 'ship:arrived' }
  | { type: 'horn' }
  | { type: 'feed'; at: Vec2 }
  | { type: 'water:poke'; at: Vec2; strength: number }
  | { type: 'lifebuoy:splash'; at: Vec2; speed: number }
  | { type: 'block:release'; tilt: number }
  | { type: 'reset' };
```

### 3.4 持久化
- key：`seaside-town:v1`；內容：`{ v: 1, settings, stats }`。
- 寫入：設定或計數變動後 debounce 500 ms。讀寫一律包 `try/catch`，失敗時靜默使用預設值。[G-06]
- 版本不符時丟棄舊資料。
- 鏡頭、暫停狀態、場景物件不持久化。

### 3.5 亂數
`core/rng.ts` 提供 `mulberry32(seed)`；所有程式化生成與動畫隨機都從具名子種子派生（`rng.fork('town')`），確保同一 seed 結果完全一致，支援截圖測試。

---

## 4. 模擬（Simulation）

### 4.1 水面高度場 `sim/heightfield.ts` [P-01][P-06][R-04]

**資料**：三個 `instancedArray(N*N, 'float')` storage buffer：`hPrev`、`hCurr`、`hNext`（輪替），`N = 256`（low 品質為 128）。格距 `dx = 40 / N`。

**更新方程**（每個 SIM_DT 一次 compute dispatch）：
```
lap   = h[i-1,j] + h[i+1,j] + h[i,j-1] + h[i,j+1] - 4h[i,j]
hNext = (2·h - hPrev + (c·dt/dx)² · lap) · decay + source[i,j]
hNext = hNext · mask[i,j]
```
- 波速 `c = 3.0 × firmness`（u/s）。CFL 條件 `c·dt/dx ≤ 0.70`：`N=256` 時 `c_max ≈ 13`，firmness 上限 2.0 對應 c=6，安全。啟動時以斷言檢查。
- 衰減 `decay = exp(-λ·dt)`，`λ = 0.05 + 2.95 × waveDamping²`（1/s）。
- 邊界：越界取樣時鏡像（反射邊界）。
- 振幅夾限：`|h| ≤ 0.8 u`，避免數值爆炸。

**施力（source）**：每步先清空，再由 CPU 累積的擾動列表（每步上限 16 筆）寫入：
```ts
interface Disturbance { x: number; z: number; radius: number; amount: number } // 世界座標
// 高斯：source += amount · exp(-(d²)/(radius²))，在 compute 內對每格累加
```

| 來源 | radius | amount（每步） |
|------|--------|---------------|
| 滑鼠拖曳水面 | 0.9 | `-0.012 × clamp(指標速度 u/s, 0, 20)`，沿軌跡每 0.3 u 插一點 |
| 點擊（未拖曳） | 0.6 | `-0.06` 單次 |
| 救生圈落水 | 0.5 | `-0.02 × 落水速度` 單次 |
| 小艇尾跡 | 0.35 | `-0.004` 持續，位於船尾 |
| 貨輪行駛 | 0.9 | `-0.006` 持續 |
| Horn | 環形，半徑 1.2→8 擴張 0.6 秒 | `0.003` |
| 魚吃飼料 | 0.15 | `-0.003` 單次 |

**法線**：渲染時在頂點著色器以中央差分從 `hCurr` 計算，不另存法線貼圖。

### 4.2 果凍方塊 `sim/jellyBody.ts` [P-02][P-03]

整個方塊（陸地＋水）為剛體傾斜，水體額外有剪切晃動。

**狀態**：
```ts
interface JellyState {
  tilt: Vec2;      // 繞 x、z 軸的傾角（rad），|tilt| ≤ 0.21（12°）
  tiltVel: Vec2;
  shear: Vec2;     // 水體頂面相對底面的水平位移（u）
  shearVel: Vec2;
  grab: { active: boolean; target: Vec2 } ; // 拖曳中指標要求的傾角
}
```

**動力學**（每 SIM_DT）：
```
k  = 60 × firmness²                    // 剛度
ζ  = 0.06 + 0.54 × waveDamping         // 阻尼比
cD = 2ζ√k
抓取中：  tiltAcc = k_grab·(target − tilt) − cD·tiltVel     (k_grab = 200)
放開後：  tiltAcc = −k·tilt − cD·tiltVel
剪切：    shearAcc = −(1.6k)·shear − cD·shearVel − 4.0·tiltAcc   // 慣性：傾斜加速度帶動水體反向剪切
```

**傾斜樞軸**：方塊底面中與被拖曳側相對的那條底邊（看起來像把方塊「掀起一側」）。實作時樞軸為 `(−sign(target.x)·20, −8, −sign(target.z)·20)` 的投影，傾角為 0 時平滑回到中心。

**與高度場耦合**（晃動）：每步對水面施加線性梯度源：
```
source[i,j] += −β · (tiltAcc.x · z_j + tiltAcc.y · x_i) · dt,   β = 0.004
```
使傾斜／回彈時水往低側堆積並反彈。

**剪切渲染**：水體頂點 `pos.xz += shear × smoothstep(-8, 0, pos.y)`（底部不動、頂部位移最大）。

**放開事件**：`|tilt| > 0.05` 放開時發出 `block:release`，觸發「啵」音效，音高隨 firmness 上升。

### 4.3 浮力 `sim/buoyancy.ts` [P-04]

- 每 2 個渲染幀，將高度場降採樣為 64×64（compute），以 `renderer.getArrayBufferAsync()` 非同步讀回 CPU；結果延遲 1–2 幀可接受。讀回未完成時沿用上一份。
- CPU 端雙線性取樣 `sampleHeight(x, z)` 與 `sampleNormal(x, z)`。
- 漂浮物模型（救生圈、浮標、小船、繫泊漁船）：

```ts
interface Floater {
  pos: Vec3; vel: Vec3; rot: Quat;
  radius: number;
  draft: number;       // 吃水深度（u）
  drag: number;        // 水平阻力
  anchor?: { at: Vec2; k: number };  // 浮標、繫泊船有錨，回拉剛度 k
}
// 垂直：彈簧追隨 y_target = tideOffset + h − draft（k=40、ζ=0.5）
// 傾角：slerp 到水面法線，速率 6/s
// 水平：vel.xz += −g·∇h·dt·0.6；vel.xz *= exp(−drag·dt)
// 邊界：與方塊外框、陸地遮罩做圓形碰撞並反彈（恢復係數 0.3）
```

### 4.4 魚群 `sim/boids.ts` [R-05]

- 48 條魚（low 品質 24），CPU 計算，`InstancedMesh` 繪製。
- 經典 Boids：分離（半徑 0.6）、對齊（1.5）、聚集（2.0），最大速 1.2 u/s。
- 約束：y 介於 `海床 + 0.3` 與 `水面 − 0.4`；離開水域遮罩時施加回拉。
- 餵食：在飼料點建立吸引子，持續 8 秒，吸引權重 3.0；魚抵達 0.3 u 內時消耗一顆飼料粒並發出 `water:poke`（小）。

---

## 5. 場景（World）

### 5.1 方塊底座與剖面 `world/block.ts` [R-01][R-02]
- 幾何：四個側面 + 底面；陸地頂面另由各區域模組負責。
- 側面材質（TSL）：依世界 y 與沿邊方向座標 s 生成地層：
  ```
  layerY_k(s) = base_k + 0.35·sin(s·0.25 + k·1.7) + 0.2·fbm(s·0.6)
  ```
  共 5 層，顏色由氛圍調色盤提供（§9.1 `strata[5]`）。層與層之間 0.04 u 的深色細線。
- 水域側面為**透明的果凍剖面**（屬於水體，見 §5.2），不是不透明地層；地層只出現在水體下方與陸地側面。

### 5.2 果凍海 `world/water.ts` [R-03][R-06]

**網格**：
- 頂面：`PlaneGeometry(40, 40, 160, 160)`（low：80×80），頂點著色器取樣 `hCurr` 位移。
- 側面：四片豎直條帶，頂點列與頂面邊緣同解析度；頂部頂點跟隨邊緣水高，底部頂點貼海床剖面線。
- 被陸地遮住的邊不生成側面。

**著色（TSL，單一材質、兩種輸入）**：
| 項 | 計算 |
|----|------|
| 折射 | 取 opaque pass 的顏色緩衝，UV 偏移 `normal.xz × 0.03 × 深度係數` |
| 吸收 | Beer–Lambert：`T = exp(−absorb × thickness)`；`thickness` = 場景深度 − 水面深度（頂面）或固定剖面厚度（側面） |
| 色調 | `mix(flavour.deep, flavour.shallow, T)` 與折射色相乘後疊加 |
| 菲涅耳 | Schlick，`F0 = 0.02`，邊光色 `flavour.rim`，強度 0.6 |
| 次表面 | `pow(saturate(dot(V, −L)), 4) × flavour.shallow × 0.35` |
| 高光 | GGX，粗糙度 0.08，太陽方向與色來自氛圍 |
| 剖面頂緣亮線 | 側面距頂 0.08 u 內加亮 `rim × 1.5`，模擬截圖中的白色亮邊 |
| 透明度 | `alpha = mix(0.55, 0.92, 1 − T)` |

**焦散** [R-06]：在海床與水下物件的材質中加入投影焦散：
`caustic = (voronoiEdge(uv·1.3 + t·0.05) × voronoiEdge(uv·1.7 − t·0.04))`，強度 `× sunIntensity × exp(−0.3 × depth)`。不需另外一個 pass。

### 5.3 海床 `world/seabed.ts` [R-05]
- 高度：§2.2 的近岸→外海斜坡 + fBm。
- 散佈（以 rng 決定位置，避開泊位與航道）：
  - 岩石 40 顆（二十面體細分 1 次，頂點噪聲擾動）。
  - 海草 120 叢（3–5 段的四邊形條帶，頂點著色器以 `sin(t + phase)` 擺動，振幅隨高度增加）。
  - 殘骸／管線 4 組（細長圓柱、框架）。
  - 錨鏈：浮標與海床間的細線。

### 5.4 小鎮 `world/town.ts` [R-01][R-08]
- 在 4 階梯田上依網格放置房屋地塊，每階 1 行（深 2 u），地塊寬 1.4–2.0 u，間隙 0.15–0.4 u，總數約 70 棟。
- 房屋參數（rng）：寬 1.1–1.6、深 1.0–1.4、牆高 0.8–1.3、屋脊高 0.4–0.7、屋頂朝向 0°/90°、牆色 8 選 1、屋頂色 5 選 1、窗戶 2–6 扇。
- 以**一個基礎房屋幾何 + InstancedMesh**（牆、屋頂分兩個 instanced mesh）繪製；變形透過 instance matrix 縮放達成。
- 窗戶：牆面材質以 UV 格點產生窗格遮罩，`emissive = windowMask × atmosphere.windowGlow × instanceRandom > threshold`（夜間約 70% 窗戶亮）。
- 教堂：固定位置於最高階 x≈14，帶尖塔（四角錐 + 細長方柱）。
- 樹木 40 棵（圓錐 / 球冠 + 樹幹，instanced）、路燈 30 盞（沿碼頭與梯田邊緣，夜間發光並加點光源上限 8 盞，其餘僅 emissive）。
- 調色盤（牆，sunset 基準）：`#F2C9A0 #E9A27A #F6E3B4 #D98B6A #EFD3C8 #C9D6DF #F4B183 #E8C1A0`；屋頂：`#E0673E #F08A3C #7A8AA6 #5B5F6E #C65A3A`。各氛圍再乘以 §9.1 的 `buildingTint`。

### 5.5 貨櫃碼頭 `world/terminal.ts` [R-10]
- 岸壁：沿 z=-8 的垂直牆面，每 2.2 u 一個拱形凹槽。
- 起重機 ×2：位於 x = -12（紅 `#C8473B`）、x = -6（藍 `#3F6FB5`）；門架高 4.5 u、吊臂伸出至 z = -4（越過船），結構由方柱組成；子節點：`gantry`（沿 x 平移 ±1.5）、`trolley`（沿 z 移動）、`spreader`（沿 y 升降，以細線連接）。
- 堆場：z ∈ [-11.5, -9]，貨櫃 3 列 × 6 行 × 最高 3 層，預先堆放約 60%；8 個保留槽位接收卸下的箱子。
- 貨櫃尺寸 1.2 × 0.5 × 0.5 u，顏色 `#D9534F #F0AD4E #5BC0DE #5CB85C #8E6CC4 #E8E1D4 #3E7CB1`，instanced。
- 倉庫（Terminal）：x ∈ [0, 6]、z ∈ [-12, -9]，鋸齒或雙坡屋頂、卷門。

### 5.6 貨輪 `world/ship.ts` [R-10]
- 船體 9 × 1.8 u，乾舷高 0.9 u，船首微尖，船尾艦橋（白色 2 層）。
- 甲板 8 個貨櫃槽位（2 列 × 4 行，部分疊 2 層的裝飾貨櫃不參與卸載）。
- 運動沿 `CatmullRomCurve3` 路徑，路徑點寫在 `LAYOUT.shipPath`：泊位 → 港內轉向 → 方塊西緣 x=-20 外 3 u。
- 駛出方塊邊界時以**溶解（dissolve）**淡出：`alpha` 依「超出邊界距離 / 3」遞減，並裁掉方塊外的水下部分。
- 搖晃：泊靠時以 Floater（錨定）運作；航行時 pitch/roll 取樣水面法線。

### 5.7 木棧碼頭、防波堤、燈塔、小物 `world/pier.ts` `world/lighthouse.ts` `world/props.ts`
- Pier：木板條（instanced）+ 樁柱 + 欄杆；繫泊漁船 2、帆船 2（Floater，錨定於棧橋）。
- 防波堤：混凝土方塊 + 外側亂石（二十面體，60 顆，深灰紫）。
- 燈塔：白紅條紋（4 段）、燈室、圓頂；夜間／宇宙開啟旋轉光束（兩個加法混色圓錐，0.6 rad/s）與點光源。[R-10]
- 浮標：綠色，錨定 Floater，位於 (1, 0, -1)。
- 巡航小艇：沿閉合路徑（4 點）以 1.5 u/s 行駛，持續注入尾跡（§4.1），白色尾跡另以頂面材質的泡沫遮罩（沿路徑的衰減軌跡貼圖 128×128）呈現。
- 海鷗 6 隻（P1）：在 y=6–10 繞圈；Horn 時散開 3 秒。

### 5.8 碰撞代理 `world/colliders.ts`
所有點擊拾取對**不可見代理幾何**做射線檢測，不對高面數網格檢測：
| 代理 | 幾何 | 用途 |
|------|------|------|
| `waterPlane` | y = tideOffset 的平面，限制在水域遮罩內 | 拖水、丟救生圈 |
| `blockSides` | 方塊四個側面（含水體側面） | 掀方塊 |
| `lifebuoys` | 每個救生圈一個球（r = 0.5） | 抓取甩出 |
| `landTop` | 陸地頂面簡化方塊 | 第一人稱地面、阻擋丟救生圈 |
| `clickables` | 船、起重機、燈塔的包圍盒 | 彩蛋（P2） |

---

## 6. 遊戲系統（Game）

### 6.1 港口狀態機 `game/harborMachine.ts` [G-01][G-02][G-03]

```
          ┌──────────┐ 抵達泊位        ┌───────────┐ 8 箱完成     ┌──────────┐
 init ───▶│ arriving │───────────────▶│ unloading │────────────▶│ unloaded │
          └────▲─────┘ voyages += 1*  └─────┬─────┘             └────┬─────┘
               │                            │ castOff()              │ 3 秒後自動 或 castOff()
               │                      ┌─────▼─────┐                  │
               │                      │ departing │◀─────────────────┘
               │                      └─────┬─────┘
               │      停留 18 秒            │ 船完全溶解
          ┌────┴─────┐◀─────────────────────┘
          │  atSea   │
          └──────────┘
 * 第一次進場（init 後的首次 arriving）不加 voyages；之後每次 arriving 完成 +1。
```

| 狀態 | 進入時動作 | 持續 | 離開條件 |
|------|-----------|------|---------|
| `arriving` | 生成新貨輪（新的 8 箱配色，rng），沿路徑反向駛入 | 約 10 秒 | 抵達泊位 |
| `unloading` | `unloaded = 0`；起重機開始輪流作業 | 每箱 4.0 秒，兩台交錯 → 約 18 秒 | `unloaded === 8` 或 `castOff()` |
| `unloaded` | — | 3 秒 | 計時到或 `castOff()` |
| `departing` | 發出 `ship:castOff`；船笛；解纜動畫 0.8 秒後沿路徑駛出 | 約 10 秒 | 溶解完成 → `ship:departed` |
| `atSea` | 堆場中這輪卸下的 8 箱以 2 秒逐一淡出（騰出槽位） | 18 秒 | 計時到 |

**castOff()**：僅在 `unloading`、`unloaded` 有效；其他狀態下按鈕為 `disabled`。`unloading` 中被呼叫時，正被吊起的箱子放回船上，未卸的箱子跟船離開。

**面板標題文字**：
| 狀態 | 標題 | 進度條 |
|------|------|--------|
| `arriving` | `Arriving…` | 0 |
| `unloading` | `Unloading {unloaded+1} / 8`（全部卸完前最大顯示 8） | `unloaded / 8` |
| `unloaded` | `Unloaded 8 / 8` | 1 |
| `departing` | `Casting off…` | 1 → 0 |
| `atSea` | `At sea` | 以剩餘秒數顯示 |

**Boxes**：每個貨櫃落在堆場槽位時（`box:landed`）+1。

### 6.2 起重機動作序列 `game/cranes.ts`
每一箱的序列（總計 4.0 秒，使用 easeInOutCubic）：
1. gantry 沿 x 對準船上槽位（0.5 s）
2. trolley 移至船上方（0.6 s）
3. spreader 下降（0.5 s）→ 抓取（0.2 s，貨櫃重新掛到 spreader 下）
4. spreader 上升（0.5 s）
5. trolley 移回堆場上方，gantry 對準堆場槽位（0.8 s）
6. spreader 下降（0.5 s）→ 放下（0.2 s）→ 發出 `box:landed`
7. spreader 回升（0.2 s）

兩台起重機分別負責船上前半與後半 4 個槽位，第二台延遲 2.0 秒開始，交錯作業。暫停時序列凍結。

### 6.3 動作 `game/actions.ts`
| 動作 | 前置條件 | 效果 | 冷卻 |
|------|---------|------|------|
| `castOff()` | phase ∈ {unloading, unloaded} | 見 §6.1 | — |
| `horn()` | 無 | 發出 `horn`；高度場環形擾動；海鷗散開；船上冒一縷蒸汽粒子 | 1.5 s |
| `feedFish()` | 無 | `fed += 1`；在目前鏡頭目標點附近水域（若不在水域則取最近水域點）灑 30 顆飼料粒子（沉降 0.15 u/s，8 秒後消失）；建立魚群吸引子 | 2.0 s |
| `togglePause()` | 無 | `paused = !paused` | — |
| `toggleSound()` | 無 | `sound = !sound`；Master gain 0.25 秒淡入淡出 | — |
| `reset()` | 無 | stats 歸零；harbor 回到 `arriving`（首次規則重新套用）；清除救生圈、飼料、尾跡；高度場與 jelly 狀態歸零；堆場回到初始；**不**重置設定與鏡頭 | — |
| `resetView()` | 無 | 鏡頭回 `default` 預設；若在第一人稱則先切回 orbit | — |

冷卻中按鈕顯示冷卻進度（按鈕底部 2px 進度線），不禁用點擊但忽略。

### 6.4 救生圈
- 上限 12 個；第 13 個生成時最舊者 0.5 秒淡出。
- **點擊丟擲**：從鏡頭前方 1.5 u 處生成，以拋物線飛向點擊點，飛行時間 `0.5 + 0.02 × 距離` 秒，附加隨機自轉。
- **甩出**：在救生圈上按下即抓起（升至水面上 0.6 u 隨指標移動），放開時以最後 80 ms 指標速度 ×0.9 拋出，水平速度上限 12 u/s。
- 落水：轉為 Floater（`radius 0.45, draft 0.08, drag 0.6`），並發出 `lifebuoy:splash` 與水花粒子（20 顆，0.6 秒）。
- 落在陸地上：彈跳一次後停在原地，3 秒後淡出。

---

## 7. 輸入與手勢 `core/input.ts`

### 7.1 指標手勢判定
`pointerdown` 時對碰撞代理做射線檢測，優先順序：`lifebuoys` → `blockSides` → `waterPlane` → `landTop` → 空白。

| 按鍵 | 命中 | 移動 < 6 px 且 < 250 ms 放開 | 拖曳 |
|------|------|------------------------------|------|
| 左鍵 | 救生圈 | 輕推（小衝量） | 抓取並甩出 |
| 左鍵 | 方塊側面 | 輕彈（tilt 衝量 0.05） | 掀方塊：指標沿側面法線的螢幕位移 → 目標傾角，`target = clamp(位移px / 600 × 0.21)` |
| 左鍵 | 水面 | 丟救生圈到點擊點 | 拖水造浪（§4.1） |
| 左鍵 | 陸地／空白 | — | 環繞（與右鍵相同，方便觸控板） |
| 右鍵 | 任意 | — | 環繞 |
| 中鍵 / Shift+右鍵 | 任意 | — | 平移（限制目標點於方塊範圍 ±10 u） |
| 滾輪 | — | — | 縮放 |

- 觸控（非正式支援）：單指＝左鍵；雙指＝環繞＋捏合縮放。
- 指標在面板上時不傳遞給場景。
- 游標樣式：懸停水面 `crosshair`、方塊側面 `grab`／拖曳中 `grabbing`、救生圈 `grab`。

### 7.2 鍵盤
| 鍵 | 動作 | 優先級 |
|----|------|--------|
| `V` | 切換 orbit / firstPerson | P1 |
| `W A S D` / 方向鍵 | 第一人稱移動 | P1 |
| `Shift` | 第一人稱奔跑 | P1 |
| `Space` | 暫停 | P1 |
| `H` | Horn | P1 |
| `F` | Feed the fish | P1 |
| `C` | Cast off | P1 |
| `R` | Reset view | P1 |
| `1`–`6` | 鏡頭預設 Quay…Ship Deck | P1 |
| `Esc` | 第一人稱時退出指標鎖定並回到 orbit | P1 |

焦點在輸入元件（滑桿）上時，方向鍵與數字鍵交給元件處理。

---

## 8. 鏡頭 `camera/` [C-01]–[C-05]

### 8.1 Orbit
- 透視鏡頭，FOV 35°（偏長焦，加強微縮感），near 0.1、far 400。
- 球座標控制：距離 `[25, 110]`，極角 `[15°, 80°]`，方位角不限；阻尼係數 0.08。
- 平移目標點限制在 `x,z ∈ [-10, 10]`、`y ∈ [-2, 6]`。

### 8.2 預設視角（鏡頭位置 → 注視點）
| Preset | 面板名稱 | 右側標籤 | 位置 | 注視點 |
|--------|---------|---------|------|--------|
| `default` | — | `3/4 Diorama` | (-48, 46, 58) | (0, -1, -2) |
| `quay` | Quay | `Quay` | (-14, 6, 6) | (-6, 1.5, -9) |
| `pier` | Pier | `Pier` | (2, 3.5, 4) | (10, 0.8, -2) |
| `lighthouse` | Lighthouse | `Lighthouse` | (-4, 4, 12) | (4, 2.5, 3) |
| `hillside` | Hillside | `Hillside` | (0, 14, 2) | (4, 6, -16) |
| `terminal` | Terminal | `Terminal` | (-20, 10, -2) | (-9, 3, -10) |
| `shipDeck` | Ship Deck | `Ship Deck` | 船艦橋頂上 1.2 u，看向船首前方 | 跟隨 |

- 啟動時鏡頭為 `default`：六個預設按鈕都不高亮，標籤顯示 `3/4 Diorama`（參考截圖中 Quay 被高亮，本規格不沿用，以免與實際視角不符）。選擇預設後該按鈕高亮；使用者手動旋轉、平移或縮放後高亮清除，標籤改為 `Free`。
- 過渡：位置與注視點分別以 easeInOutCubic 插值 1.0 秒；`prefers-reduced-motion` 時直接跳轉。
- `shipDeck` 在船不在場（`atSea`）時按鈕禁用；若處於 shipDeck 時船離場，溶解開始前 1 秒自動切回 `default`。

### 8.3 第一人稱 [C-01, P1]
- 進入：從目前 orbit 注視點最近的可行走點出生，面朝水面。
- 眼高 0.45 u（約 1.8 m 換算），移動速度 1.2 u/s、奔跑 2.4 u/s。
- 可行走區域：陸地頂面、Pier、防波堤；以 2D 可行走遮罩（128×128）判定，不可走的格子做滑牆處理；高度取 `landTop` 的高度圖。
- 滑鼠：Pointer Lock，靈敏度 0.002 rad/px，俯仰 ±80°。
- 第一人稱時依然可以點擊動作按鈕（`Esc` 釋放指標鎖定後）。

---

## 9. 氛圍與口味 `atmosphere/`

### 9.1 氛圍預設資料
```ts
interface AtmospherePreset {
  sky: { kind: 'gradient'; top: Color; mid: Color; bottom: Color; sun?: { dir: Vec3; size: number; color: Color } }
     | { kind: 'cosmos' };
  sunDir: Vec3; sunColor: Color; sunIntensity: number;
  ambientTop: Color; ambientBottom: Color; ambientIntensity: number; // 半球光
  fog: { color: Color; near: number; far: number } | null;
  exposure: number;
  windowGlow: number;      // 0–1
  streetLights: boolean;
  lighthouseBeam: boolean;
  bloom: { strength: number; threshold: number; radius: number };
  buildingTint: Color;     // 乘到建築顏色上
  strata: [Color, Color, Color, Color, Color];
  ui: { panelBg: string; panelBorder: string; text: string; muted: string; accent: string; accentText: string };
}
```

| 參數 | Day | Sunset | Night | Cosmos |
|------|-----|--------|-------|--------|
| 天空 | `#BFD9EE`→`#E6F0F6`→`#F7F4EC` | `#C9A9C7`→`#E9C6C4`→`#F2DDB0`，太陽 (−0.6, 0.35, −0.7) | `#0E1530`→`#1B2550`→`#2C3566` + 星點 | 像素宇宙（§9.2） |
| sunDir | (0.4, 0.85, 0.3) | (−0.6, 0.35, −0.7) | (0.3, 0.7, −0.6)（月光） | (0.5, 0.75, 0.4) |
| sunColor / 強度 | `#FFF5E6` / 2.6 | `#FFC8A0` / 2.0 | `#9FB4FF` / 0.5 | `#C9C4FF` / 1.1 |
| 半球光 上/下 | `#DCEBFF` / `#E8DCC8` | `#F2C8D0` / `#E8C8A8` | `#2A3560` / `#141A30` | `#5A4C9A` / `#1E2A55` |
| 半球光強度 | 1.0 | 0.9 | 0.35 | 0.6 |
| 霧 | `#E6F0F6` 120–260 | `#E9C6C4` 110–240 | `#141B38` 90–220 | 無 |
| 曝光 | 1.0 | 1.05 | 0.9 | 1.0 |
| windowGlow | 0 | 0.25 | 1.0 | 1.0 |
| 路燈 / 燈塔光束 | 關 / 關 | 開 / 關 | 開 / 開 | 開 / 開 |
| bloom 強度 / 閾值 | 0 / — | 0.15 / 0.9 | 0.6 / 0.7 | 0.7 / 0.65 |
| buildingTint | `#FFFFFF` | `#FFE6D2` | `#8C93B8` | `#A9A3D6` |
| 地層 strata | `#E9D9B8 #D9B98E #C49A72 #9E7A5E #7A5E4A` | `#F2D3B4 #E8B79A #D99A86 #B98274 #8E6464` | `#3A3F63 #2F3555 #272C48 #20243B #191C2E` | `#3B3F7A #2E3468 #262B57 #1F2347 #181B38` |
| 面板底色 | `rgba(255,255,255,0.72)` | `rgba(62,44,42,0.82)` | `rgba(16,22,44,0.82)` | `rgba(20,22,48,0.82)` |
| 面板強調色 / 文字 | `#2F3A4A` / `#FFFFFF` | `#F5DCC6` / `#3A2A26` | `#E6E9F5` / `#141A30` | `#EDEAF7` / `#1A1C3A` |

切換：所有數值（含 CSS 變數）在 1.5 秒內插值；天空以兩個背景層交叉淡化。HUD 狀態膠囊文字立即更新為 `● WebGPU · {名稱}`。

### 9.2 Cosmos 背景
- 以全螢幕四邊形 + TSL 片段著色器在 **1/4 解析度**渲染後以最近鄰放大（得到像素風）：
  - 底色：`#1A1E4A` 漸層。
  - 星雲：兩層 fBm，色 `#B07CC6`、`#5BB5D9`、`#E7A2C9`，以 posterize（6 階）＋ 有序抖動（Bayer 4×4）產生像素顆粒。
  - 星系：螺旋 fBm（螺旋座標扭曲），位於畫面右上。
  - 星星：hash 網格點，2% 機率出星，亮度隨 `sin(t·rate + phase)` 閃爍；另有十字星 12 顆（2D sprite）。
- 帶環行星與月球：獨立的 2D sprite 層，以 Canvas 2D 在啟動時程式化繪製成 128×128 像素圖並以最近鄰放大；位置在畫面左上，隨鏡頭方位角做 0.05 倍視差平移。
- 背景不受方塊傾斜影響。

### 9.3 口味
```ts
interface FlavourPreset { shallow: Color; deep: Color; rim: Color; absorb: Vec3 }
```
| 口味 | shallow | deep | rim | absorb (RGB, 1/u) |
|------|---------|------|-----|------------------|
| `seaglass` | `#BFEDE6` | `#3FA9B5` | `#F2FFFD` | (0.45, 0.12, 0.10) |
| `blueberry` | `#B9C8FF` | `#3B4FC4` | `#EEF1FF` | (0.50, 0.35, 0.08) |
| `lime` | `#DDF5B0` | `#6FB43F` | `#F8FFE8` | (0.35, 0.10, 0.40) |

切換時以 0.8 秒插值所有 uniform。

---

## 10. 渲染管線 `render/`

### 10.1 初始化
```ts
const renderer = new WebGPURenderer({ antialias: false, forceWebGL: params.renderer === 'webgl' });
await renderer.init();                                   // 失敗 → 顯示 fallback
const backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
```
- `devicePixelRatio` 上限：high 2.0、medium 1.5、low 1.0。
- 色彩空間 sRGB，色調映射 `AgXToneMapping`。

### 10.2 每幀順序
1. **compute**：高度場步進 × n（n = 本幀模擬步數）→（每 2 幀）浮力降採樣。
2. **背景**：天空／宇宙全螢幕四邊形（Cosmos 為 1/4 解析度 RT 放大）。
3. **不透明 pass**：方塊、陸地、建物、海床、船、救生圈 → 顏色 + 深度 RT。
4. **水體 pass**：頂面與側面，讀取步驟 3 的顏色與深度做折射與吸收；寫入同一 RT。
5. **加法 pass**：燈塔光束、水花粒子、飼料粒子。
6. **後處理**（`PostProcessing` + TSL 節點）：Bloom（夜間／宇宙）→ 移軸景深（P1，`tiltShift` 帶寬 0.25，模糊上限 3 px）→ 色調映射 → FXAA。

### 10.3 陰影
- 單一方向光陰影，正交投影涵蓋方塊（48 × 48 u），貼圖 2048（medium 1024，low 關閉陰影改用烘焙 AO 的頂點色）。
- 水體不投射陰影；海床接收陰影（透過水的陰影以 0.6 倍強度呈現）。

### 10.4 品質分級 `core/quality.ts`
| 項目 | high | medium | low |
|------|------|--------|-----|
| 高度場 N | 256 | 256 | 128 |
| 水面網格 | 160² | 120² | 80² |
| 陰影 | 2048 PCF soft | 1024 PCF | 關（烘焙 AO） |
| Bloom | 全解析 | 半解析 | 關 |
| 移軸景深 | 開 | 關 | 關 |
| 魚數 | 48 | 48 | 24 |
| DPR 上限 | 2.0 | 1.5 | 1.0 |

**自動調整**：啟動以 `high` 開始；取滾動 2 秒平均幀時間，`> 22 ms` 持續 3 秒降一級，`< 12 ms` 持續 10 秒升一級（最多升回初始等級），每次變更後 5 秒內不再調整。`?quality=` 參數鎖定時停用。

### 10.5 效能預算（PRD §10.4 對應）
| 指標 | 上限 |
|------|------|
| Draw calls | 150 |
| 三角形 | 600k |
| compute dispatch / 幀 | ≤ 6 |
| GPU→CPU 讀回 | ≤ 16 KB / 2 幀 |
| JS 主執行緒 / 幀 | ≤ 4 ms（中階筆電） |
| 首次可互動 | ≤ 3 s（含著色器編譯；編譯期間顯示 Loading 淡出畫面） |
| 打包大小 | JS ≤ 900 KB gzip（three 本體佔多數），無其他大型資產 |

### 10.6 錯誤處理
- `renderer.init()` 拋錯或 `navigator.gpu` 不存在且 WebGL2 也不可用 → 隱藏 canvas，顯示 `fallback.jpg` 與一行說明文字。
- WebGPU `device.lost` → 嘗試以 WebGL2 重建一次；再失敗則顯示 fallback。
- 狀態膠囊綠點 `#3DBE7A` = WebGPU；黃點 `#E8B44A` = WebGL2。

---

## 11. 音效 `audio/` [A-01]–[A-03]

- 第一次 `pointerdown` 或 `keydown` 時建立 `AudioContext`（瀏覽器自動播放政策）；之前的事件不補播。
- 圖：`sources → category gain（sfx / ambient）→ master gain → compressor → destination`。
- 全部以合成產生，不需音檔：

| 音效 | 觸發 | 合成方式 |
|------|------|---------|
| 船笛 Horn | `horn`、`ship:castOff` | 兩個鋸齒波 92 Hz / 138 Hz（微失諧 ±2 cents）→ 低通 600 Hz → 包絡 A 0.08 / S 1.2 s / R 0.5 s |
| 果凍啵 | `block:release`、輕彈 | 正弦波 `f = 180 × firmness → 90 Hz` 指數下滑 0.25 s，+ 輕微顫音 |
| 戳水 | `water:poke`（拖曳時節流 120 ms） | 帶通白噪聲 800–2000 Hz，0.12 s |
| 水花 | `lifebuoy:splash` | 白噪聲 → 低通掃頻 4000→600 Hz，0.4 s，音量隨速度 |
| 起重機嗶 | spreader 開始下降 | 方波 1200 Hz，0.08 s × 2 |
| 貨櫃落地 | `box:landed` | 低頻正弦 70 Hz + 噪聲 click，0.15 s |
| 灑飼料 | `feed` | 10 個極短高頻 click 隨機分佈 0.4 s |
| 環境：海浪 | 常駐 | 粉紅噪聲 → 低通 500 Hz，增益以 0.1 Hz LFO 起伏；音量隨 waveDamping 反向微調 |
| 環境：海鷗 | 白天／夕陽隨機 8–20 s | 正弦 1800→1200 Hz 下滑 + 顫音，0.3 s × 2–3 |
| 環境：宇宙 pad | Cosmos | 3 個正弦（C4、G4、D5）慢速 detune，低通 1200 Hz |

- 氛圍切換時環境音 2 秒交叉淡化；夜晚停用海鷗。
- `sound = false` 時 master gain 0.25 s 淡至 0，並 `ctx.suspend()`。

---

## 12. UI `ui/`

### 12.1 DOM 結構
```html
<div id="app">
  <canvas id="scene"></canvas>
  <header class="hud-title">
    <p class="eyebrow">MINIATURE STUDIES</p>
    <h1>Seaside Town.</h1>
  </header>
  <div class="hud-badge" role="status"><span class="dot"></span><span id="badge-text">WebGPU · Sunset</span></div>
  <aside class="panel" aria-label="Harbor controls">
    <section class="panel-head">
      <h2 id="harbor-title">Unloading 1 / 8</h2>
      <div class="progress"><div class="progress-fill"></div></div>
      <dl class="stats"> Boxes / Voyages / Fed </dl>
    </section>
    <section class="actions"> Cast off｜Horn｜Feed the fish </section>
    <section class="camera"> 標籤+當前視角｜分段 Orbit/1st Person｜6 個 preset </section>
    <section class="atmosphere"> 分段 Day/Sunset/Night/Cosmos </section>
    <section class="flavour"> 分段 Sea glass/Blueberry/Lime </section>
    <section class="sliders"> Firmness｜Wave damping｜Tide </section>
    <section class="system"> Pause｜Sound｜Reset｜Reset view </section>
  </aside>
  <footer class="hud-hint"><strong>How to play</strong> — …</footer>
</div>
```

### 12.2 樣式規格
| 元素 | 規格 |
|------|------|
| 字體 | 標題 `Instrument Serif` italic（Google Fonts）；介面 `Inter` 400/600 |
| 小標 | 11px、字距 0.18em、大寫、`--muted` |
| 大標 | 40px、行高 1.0 |
| 面板 | 固定於右上 `top: 68px; right: 30px`，寬 268px，padding 16px，圓角 12px，`backdrop-filter: blur(14px)`，邊框 1px `--panel-border` |
| 面板標題 | `Instrument Serif` italic 16px；進度條高 2px，寬 100%，填色 `--accent` |
| 統計列 | 11px，`--muted` 標籤 + 600 粗數字，三欄 `space-between` |
| 主按鈕 | 高 28px，全寬，底色 `--accent`、字色 `--accent-text`，圓角 6px |
| 次按鈕 | 高 28px，底色 `rgba(255,255,255,0.06)`，邊框 1px `--panel-border` |
| 分段控制 | 容器底色 `rgba(255,255,255,0.05)`、圓角 6px、內距 3px；選中項 `--accent` 底、`--accent-text` 字 |
| 滑桿 | 自訂 `input[type=range]`：軌道 2px、拇指 12px 白色圓點；標籤 11px 左、數值右對齊（`1.00`、`0.35`、`0 cm`） |
| 區塊間距 | 區塊標題 11px `--muted`，與上一區塊間 14px，區塊之間 1px 分隔線 |
| 狀態膠囊 | 右上 `top: 26px; right: 30px`，高 26px，圓角 13px，深色底 |
| 提示列 | 左下 `bottom: 26px; left: 30px`，高 26px，圓角 13px，12px 字 |
| 按壓回饋 | `:active { transform: scale(0.97) }`，放開時 `cubic-bezier(.34,1.56,.64,1)` 180 ms 回彈 |
| 焦點 | `:focus-visible` 2px `--accent` 外框，offset 2px |

所有顏色以 CSS 變數 `--panel-bg --panel-border --text --muted --accent --accent-text` 定義，由 `applyAtmosphere` 寫入 `:root`。

### 12.3 小螢幕
- 視窗寬 < 900px：面板縮為右下角浮動按鈕，點擊展開為底部抽屜（最高 70vh，可捲動）；提示列隱藏；標題縮至 28px。
- 視窗寬 < 900px 時預設鏡頭距離 ×1.25。

### 12.4 文案
所有字串集中於 `ui/strings.ts`（`en`、`zh-TW` 兩份），依 `navigator.language` 選擇，P1。

### 12.5 無障礙
- 分段控制使用 `role="radiogroup"` / `role="radio"`、`aria-checked`；左右鍵切換。
- 滑桿使用原生 `input[type=range]`，`aria-valuetext` 帶單位。
- 計數器變更以 `aria-live="polite"` 宣讀（節流 2 秒）。
- `prefers-reduced-motion`：方塊傾角上限減半、鏡頭過渡瞬移、按鈕回彈關閉、宇宙星星閃爍頻率減半。

---

## 13. 測試

### 13.1 單元測試（Vitest）
| 對象 | 測項 |
|------|------|
| `harborMachine` | 完整循環狀態序列；首次 arriving 不加 voyages；castOff 在各狀態的有效性；reset 回到初始；暫停時計時不前進 |
| `cranes` | 一箱序列總時長 4.0 s；`box:landed` 恰好發出 8 次 |
| `heightfield`（CPU 參考實作） | CFL 斷言；無源時能量單調不增；遮罩格永遠為 0；夾限生效 |
| `jellyBody` | 放開後振盪收斂（firmness=1、damping=0.35 時 3 秒內 \|tilt\| < 0.005）；傾角上限 |
| `buoyancy` | 平靜水面上 Floater 收斂至 `tide − draft` |
| `store` / 持久化 | 預設值；損壞 JSON 與 localStorage 拋錯時回退預設；版本不符丟棄 |
| `rng` | 同 seed 輸出一致 |

高度場與果凍物理另有一份純 TypeScript 參考實作（`sim/*.ref.ts`），GPU 版本與之共用常數；單元測試針對參考實作。

### 13.2 端對端（Playwright，Chromium）
- 以 `?freeze=1&seed=20261013&nosave=1&quality=medium` 啟動。
- **冒煙**：頁面無 console error；狀態膠囊文字正確；canvas 非空白（取樣像素變異數 > 閾值）。
- **截圖迴歸**：四種氛圍 × 預設鏡頭共 4 張、三種口味 × Sunset 共 3 張，像素差容忍 2%。
- **互動**：點擊 Cast off 後標題變為 `Casting off…`；Feed the fish 使 Fed 變為 1；切換 Atmosphere 後膠囊文字更新；Tide 滑桿顯示 `cm`。
- WebGPU 在無頭 Chromium 可能不可用：e2e 預設以 `?renderer=webgl` 執行，另有一組標記為可選的 WebGPU 測試。

### 13.3 手動驗收
對照 PRD §13 的 10 條 P0 驗收標準逐條確認，並與參考截圖並排比較。

---

## 14. 實作順序（對應 PRD 里程碑）

| 里程碑 | 任務（依序） | 完成定義 |
|--------|-------------|---------|
| **M0** | 1. Vite/TS/three 專案骨架、lint、vitest、playwright 設定　2. 渲染器初始化與 fallback　3. 空方塊 + 地層側面　4. 高度場 compute + 水面網格 + 拖曳造浪　5. Orbit 鏡頭 | 拖曳水面有波、60 FPS、單元測試通過 |
| **M1** | 6. store / events / loop / 持久化　7. 果凍海材質（折射、吸收、菲涅耳、剖面）　8. jellyBody 與掀方塊　9. 程式化陸地、小鎮、碼頭、防波堤、燈塔　10. 貨輪、起重機、港口狀態機　11. 浮力與救生圈　12. 面板 UI 全部 P0 元件　13. Sunset + Cosmos 氛圍、三種口味　14. 鏡頭預設與過渡　15. Horn、水花音效、Sound 開關 | PRD §13 P0 驗收通過；e2e 冒煙與互動測試通過 |
| **M2** | 16. Day / Night 氛圍與 Bloom　17. 海床散佈、魚群、餵魚　18. 焦散　19. 小艇尾跡、海鷗　20. 第一人稱　21. 完整音效與環境音　22. 品質分級與自動調整　23. 鍵盤快捷鍵　24. 截圖迴歸測試 | 與參考截圖並排評審通過 |
| **M3** | 25. 小螢幕抽屜　26. zh-TW 文案　27. 彩蛋　28. 效能優化與打包大小檢查 | 效能預算全部達標 |

---

## 附錄 A：`config.ts` 鍵值總表（節錄）

```ts
export const SIM = {
  DT: 1 / 120, MAX_STEPS_PER_FRAME: 4,
  HF_N: { high: 256, medium: 256, low: 128 },
  WAVE_SPEED_PER_FIRMNESS: 3.0, CFL_MAX: 0.70, H_CLAMP: 0.8,
  DAMP_LAMBDA_MIN: 0.05, DAMP_LAMBDA_RANGE: 2.95,
  JELLY_K_BASE: 60, JELLY_K_GRAB: 200, JELLY_ZETA_MIN: 0.06, JELLY_ZETA_RANGE: 0.54,
  JELLY_TILT_MAX: 0.21, JELLY_SHEAR_K_MUL: 1.6, JELLY_SHEAR_INERTIA: 4.0, SLOSH_BETA: 0.004,
  READBACK_N: 64, READBACK_EVERY_FRAMES: 2,
};
export const GAME = {
  BOXES_PER_SHIP: 8, BOX_SECONDS: 4.0, CRANE_STAGGER: 2.0,
  UNLOADED_IDLE: 3, AT_SEA_SECONDS: 18,
  HORN_COOLDOWN: 1.5, FEED_COOLDOWN: 2.0, FEED_PELLETS: 30, FEED_ATTRACT_SECONDS: 8,
  LIFEBUOY_MAX: 12, LIFEBUOY_THROW_SPEED_MAX: 12,
};
export const CAMERA = {
  FOV: 35, DIST_MIN: 25, DIST_MAX: 110, POLAR_MIN_DEG: 15, POLAR_MAX_DEG: 80,
  DAMPING: 0.08, TRANSITION_SECONDS: 1.0,
  FP_EYE: 0.45, FP_SPEED: 1.2, FP_RUN: 2.4, FP_SENS: 0.002,
};
export const SETTINGS_RANGE = {
  firmness: [0.25, 2.0, 0.05, 1.0], waveDamping: [0, 1, 0.01, 0.35], tideCm: [-40, 40, 1, 0],
} as const; // [min, max, step, default]
```

## 附錄 B：PRD 需求追溯表

| PRD ID | 本文章節 |
|--------|---------|
| R-01 | §5.1、§5.4–5.7 |
| R-02 | §5.1 |
| R-03 | §5.2 |
| R-04 | §4.1、§5.2 |
| R-05 | §4.4、§5.3 |
| R-06 | §5.2 焦散 |
| R-07 | §10.3 |
| R-08 | §5.4、§9.1 |
| R-09 | §9.1、§9.2 |
| R-10 | §5.5–5.7 |
| R-11 | §10.2 |
| P-01、P-06 | §4.1 |
| P-02、P-03 | §4.2 |
| P-04 | §4.3 |
| P-05 | §4.1 來源表、§5.7 |
| P-07 | §2.1、§4.3 |
| G-01–G-03 | §6.1–6.3 |
| G-04、G-05 | §3.1、§6.3 |
| G-06 | §3.4 |
| C-01–C-05 | §8 |
| A-01–A-03 | §11 |
