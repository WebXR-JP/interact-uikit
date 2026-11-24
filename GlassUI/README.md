# GlassUI — 3D空間に配置するガラス風UIコンポーネント

XRift のワールド内に設置できる、透明感のあるガラス風のボタン＆スイッチです。画面に重ねる 2D の Web UI（HTML）ではなく、3D 空間上に存在する立体オブジェクトとして動作します。

クリック判定には XRift 標準の `Interactable` をそのまま使用しつつ、以下のような「押した手ごたえ（フィードバック）」を追加しています。

- **押し込みアニメーション**: 押すと奥へ沈み込み、バネのように少し跳ね返ってから元の位置に戻る
- **光のエフェクト**: 中央から縁へ光の波紋が広がり、周囲に光の粒（パーティクル）が散る
- **効果音**: 操作時にトーン音が鳴る（ON 時は上がる 2 音、OFF 時は下がる 2 音）
- **ハプティクス（振動）**: VR コントローラーやスマートフォンが短く振動する
- **ホバー演出**: 視線の先（画面中央）が重なると、縁がほんのり明るく光る
- **ON 状態の表示**: ON の間は、ボタンの縁を指定した色の光が周回する

このフォルダ単体で完結しており、外部の画像・音声・フォントファイルは一切使用していません（アイコンと文字は Canvas で動的に描画し、効果音は Web Audio でリアルタイム合成しています）。

別のワールドへ導入する際は、フォルダごと `src/components/` にコピーしてください。依存パッケージは `three`、`@react-three/fiber`、`@xrift/world-components` の 3 つのみです。

