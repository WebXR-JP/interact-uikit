import type { ThreeElements } from '@react-three/fiber'
import { Interactable } from '@xrift/world-components'
import { useEffect, useMemo, useState } from 'react'
import { BufferGeometry, type ColorRepresentation, Float32BufferAttribute, PlaneGeometry, SRGBColorSpace, type Texture, TextureLoader } from 'three'
import { useFeel } from './feel'
import { createCapGeometry, SHAPES, type ShapeName } from './geometry'
import { createIconTexture, createLabelTexture, createPillFaceTexture, iconKey, type IconName, type IconPainter, labelKey, type LabelText } from './icons'
import { createFaceMaterial, createGlassMaterials, createLabelMaterial, createSparkMaterial } from './material'

/** 描く順番の基準。ガラスは半透明なので、ワールドのほかの物より後に、裏 → 中身 → 表の順で描く */
export const GLASS_ORDER = 2000

/** 丸ボタンの差し渡しに対する、アイコンの絵（余白を含むテクスチャ全体）の大きさ */
const ICON_SCALE = 0.66
/** 中の絵を描く板は、部品よりこれだけ大きい（まわりへにじむ光のぶん） */
const SPREAD = 2
/** 縁から散る光の粒の数 */
const SPARKS = 12
/**
 * 光の粒は、狙いの判定（レイキャスト）から外す。
 * 点の集まりは「線から 1 m 以内」で当たったことになるので、そのままだと部品の手前に見えない当たりができて、
 * 判定のしかたによっては、ボタンが何かの陰にあるものとして扱われる。
 */
const noRaycast = () => {}

export interface GlassButtonProps extends Omit<ThreeElements['group'], 'id'> {
  /** XRift のインタラクトの id。ワールドの中で重ならない名前にする */
  id: string
  /** round: 丸, pill: 横長のカプセル（アイコンとラベルを中に並べる）, tile: 角丸の四角（画像向き） */
  shape?: ShapeName
  /** 丸とタイルは差し渡し、カプセルは高さ（m） */
  size?: number
  /** カプセルとタイルの横幅（m）。省くと形ごとの既定 */
  width?: number
  /** 用意してあるアイコンの名前か、自分で描く関数 */
  icon?: IconName | IconPainter
  /** アイコンの代わりに載せる画像（テクスチャか URL）。部品の形に切り抜かれる */
  image?: Texture | string
  /** ラベル。丸とタイルでは下に、カプセルでは中に出る */
  label?: LabelText
  /** 下に出すラベルの横幅（m）。文字の大きさはこれで決まる（部品の大きさが違っても文字を揃えられる） */
  labelWidth?: number
  /** 入／切の状態。渡さなければ「押すだけ」のボタン */
  on?: boolean
  /** 入のときの色 */
  tint?: ColorRepresentation
  /** 縁に描く進み具合（0〜1）。関数なら毎フレーム呼ばれる。再生ボタンなどに */
  progress?: number | (() => number)
  /** 押されたとき。入／切の切り替えは呼び出した側で行う */
  onPress?: () => void
  /** 狙ったときに XRift が出す説明 */
  hint?: string
  enabled?: boolean
  /** 押したときの音を鳴らすか */
  sound?: boolean
}

/** URL で渡された画像を読む（読めるまでは null） */
function useImage(source: Texture | string | undefined) {
  const [loaded, setLoaded] = useState<Texture | null>(null)
  useEffect(() => {
    if (typeof source !== 'string') return
    let cancelled = false
    new TextureLoader().load(source, (texture) => {
      if (cancelled) return texture.dispose()
      texture.colorSpace = SRGBColorSpace
      setLoaded(texture)
    })
    return () => {
      cancelled = true
      setLoaded(null)
    }
  }, [source])
  return typeof source === 'string' ? loaded : (source ?? null)
}

/**
 * ガラスのボタン。空間に浮かべて、XRift のインタラクト（狙って押す）で押す。
 *
 *   <GlassButton id="bgm" icon="music" label={{ ja: 'BGM', en: 'Music', zh: '音乐' }} on={bgm} onPress={() => setBgm(!bgm)} />
 */
