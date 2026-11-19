import type { ThreeElements } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useEffect, useMemo } from 'react'
import { BoxGeometry, type Material, MeshStandardMaterial } from 'three'
import { GlassButton, GlassPlate, GlassSwitch, type LabelText } from '../GlassUI'
import { type Controls, SHOW_LENGTH } from './useControls'

/**
 * 操作盤の例。ワールドの中に立っている物で、XRift のインタラクト（狙って押す）で操作する。
 * 画面に重ねる Web の UI（HTML）は使わない。
 *
 * 2 本の支柱に、案内板のように傾けたガラスの板を載せ、その上に部品を 4 つ並べてある:
 *   丸ボタン（進み具合の輪つき）・丸ボタン（入／切）・スイッチ・カプセル（押すだけ）
 *
 * 原点は床の高さ、板の真下。板は +z（人が立つ側）と上を向く。置く場所と向きは position と rotation で決める。
 *
 *   const controls = useControls()
 *   <ControlPanel controls={controls} position={[0, 0, -2]} />
 */

/** 板と支柱の寸法（m） */
const PANEL = {
  width: 1.04,
  height: 0.36,
  /** 床から板の中心までの高さ。立った人の胸の前あたり */
  lift: 1.05,
  /** 板を寝かせる角度（ラジアン。0 で垂直、大きいほど上を向く）。見下ろしたときに押しやすい */
  tilt: 0.85,
  /** 部品どうしの間隔と、板の面から部品を浮かせる高さ */
  gap: 0.225,
  raise: 0.026,
  /** 部品の中心の高さ（板の中心から。下にラベルが出るので、少し上に寄せる） */
  row: 0.03,
  /** 支柱の位置（板の中心から左右へ）と太さ。支柱は板の両端に寄せる（ガラス越しに、部品やラベルの後ろを横切らないように） */
  post: 0.475,
  thickness: 0.028,
}

/**
 * 体が操作盤に入り込まないようにする当たり判定の箱（床から top の高さまで）。
 *
 * 箱は部品より低くして、部品を箱の中に入れない。部品ごと包む背の高い箱にすると、
 * XRift 本番ではどの部品も押せなくなった（開発用の環境では押せていた）。
 * 目から部品への線は、どこに立ってもこの箱の上を通る。
 */
const GUARD = { top: 0.75, depth: 0.36, margin: 0.07 }

/** ラベルは部品の外で決めておく（描き直しのたびに新しい物を渡すと、そのたびに文字の絵を作り直すことになる） */
const LABELS = {
  show: { ja: '演出', en: 'Show', zh: '演出' },
  music: { ja: 'BGM', en: 'Music', zh: '音乐' },
  light: { ja: '明かり', en: 'Light', zh: '灯光' },
  next: { ja: '次へ', en: 'Next', zh: '下一个' },
} satisfies Record<string, LabelText>

export interface ControlPanelProps extends Omit<ThreeElements['group'], 'children'> {
  /** useControls() の戻り値 */
  controls: Controls
  /** 支柱の素材。省くと淡い色の標準マテリアル（ワールドの手すりなどと同じ物を渡すと、なじむ） */
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
  /** 部品の横の位置（左から 0, 1, 2, 3 番め） */
  const column = (index: number) => (index - 1.5) * PANEL.gap

  return (
    <group {...group}>
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={stand.post} material={material} position={[side * PANEL.post, PANEL.lift / 2, 0]} />
      ))}
      <GlassPlate width={PANEL.width} height={PANEL.height} position={[0, PANEL.lift + 0.012, 0]} rotation={[-PANEL.tilt, 0, 0]}>
        {/* 板を裏から受ける腕 */}
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={stand.arm} material={material} position={[side * PANEL.post, -0.02, -0.02]} />
        ))}

        {/* 時間で進むもの: 共有するのは「始めた時刻」だけ。縁の輪は、その時刻と共有時計から毎フレーム計算する */}
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
        {/* 入／切（自分だけ） */}
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
        {/* 入／切（全員で共有）。スイッチは丸ボタンより背が低いので、ラベルの高さが揃うように少し下げる */}
        <GlassSwitch
          id="panel-light"
          position={[column(2), PANEL.row - 0.015, PANEL.raise]}
          tint="#ffd27a"
          label={LABELS.light}
          on={light}
          onPress={controls.toggleLight}
          hint={light ? '明かりを消す · Light off · 关灯' : '明かりをつける · Light on · 开灯'}
        />
        {/* 押すだけ（on を渡さない） */}
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

      {/* 部品より低い箱で、体だけを止める */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[PANEL.width / 2 + GUARD.margin, GUARD.top / 2, GUARD.depth / 2]} position={[0, GUARD.top / 2, 0]} />
      </RigidBody>
    </group>
  )
}