配布元リポジトリは [WebXR-JP/interact-uikit](https://github.com/WebXR-JP/interact-uikit) です。設計思想やコントロールパネルの実装サンプル、XRift の `Interactable` 特有のハマりどころについては、リポジトリ側の README に詳しくまとめています。

## 使い方

```tsx
import { GlassButton, GlassSlider, GlassSwitch, setGlassEnvironment } from './components/GlassUI'

// ON / OFF を切り替えるトグルボタン（状態は親側で管理。全員で同期する場合は useInstanceState を使用）
<GlassButton
  id="bgm"                                  // XRift の Interactable 用 ID（ワールド内で一意の文字列）
  position={[0, 1.2, -0.5]}
  icon="music"
  tint="#63d6ff"                            // ON 時の発光色
  label={{ ja: 'BGM', en: 'Music', zh: '音乐' }}
  on={bgm}
  onPress={() => setBgm(!bgm)}
  hint="BGM を切り替える"                    // ターゲット時に XRift が表示するツールチップ文字列
/>

// 単発実行のプッシュボタン（on を渡さない）
<GlassButton id="next" shape="pill" icon="next" label={{ ja: '次へ', en: 'Next', zh: '下一个' }} onPress={next} />

// 画像を表示するタイルボタン
<GlassButton id="photo" shape="tile" size={0.12} image={`${baseUrl}photo.webp`} label="写真" on={shown} onPress={toggle} />

// ノブがスライドするトグルスイッチ
<GlassSwitch id="lamp" on={lamp} onPress={() => setLamp(!lamp)} label={{ ja: '明かり', en: 'Light', zh: '灯光' }} />

// − ＋ ボタンで値を動かすスライダー（値は 0〜1。自分だけの音量なら useState、インスタンス全体で共有するなら useInstanceState で管理）
<GlassSlider id="bgm-volume" value={volume} onChange={setVolume} label={{ ja: 'BGM の大きさ', en: 'Music volume', zh: '音乐音量' }} />
```

各コンポーネントの正面は `+z` 方向です。配置する向きは `rotation` で調整してください（少し上向きに傾けると、見下ろした際に押しやすくなります）。

ボタン単体で空中に浮かべるよりも、`GlassPlate`（ガラスパネル）の上に並べて手すりや台座に設置すると、「操作パネル」として直感的に認識しやすくなります。

```tsx
// 案内板のように傾けたプレート上にボタンを並べる（ボタンはプレート表面から 2.6cm 浮かせて配置）
<GlassPlate width={0.78} height={0.36} position={[0, 1.05, 0]} rotation={[-0.85, 0, 0]}>
  <GlassButton id="fireworks" position={[-0.11, 0.04, 0.026]} icon="fireworks" on={on} onPress={toggle} />
  <GlassButton id="bgm" position={[0.11, 0.04, 0.026]} icon="music" on={bgm} onPress={toggleBgm} />
</GlassPlate>
```

## コンポーネント一覧

| コンポーネント | 形状・見た目 | 向いている用途 |
| --- | --- | --- |
| `GlassButton`（`shape="round"`） | レンズ状に膨らんだ円形。中央にアイコン、下部にラベル | ON / OFF 切り替え（花火・BGM・動画など）、単発アクション |
| `GlassButton`（`shape="pill"`） | 横長のカプセル型。内部にアイコンとラベルを横並び表示 | 「次へ」など、テキストで明確に示したい操作 |
| `GlassButton`（`shape="tile"`） | 角丸の正方形。表面全体に画像を表示 | 画像や動画の選択、サムネイル表示 |
| `GlassSwitch` | 溝に沿ってノブがスライドするスイッチ | 汎用的な ON / OFF 切り替え |
| `GlassSlider` | 細い溝の両端に − ＋ ボタンが付いたスライダー。値の位置まで溝が光る（ノブなし） | 音量・明るさ・速度など、`0`〜`1` の値の調整 |
| `GlassPlate` | 薄いガラスのベースパネル（クリック判定なし） | 複数のボタンをまとめて配置する台座 |

### `GlassButton` の主な Props

| Prop | 説明 |
| --- | --- |
| `id` | XRift の `Interactable` に渡す一意の ID（**必須**） |
| `shape` / `size` / `width` | 形状とサイズ（単位: m）。デフォルトは直径 `0.1` m の円形（`round`） |
| `icon` | プリセットアイコン名、またはカスタム描画関数 |
| `image` | アイコンの代わりに表示する画像（URL または `THREE.Texture`）。ボタンの形状に合わせて自動で切り抜かれます |
| `label` / `labelWidth` | ラベル表示。文字列または `{ ja, en, zh }` 形式（日本語を大きく、英語・中国語を小さく併記） |
| `on` | ON / OFF の状態（`boolean`）。省略した場合は単発のプッシュボタンとして動作します |
| `tint` | ON 時のテーマカラー |
| `progress` | 縁に表示する進捗ゲージ（`0`〜`1` の数値、または値を返す関数）。再生ボタンの進行度表示などに利用できます |
| `onPress` / `hint` / `enabled` / `sound` | クリック時のコールバック / ホバー時の説明文 / 有効・無効の切り替え / 効果音の有無 |

- **`GlassSwitch` の Props**: `id`、`on`、`size`（溝の高さ。デフォルト `0.07` m）、`label`、`labelWidth`、`tint`、`onPress`、`hint`、`enabled`、`sound`
- **`GlassSlider` の Props**: `id`（両端のボタンの `Interactable` の ID は `${id}-minus` / `${id}-plus`）、`value`（`0`〜`1`）、`onChange`、`length`（溝の長さ。デフォルト `0.2` m）、`size`（溝の高さ。デフォルト `0.022` m）、`label`、`labelWidth`、`tint`（溝の光の色）、`step`（1 回の操作で動く量。デフォルト `0.1`）、`hints`（− ＋ ボタンのホバー時の説明文 `{ minus, plus }`）、`enabled`、`sound`。ボタンを押すと、溝の光が値の位置までなめらかに伸び縮みし、少しのあいだ明るくなります
- **`GlassPlate` の Props**: `width`、`height`、`title`（パネル上端に添える見出しテキスト）

いずれのコンポーネントも、`position` や `rotation` など Three.js の `group` が受け取る標準の Props をそのまま渡すことができます。

### アイコンの指定と自作

以下のプリセットアイコンが用意されています。
`music` / `fireworks` / `play` / `stop` / `pause` / `video` / `image` / `power` / `sound` / `light` / `next` / `sparkle` / `check` / `minus` / `plus` / `info` / `pin` / `mic`

独自のアイコンを追加したい場合は、`24 × 24` の座標系に線（`stroke`）と塗り（`fill`）で描画する関数を `icon` に渡します。

```tsx
const heart: IconPainter = (ctx) => {
  const path = new Path2D('M12 20 L4.5 12.5 A4.4 4.4 0 0 1 12 7 A4.4 4.4 0 0 1 19.5 12.5 Z')
  ctx.fill(path)
  ctx.stroke(path)
}

<GlassButton id="like" icon={heart} onPress={like} />
```

## ワールドの環境色に合わせる

ガラス表面には、周囲の「空・地平線・地面」の色が擬似的に映り込みます。初期化時に一度だけ、ワールドの雰囲気に合わせた環境色（リニア RGB）を設定してください。

```ts
setGlassEnvironment({
  sky: [0.05, 0.07, 0.14],
  horizon: [0.3, 0.2, 0.24],
  ground: [0.01, 0.012, 0.016],
})
```

デフォルトの見た目は暗いワールド向けに調整されています（ほぼ透明で、エッジと反射光のみが浮かび上がる表現）。昼間のような明るいワールドで使用する場合は、ガラスの不透明度（`shade`）を上げ、ラベル文字色（`label`）を暗くすると視認性が向上します（※明るい背景での表示検証は単色背景でのみ行っています）。

```ts
setGlassEnvironment({ shade: 0.4, label: [0.04, 0.07, 0.14] })
```

効果音の音量は `glassSound.volume`（`0`〜`1`）で変更できます。UI コンポーネントを使わずに効果音だけを鳴らしたい場合は `playTone('press' | 'on' | 'off')` を呼び出してください。

## 実装上の注意点・仕様

- **インタラクトの有効距離**: XRift のクリック判定は約 3.5m 先までしか届きません。プレイヤーが立ち止まる位置から 1m 前後の距離に配置すると操作しやすくなります。
- **プレイヤーのめり込み防止**: 歩行可能なエリアに直接置くと、アバターの体が UI にめり込んでしまいます。手すりや台座の上に設置し、足元に低いコライダー（当たり判定）を置いてプレイヤーの接近を止める構成を推奨します。
- **ボタンをコライダーで覆わない**: ボタンを別のコライダーの内部や奥に配置しないでください。進入防止用のボックスコライダーでボタンごと覆ってしまうと、開発環境では押せても **XRift 本番環境ではレイが遮られて一切押せなくなる** 現象を確認しています。コライダーはボタンより低い位置など、目線からボタンへの射線を遮らない場所に配置してください。
- **`label` オブジェクトや自作 `icon` 関数の扱い**: `label` に渡す多言語オブジェクト `{ ja, en, zh }` は描画する文字列で、`icon` に渡すカスタム描画関数は描画結果で比較しています。再レンダリングのたびに新しい参照を渡しても、内容が同じであればテクスチャは再生成されません。内容が変わったときだけ、そのコンポーネントのテクスチャを作り直し、古いテクスチャは破棄します。なお、カスタム描画関数は比較のために再レンダリングごとに 1 回小さく描画するので、コンポーネントの外側で定数として定義しておくと、その処理も省けます。
- **ホバー演出の判定方法**: 縁が光るホバー演出は「画面中央（視線の先）」との重なりで独自に判定しています。そのため、VR モードでコントローラーのレーザーポインターだけを向けた状態では光りません（クリック操作自体は XRift 側の判定で行われるため、ポインターから問題なく押せます）。
- **背景の屈折・ブラー処理の省略**: 背面にある景色をキャプチャしてぼかしたり屈折させたりする処理は行っていません。その分パフォーマンス負荷が軽く、端末や GPU による見た目の差異も発生しにくい設計になっています。
- **描画順序（`renderOrder`）**: 半透明オブジェクトであるため、通常の不透明オブジェクトより後に描画されるよう `GLASS_ORDER` を設定しています。ワールド内に GlassUI よりもさらに手前（後）に描画したい半透明オブジェクトがある場合は、それより大きい `renderOrder` を指定してください。
- **連打・チャタリング防止**: `0.14` 秒以内に連続して発火したクリックイベントは、1 回の入力としてデバウンス処理されます。