export const GlassButton = ({
  id,
  shape = 'round',
  size = 0.1,
  width,
  icon,
  image,
  label,
  labelWidth = 0.17,
  on,
  tint = '#7fc4ff',
  progress,
  onPress,
  hint,
  enabled = true,
  sound = true,
  ...group
}: GlassButtonProps) => {
  const cap = useMemo(() => (shape === 'round' ? SHAPES.round(size) : shape === 'pill' ? SHAPES.pill(size, width) : SHAPES.tile(size, width)), [shape, size, width])
  const picture = useImage(image)
  const { state, moving, sparks, press } = useFeel({
    on,
    tint,
    halfWidth: cap.width / 2,
    halfHeight: cap.height / 2,
    travel: (cap.edge + cap.bulge) * 0.5,
    enabled,
    sound,
    onPress,
    progress,
  })

  // ラベルと自作のアイコンは、渡された物そのものではなく、中身（描く文字・描く絵）で比べる。
  // その場に書いた { ja, en, zh } や (ctx) => … は描き直しのたびに別の物になるが、中身が同じなら作り直さない
  const labelId = labelKey(label)
  const iconId = iconKey(icon)

  const parts = useMemo(() => {
    const aspect = cap.width / cap.height
    const glass = createGlassMaterials(state)
    // この部品のために描いたテクスチャ。部品を作り直すときと外すときに片づける
    // （渡された画像は使う側の物、用意してあるアイコンの絵は使い回しなので、ここには入れない）
    const drawn: Texture[] = []
    // 中の絵: 画像 → カプセルの「アイコン＋ラベル」→ アイコンだけ、の順で決める
    let face = null
    if (picture) {
      face = createFaceMaterial(state, picture, { face: 1, spread: SPREAD, mode: 'image', radius: cap.radius / (cap.height / 2), aspect })
    } else if (shape === 'pill' && label) {
      const texture = createPillFaceTexture(icon ?? null, label, aspect)
      drawn.push(texture)
      face = createFaceMaterial(state, texture, { face: 1, spread: SPREAD, mode: 'wide', radius: 1, aspect })
    } else if (icon) {
      const { texture, shared } = createIconTexture(icon)
      if (!shared) drawn.push(texture)
      face = createFaceMaterial(state, texture, { face: ICON_SCALE, spread: SPREAD, mode: 'icon', radius: 1, aspect })
    }
    const caption = label && shape !== 'pill' ? createLabelTexture(label) : null
    if (caption) drawn.push(caption.texture)
    const spark = new BufferGeometry()
    const around: number[] = []
    const seeds: number[] = []
    for (let i = 0; i < SPARKS; i++) {
      const a = ((i + 0.37 * Math.sin(i * 12.9898)) / SPARKS) * Math.PI * 2
      around.push(Math.cos(a), Math.sin(a), 0)
      seeds.push(Math.abs(Math.sin(i * 78.233 + 1.7)))
    }
    spark.setAttribute('position', new Float32BufferAttribute(around, 3))
    spark.setAttribute('seed', new Float32BufferAttribute(seeds, 1))
    return {
      geometry: createCapGeometry(cap),
      glass,
      face,
      facePlane: new PlaneGeometry(cap.width * SPREAD, cap.height * SPREAD),
      caption: caption && {
        material: createLabelMaterial(caption.texture, state),
        plane: new PlaneGeometry(labelWidth, labelWidth / caption.aspect),
        y: -(cap.height / 2 + 0.014 + labelWidth / caption.aspect / 2),
      },
      spark,
      sparkMaterial: createSparkMaterial(state),
      drawn,
    }
    // icon と label は、中身を表す iconId と labelId で比べる
  }, [cap, state, picture, shape, iconId, labelId, labelWidth])

  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.glass.front.dispose()
      parts.glass.back.dispose()
      parts.face?.dispose()
      parts.facePlane.dispose()
      parts.caption?.material.dispose()
      parts.caption?.plane.dispose()
      parts.spark.dispose()
      parts.sparkMaterial.dispose()
      for (const texture of parts.drawn) texture.dispose()
    },
    [parts],
  )

  return (
    <group {...group}>
      <group ref={moving}>
        <mesh geometry={parts.geometry} material={parts.glass.back} renderOrder={GLASS_ORDER} />
        {parts.face && <mesh geometry={parts.facePlane} material={parts.face} renderOrder={GLASS_ORDER + 1} />}
        <Interactable id={id} onInteract={press} interactionText={hint} enabled={enabled}>
          <mesh geometry={parts.geometry} material={parts.glass.front} renderOrder={GLASS_ORDER + 2} />
        </Interactable>
      </group>
      <points ref={sparks} geometry={parts.spark} material={parts.sparkMaterial} renderOrder={GLASS_ORDER + 3} visible={false} frustumCulled={false} raycast={noRaycast} />
      {parts.caption && <mesh geometry={parts.caption.plane} material={parts.caption.material} position={[0, parts.caption.y, 0]} renderOrder={GLASS_ORDER + 1} />}
    </group>
  )
}
