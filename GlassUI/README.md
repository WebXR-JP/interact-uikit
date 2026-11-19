# GlassUI — 空間に置くガラスのボタン

XRift のワールドの中に置く、澄んだガラスのボタンとスイッチです。画面に重ねる Web の UI（HTML）ではなく、
どれも 3D 空間にある立体の物で、押すしくみは XRift の `Interactable`（狙って押す）のままです。
そこに「押した手ごたえ」を足してあります。

- 押すと奥へ沈み、ばねで少し行き過ぎてから戻る
- 中央から縁へ光の波紋が走り、縁から光の粒が散る
- ポーンと鳴る（入れたときは上がる 2 音、切ったときは下がる 2 音）
- VR のコントローラーやスマホが短く震える
- 視線の先（画面の中央）が重なると、縁が少し明るくなる
- 入のあいだは、縁を色の光が回る

このフォルダーだけで完結しています。画像・音源・フォントのファイルは使いません（アイコンと文字はキャンバスに描き、
音はその場で合成します）。ほかのワールドで使うときは、フォルダーごと `src/components/` にコピーしてください。
必要なのは `three`、`@react-three/fiber`、`@xrift/world-components` だけです。

配布元は <https://github.com/WebXR-JP/interact-uikit> です。考え方、操作盤のサンプル、
XRift の `Interactable` の落とし穴は、そちらの README にまとめてあります。

## 使い方

```tsx
import { GlassButton, GlassSwitch, setGlassEnvironment } from './components/GlassUI'

// 入／切のボタン（状態は使う側で持つ。全員で共有したければ useInstanceState に）
<GlassButton
  id="bgm"                                  // XRift のインタラクトの id（ワールドの中で重ならない名前）
  position={[0, 1.2, -0.5]}
  icon="music"
  tint="#63d6ff"                            // 入のときの色
  label={{ ja: 'BGM', en: 'Music', zh: '音乐' }}
  on={bgm}
  onPress={() => setBgm(!bgm)}
  hint="BGM を切り替える"                    // 狙ったときに XRift が出す説明
/>

// 押すだけのボタン（on を渡さない）
<GlassButton id="next" shape="pill" icon="next" label={{ ja: '次へ', en: 'Next', zh: '下一个' }} onPress={next} />

// 画像を載せたタイル
<GlassButton id="photo" shape="tile" size={0.12} image={`${baseUrl}photo.webp`} label="写真" on={shown} onPress={toggle} />

// つまみが動くスイッチ
<GlassSwitch id="lamp" on={lamp} onPress={() => setLamp(!lamp)} label={{ ja: '明かり', en: 'Light', zh: '灯光' }} />
```

部品は +z を向いています。置く向きは `rotation` で決めます（少し上を向かせると、見下ろしたときに押しやすい）。

宙にぽつんと浮かべるより、`GlassPlate`（ガラスの板）に載せて、手すりや台に据え付けたほうが「操作する場所」として分かります。

```tsx
// 案内板のように傾けた板に、ボタンを並べる（ボタンは板の面から 2.6 cm 浮かせる）
<GlassPlate width={0.78} height={0.36} position={[0, 1.05, 0]} rotation={[-0.85, 0, 0]}>
  <GlassButton id="fireworks" position={[-0.11, 0.04, 0.026]} icon="fireworks" on={on} onPress={toggle} />
  <GlassButton id="bgm" position={[0.11, 0.04, 0.026]} icon="music" on={bgm} onPress={toggleBgm} />
</GlassPlate>
```

## 部品

| 部品 | 形 | 向いている用途 |
| --- | --- | --- |
| `GlassButton`（`shape="round"`） | レンズのようにふくらんだ丸。中にアイコン、下にラベル | 入／切（花火・BGM・動画）、押すだけの操作 |
| `GlassButton`（`shape="pill"`） | 横長のカプセル。中にアイコンとラベル | 「次へ」のような、言葉で示したい操作 |
| `GlassButton`（`shape="tile"`） | 角丸の四角。面いっぱいに画像 | 画像や動画の選択、サムネイル |
| `GlassSwitch` | 溝の中をつまみが滑る | 汎用の入／切 |
| `GlassPlate` | 薄いガラスの板（押せない） | 部品をまとめて載せる台 |

`GlassButton` の主な指定:

