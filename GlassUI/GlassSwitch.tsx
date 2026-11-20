import { type ThreeElements, useFrame } from '@react-three/fiber'
import { Interactable } from '@xrift/world-components'
import { useEffect, useMemo, useRef } from 'react'
import { Color, type ColorRepresentation, type Group, PlaneGeometry } from 'three'
import { GLASS_ORDER } from './GlassButton'
import { useFeel } from './feel'
import { createCapGeometry, SHAPES } from './geometry'
import { createLabelTexture, labelKey, type LabelText } from './icons'
import { createGlassMaterials, createGlassState, createLabelMaterial } from './material'

export interface GlassSwitchProps extends Omit<ThreeElements['group'], 'id'> {
  /** XRift のインタラクトの id。ワールドの中で重ならない名前にする */
  id: string
  /** 入／切の状態 */
  on: boolean
  /** 溝の高さ（m）。横幅はその 1.9 倍 */
  size?: number
  label?: LabelText
  /** 下に出すラベルの横幅（m） */
  labelWidth?: number
  /** 入のときの色 */
  tint?: ColorRepresentation
  onPress?: () => void
  /** 狙ったときに XRift が出す説明 */
  hint?: string
  enabled?: boolean
  sound?: boolean
}

/**
 * ガラスのスイッチ。溝の中をつまみが左右に動く、汎用の入／切。
 * 押すと、つまみがばねで反対側へ滑り、入のあいだは溝に色の光がたまる。
 *
 *   <GlassSwitch id="lamp" on={lamp} onPress={() => setLamp(!lamp)} label={{ ja: '明かり', en: 'Light', zh: '灯光' }} />
 */
export const GlassSwitch = ({ id, on, size = 0.07, label, labelWidth = 0.17, tint = '#7fc4ff', onPress, hint, enabled = true, sound = true, ...group }: GlassSwitchProps) => {
  const track = useMemo(() => SHAPES.track(size), [size])
  const knob = useMemo(() => SHAPES.knob(size), [size])
  const { state, moving, press, feel } = useFeel({
    on,
    tint,
    halfWidth: track.width / 2,
    halfHeight: track.height / 2,
    travel: (track.edge + track.bulge) * 0.6,
    enabled,
    sound,
    onPress,
  })
  const slider = useRef<Group>(null)
  // ラベルは、渡された物そのものではなく、描く文字で比べる（その場に書いた { ja, en, zh } でも、文字が同じなら作り直さない）
  const labelId = labelKey(label)

  const parts = useMemo(() => {
    // つまみは溝とは別の明るさで光る（入でも白っぽいまま、色は溝が受け持つ）
    const knobState = createGlassState(new Color('#ffffff'), knob.width / 2, knob.height / 2)
    // 溝は、入のあいだ面ごと色づく（つまみの位置だけでなく、色でも入／切が分かるように）
    state.uFill.value = 5
    const caption = label ? createLabelTexture(label) : null
    return {
      trackGeometry: createCapGeometry(track),
      trackGlass: createGlassMaterials(state),
      knobGeometry: createCapGeometry(knob),
      knobGlass: createGlassMaterials(knobState),
      knobState,
      caption: caption && {
        texture: caption.texture,
        material: createLabelMaterial(caption.texture, state),
        plane: new PlaneGeometry(labelWidth, labelWidth / caption.aspect),
        y: -(track.height / 2 + 0.014 + labelWidth / caption.aspect / 2),
      },
    }
    // label は、中身を表す labelId で比べる
  }, [track, knob, state, labelId, labelWidth])

  useEffect(
    () => () => {
      parts.trackGeometry.dispose()
      parts.trackGlass.front.dispose()
      parts.trackGlass.back.dispose()
      parts.knobGeometry.dispose()
      parts.knobGlass.front.dispose()
      parts.knobGlass.back.dispose()
      parts.caption?.texture.dispose()
      parts.caption?.material.dispose()
      parts.caption?.plane.dispose()
    },
    [parts],
  )

  // つまみが動く幅（溝の端の丸みの中心から中心まで）
  const reach = (track.width - track.height) / 2
  useFrame(() => {
    const f = feel.current
    if (slider.current) slider.current.position.x = (f.slide * 2 - 1) * reach
    // つまみは、入で少し明るく、狙われたときと押した直後にも光る
    parts.knobState.uState.value.set(0.25 + 0.45 * f.on, f.aimed, f.sparkle, f.ripple)
  })

  return (
    <group {...group}>
      <group ref={moving}>
        <mesh geometry={parts.trackGeometry} material={parts.trackGlass.back} renderOrder={GLASS_ORDER} />
        <Interactable id={id} onInteract={press} interactionText={hint} enabled={enabled}>
          <mesh geometry={parts.trackGeometry} material={parts.trackGlass.front} renderOrder={GLASS_ORDER + 2} />
          <group ref={slider} position-z={track.edge / 2 + track.bulge * 0.6}>
            <mesh geometry={parts.knobGeometry} material={parts.knobGlass.back} renderOrder={GLASS_ORDER + 3} />
            <mesh geometry={parts.knobGeometry} material={parts.knobGlass.front} renderOrder={GLASS_ORDER + 4} />
          </group>
        </Interactable>
      </group>
      {parts.caption && <mesh geometry={parts.caption.plane} material={parts.caption.material} position={[0, parts.caption.y, 0]} renderOrder={GLASS_ORDER + 1} />}
    </group>
  )
}
