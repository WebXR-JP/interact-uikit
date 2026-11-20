import type { ThreeElements } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, PlaneGeometry } from 'three'
import { GLASS_ORDER } from './GlassButton'
import { createCapGeometry, SHAPES } from './geometry'
import { createLabelTexture, labelKey, type LabelText } from './icons'
import { createGlassMaterials, createGlassState, createLabelMaterial } from './material'

type GroupProps = ThreeElements['group']

export interface GlassPlateProps extends GroupProps {
  width: number
  height: number
  /** 板の上の端に添える見出し */
  title?: LabelText
}

/**
 * ガラスの台。ボタンやスイッチを並べて載せる薄い板（押せない）。
 * 部品は、この板より少し手前（+z）に置く。
 */
export const GlassPlate = ({ width, height, title, children, ...group }: GlassPlateProps) => {
  // 見出しは、渡された物そのものではなく、描く文字で比べる（その場に書いた { ja, en, zh } でも、文字が同じなら作り直さない）
  const titleId = labelKey(title)

  const parts = useMemo(() => {
    const state = createGlassState(new Color('#ffffff'), width / 2, height / 2)
    // 平らな板は、明かりの映り込みをごく弱くする（面ぜんたいが白く光って、載せた部品が見えなくなるため）
    state.uGloss.value = 0.1
    const heading = title ? createLabelTexture(title, 'left') : null
    const headingWidth = Math.min(width * 0.6, 0.22)
    return {
      geometry: createCapGeometry(SHAPES.plate(width, height)),
      glass: createGlassMaterials(state),
      heading: heading && {
        texture: heading.texture,
        material: createLabelMaterial(heading.texture),
        plane: new PlaneGeometry(headingWidth, headingWidth / heading.aspect),
        position: [-width / 2 + headingWidth / 2 + 0.012, height / 2 - headingWidth / heading.aspect / 2 - 0.006, 0.006] as [number, number, number],
      },
    }
    // title は、中身を表す titleId で比べる
  }, [width, height, titleId])

  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.glass.front.dispose()
      parts.glass.back.dispose()
      parts.heading?.texture.dispose()
      parts.heading?.material.dispose()
      parts.heading?.plane.dispose()
    },
    [parts],
  )

  return (
    <group {...group}>
      <mesh geometry={parts.geometry} material={parts.glass.back} renderOrder={GLASS_ORDER - 10} />
      <mesh geometry={parts.geometry} material={parts.glass.front} renderOrder={GLASS_ORDER - 9} />
      {parts.heading && <mesh geometry={parts.heading.plane} material={parts.heading.material} position={parts.heading.position} renderOrder={GLASS_ORDER - 8} />}
      {children}
    </group>
  )
}