| 指定 | 内容 |
| --- | --- |
| `id` | XRift のインタラクトの id（必須） |
| `shape` / `size` / `width` | 形と大きさ（m）。既定は差し渡し 0.1 m の丸 |
| `icon` | 用意してあるアイコンの名前か、自分で描く関数 |
| `image` | アイコンの代わりに載せる画像（URL かテクスチャ）。部品の形に切り抜かれる |
| `label` / `labelWidth` | ラベル。文字列か `{ ja, en, zh }`（日本語を大きく、英語と中国語を小さく添える） |
| `on` | 入／切の状態。渡さなければ押すだけのボタン |
| `tint` | 入のときの色 |
| `progress` | 縁に描く進み具合（0〜1。関数でもよい）。再生ボタンなどに |
| `onPress` / `hint` / `enabled` / `sound` | 押されたとき / 狙ったときの説明 / 押せるか / 音を鳴らすか |

`GlassSwitch` は `id`・`on`・`size`（溝の高さ。既定 0.07 m）・`label`・`labelWidth`・`tint`・`onPress`・`hint`・`enabled`・`sound`、
`GlassPlate` は `width`・`height`・`title`（板の上の端に添える見出し）を受け取ります。どの部品も、`position` や `rotation` などの
グループの指定をそのまま渡せます。

用意してあるアイコン: `music` `fireworks` `play` `stop` `pause` `video` `image` `power` `sound` `light` `next` `sparkle` `check` `info` `pin` `mic`。
足したいときは、24 × 24 の枠に線と塗りで描く関数を `icon` に渡します。

```tsx
const heart: IconPainter = (ctx) => {
  const path = new Path2D('M12 20 L4.5 12.5 A4.4 4.4 0 0 1 12 7 A4.4 4.4 0 0 1 19.5 12.5 Z')
  ctx.fill(path)
  ctx.stroke(path)
}
<GlassButton id="like" icon={heart} onPress={like} />
```

## ワールドに合わせる

ガラスには、まわりの空・地平線・地面の色が映ります。ワールドの色を 1 度渡してください。

```ts
setGlassEnvironment({ sky: [0.05, 0.07, 0.14], horizon: [0.3, 0.2, 0.24], ground: [0.01, 0.012, 0.016] }) // リニア rgb
```

既定の見た目は暗いワールド向け（ほぼ透明で、縁と映り込みだけが光る）です。昼間のような明るいワールドでは、
ガラスを濃くして文字を暗い色にすると読めるようになります（明るい背景での確認は、単色の背景でしかしていません）。

```ts
setGlassEnvironment({ shade: 0.4, label: [0.04, 0.07, 0.14] })
```

音の大きさは `glassSound.volume`（0〜1）で変えられます。部品を使わずに音だけ鳴らすときは `playTone('press' | 'on' | 'off')`。

## 知っておくこと

- **届く距離**: XRift のインタラクトは 3.5 m ほどまでしか届きません。立ち止まる場所から 1 m 前後に置くと押しやすくなります。
- **体と重ならない所に**: 歩ける範囲の中に置くと、体がめり込みます。手すりや台に据え付けて、体はその下に置いた低い当たり判定で止めます。
- **当たり判定で包まない**: ボタンを当たり判定の箱の中や奥に置かないでください。体を止める箱でボタンごと包んでいたとき、
  XRift 本番ではどのボタンも押せませんでした（開発用の環境では押せていました）。当たり判定は、ボタンより低く、目からボタンへの線にかからない所に置きます。
- **ラベルと自作のアイコンは、同じ物を渡し続ける**: `label` に渡す `{ ja, en, zh }` と、`icon` に渡す自作の関数は、コンポーネントの外で
  定数にしておきます。描き直しのたびに新しい物を渡すと、そのたびに文字や絵を作り直すことになります
  （上の例は短く見せるために、その場に書いています）。
- **狙ったときの光**: 「視線の先」で判定しています。VR でコントローラーの光線だけを向けたときには光りません
  （押すこと自体は XRift 側の判定なので、光線で押せます）。
- **背景は取り込まない**: 向こうの景色をぼかしたり曲げたりはしていません（そのぶん軽く、端末によって見た目が変わる処理もありません）。
- **描く順番**: 半透明なので、ほかの物より後に描きます（`GLASS_ORDER`）。ワールドに、これより後に描きたい物があれば、
  その `renderOrder` をさらに大きくします。
- **押したときの二重反応**: 0.14 秒以内に続けて届いた「押した」を 1 回として扱います。
