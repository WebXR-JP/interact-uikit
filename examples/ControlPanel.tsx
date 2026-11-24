import type { ThreeElements } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useEffect, useMemo } from 'react'
import { BoxGeometry, type Material, MeshStandardMaterial } from 'three'
import { GlassButton, GlassPlate, GlassSwitch, type LabelText } from '../GlassUI'
import { type Controls, SHOW_LENGTH } from './useControls'

/**
 * 自立型操作パネルのサンプル。3D 空間内に実体として配置し、XRift 標準の Interactable で操作する。
 * 画面上に重ねる 2D の Web UI（HTML オーバーレイ）は使用しない。
 *
 * 2 本の支柱に案内板のように傾けたガラスプレートを取り付け、4 種類の UI コンポーネントを並べている:
 *   丸ボタン（進捗リング付き）・丸ボタン（ON/OFF トグル）・トグルスイッチ・カプセル型ボタン（単発実行）
 *
 * 原点はプレート真下の床面。プレートは +z 方向（プレイヤーが立つ側）かつ斜め上を向く。
 * 設置場所と向きは group の position と rotation で調整する。
 *
 *   const controls = useControls()
 *   <ControlPanel controls={controls} position={[0, 0, -2]} />
 */

/** プレートおよび支柱の寸法（単位: m） */
const PANEL = {
  width: 1.04,
  height: 0.36,
  /** 床面からプレート中心までの高さ（立った状態の胸元あたり） */
  lift: 1.05,
  /** プレートを手前に傾ける角度（ラジアン。0 で垂直、値が大きいほど上を向く）。見下ろした際に押しやすくする */
  tilt: 0.85,
  /** 各ボタン間の水平間隔と、プレート表面から浮かせる高さ */
  gap: 0.225,
  raise: 0.026,
  /** ボタン中心の Y 座標オフセット（下部にラベルが表示されるため、プレート中心より少し上に配置する） */
  row: 0.03,
  /** 支柱の X 座標オフセット（中心から左右への距離）と太さ。ガラス越しにボタンやラベルと重ならないよう両端に寄せる */
  post: 0.475,
  thickness: 0.028,
}

/**
 * アバターが操作パネルにめり込まないようにするためのコライダー寸法（床面から top の高さまで）。
 *
 * コライダーはボタンより低い位置までに留め、ボタン自体を覆わないようにする。
 * ボタンごと覆う高さのコライダーにすると、開発環境では押せても XRift 本番環境では一切押せなくなるため注意。
 * 視点からボタンへの射線が、どの立ち位置からでもこのコライダーの上を通るようにしている。
 */
const GUARD = { top: 0.75, depth: 0.36, margin: 0.07 }

/** ラベルはコンポーネント外で定数として定義する（再レンダリングのたびに新しいオブジェクトを渡すと、ラベル用テクスチャが再生成されてしまうため） */
const LABELS = {
  show: { ja: '演出', en: 'Show', zh: '演出' },
  music: { ja: 'BGM', en: 'Music', zh: '音乐' },
  light: { ja: '明かり', en: 'Light', zh: '灯光' },
  next: { ja: '次へ', en: 'Next', zh: '下一个' },
} satisfies Record<string, LabelText>

export interface ControlPanelProps extends Omit<ThreeElements['group'], 'children'> {
  /** useControls() の戻り値 */
  controls: Controls
  /** 支柱のマテリアル。省略時は淡いグレーの標準マテリアル（ワールド内の手すり等と同じマテリアルを渡すと周囲に馴染む） */
  postMaterial?: Material
}

export const ControlPanel = ({ controls, postMaterial, ...group }: ControlPanelProps) => {
  const stand = useMemo(
    () => ({
      material: new MeshStandardMaterial({ color: '#e4ebe4', roughness: 0.7, metalness: 0 }),
      post: new BoxGeometry(PANEL.thickness, PANEL.lift, PANEL.thickness),
      arm: new BoxGeometry(PANEL.thickness, PANEL.height * 0.78, PANEL.thickness * 0.7),
    }),
    [],
  )
  useEffect(
    () => () => {
      stand.material.dispose()
      stand.post.dispose()
      stand.arm.dispose()
    },
    [stand],
  )
  const material = postMaterial ?? stand.material

  const { show, showOn, light, music, now } = controls
  /** 各ボタンの X 座標を計算（左から index = 0, 1, 2, 3） */
  const column = (index: number) => (index - 1.5) * PANEL.gap

  return (
    <group {...group}>
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={stand.post} material={material} position={[side * PANEL.post, PANEL.lift / 2, 0]} />
      ))}
      <GlassPlate width={PANEL.width} height={PANEL.height} position={[0, PANEL.lift + 0.012, 0]} rotation={[-PANEL.tilt, 0, 0]}>
        {/* プレートを背面から支えるアーム */}
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={stand.arm} material={material} position={[side * PANEL.post, -0.02, -0.02]} />
        ))}

        {/* 時間経過を伴う演出: 同期するのは「開始時刻」のみ。外周の進捗リングは開始時刻と共有クロックから毎フレーム算出する */}
        <GlassButton
          id="panel-show"
          position={[column(0), PANEL.row, PANEL.raise]}
          icon={showOn ? 'stop' : 'play'}
          tint="#e58cff"
          label={LABELS.show}
          on={showOn}
          progress={showOn ? () => Math.min(Math.max((now() - show.startedAt) / SHOW_LENGTH, 0), 1) : undefined}
          onPress={controls.toggleShow}
          hint={showOn ? '演出を止める · Stop the show · 停止演出' : '演出を始める · Start the show · 开始演出'}
        />
        {/* ON / OFF トグル（ローカルのみ） */}
        <GlassButton
          id="panel-music"
          position={[column(1), PANEL.row, PANEL.raise]}
          icon="music"
          tint="#63d6ff"
          label={LABELS.music}
          on={music}
          onPress={controls.toggleMusic}
          hint={music ? 'BGM を切る · Music off · 关闭音乐' : 'BGM を入れる · Music on · 打开音乐'}
        />
        {/* ON / OFF トグル（インスタンス全体で共有）。スイッチは丸ボタンより縦幅が小さいため、ラベル位置が揃うよう少し下げる */}
        <GlassSwitch
          id="panel-light"
          position={[column(2), PANEL.row - 0.015, PANEL.raise]}
          tint="#ffd27a"
          label={LABELS.light}
          on={light}
          onPress={controls.toggleLight}
          hint={light ? '明かりを消す · Light off · 关灯' : '明かりをつける · Light on · 开灯'}
        />
        {/* 単発アクション（on を渡さないステートレスなボタン） */}
        <GlassButton
          id="panel-next"
          position={[column(3), PANEL.row, PANEL.raise]}
          shape="pill"
          size={0.08}
          width={0.2}
          icon="next"
          tint="#9fd0ff"
          label={LABELS.next}
          onPress={controls.next}
          hint="次へ進む · Next · 下一个"
        />
      </GlassPlate>

      {/* ボタンより低い位置にのみコライダーを配置し、アバターの進入だけを防ぐ */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[PANEL.width / 2 + GUARD.margin, GUARD.top / 2, GUARD.depth / 2]} position={[0, GUARD.top / 2, 0]} />
      </RigidBody>
    </group>
  )
}
