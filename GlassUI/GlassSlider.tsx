import { type ThreeElements, useFrame } from '@react-three/fiber'
import { Grabbable } from '@xrift/world-components'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Color, type ColorRepresentation, type Group, type Object3D, PlaneGeometry, ShaderMaterial, Vector3 } from 'three'
import { GLASS_ORDER, GlassButton } from './GlassButton'
import { useFeel } from './feel'
import { createCapGeometry, SHAPES } from './geometry'
import { createLabelTexture, labelKey, type LabelText } from './icons'
import { createGlassMaterials, createGlassState, createLabelMaterial } from './material'
import { playTone, pulse } from './sound'

export interface GlassSliderProps extends Omit<ThreeElements['group'], 'id' | 'onChange'> {
  /** XRift の Grabbable の id。ワールドの中で重ならない名前にする（両端のボタンは `${id}-minus` と `${id}-plus`） */
  id: string
  /** いまの値（0〜1） */
  value: number
  /** 値が変わったとき。掴んで動かしているあいだは、動くたびに呼ぶ */
  onChange: (value: number) => void
  /** 溝の長さ（m） */
  length?: number
  /** 溝の高さ（m）。つまみはその 2 倍ほど */
  size?: number
  label?: LabelText
  /** 下に出すラベルの横幅（m） */
  labelWidth?: number
  /** 溝にたまる光の色（値のところまで光る） */
  tint?: ColorRepresentation
  /** 両端の − ＋ のボタン（押すと step ずつ動く。掴むのが難しいときや、スマホ向け） */
  buttons?: boolean
  step?: number
  /** − ＋ のボタンを狙ったときに XRift が出す説明 */
  hints?: { minus?: string; plus?: string }
  enabled?: boolean
  sound?: boolean
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)
const local = new Vector3()
const eye = new Vector3()

/**
 * 掴んでいるつまみの値（0〜1）: 目（eye）から手元のつまみ（held）への線が、スライダーの面（中の座標で z = plane）と交わる所の x を、
 * 溝の左の端（-reach）から右の端（+reach）で割る。線が面と交わらないときは、つまみをそのまま溝に重ねる。
 * eye と held は世界の座標（書き換えない）。root はスライダーの置き場所（溝の中心が原点、溝は x の向き）
 */
export function sliderValueAt(root: Object3D, eye: Vector3, held: Vector3, reach: number, plane: number) {
  const e = root.worldToLocal(eyeLocal.copy(eye))
  const h = root.worldToLocal(heldLocal.copy(held))
  const dz = h.z - e.z
  let x = h.x
  if (Math.abs(dz) > 1e-4) {
    const t = (plane - e.z) / dz
    if (t > 0) x = e.x + (h.x - e.x) * t
  }
  return clamp01((x + reach) / (2 * reach))
}
const eyeLocal = new Vector3()
const heldLocal = new Vector3()

/** 溝の中の光（値のところまでの、丸い端の帯）。溝のガラスの裏と表のあいだに描く */
function createFillMaterial(tint: Color, length: number, height: number) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTint: { value: tint }, uValue: { value: 0 }, uSize: { value: [length, height] }, uGlow: { value: 0 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uTint;
      uniform float uValue;
      uniform vec2 uSize;
      uniform float uGlow;
      varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = (vUv - 0.5) * uSize;
        float r = uSize.y * 0.5;
        float x0 = -uSize.x * 0.5 + r;
        float x1 = mix(x0, uSize.x * 0.5 - r, uValue);
        // 丸い端の帯（左の端から値のところまで）と、そのまわりのにじみ
        vec2 q = vec2(p.x - clamp(p.x, x0, x1), p.y);
        float d = length(q) - r;
        float aa = max(fwidth(d), 1e-4);
        float body = 1.0 - smoothstep(-aa, aa, d);
        float halo = exp(-max(d, 0.0) / (r * 0.9)) * (0.25 + 0.25 * uGlow);
        // 帯の中は、先（つまみの側）ほど明るい
        float lift = 0.75 + 0.25 * smoothstep(x0, x1 + 1e-4, p.x);
        vec3 col = uTint * (body * lift * (0.85 + 0.3 * uGlow) + halo);
        gl_FragColor = vec4(col, max(body * 0.82, halo * 0.7));
        #include <colorspace_fragment>
      }
    `,
  })
}

/**
 * ガラスのスライダー。溝の上のつまみを掴んで（XRift の Grabbable）、左右に動かして値を決める。
 * 掴んでいるあいだは、目から見て手のある所（PC とスマホでは視線の先）が値になり、溝の光と色つきのつまみがそこへ動く。
 * 離すと、つまみは溝のその位置に戻る。両端の − ＋ のボタンでも少しずつ動かせる。
 * 値は使う側で持つ（自分だけの音量なら useState、全員で共有したければ useInstanceState に）。つまみの位置は共有しない。
 *
 *   const [volume, setVolume] = useState(0.6)
 *   <GlassSlider id="bgm-volume" value={volume} onChange={setVolume} label={{ ja: 'BGM の大きさ', en: 'Music volume' }} />
 */
export const GlassSlider = ({
  id,
  value,
  onChange,
  length = 0.2,
  size = 0.022,
  label,
  labelWidth = 0.15,
  tint = '#ffc46b',
  buttons = true,
  step = 0.1,
  hints,
  enabled = true,
  sound = true,
  ...group
}: GlassSliderProps) => {
  const track = useMemo(() => ({ ...SHAPES.track(size), width: length }), [size, length])
  const knob = useMemo(() => SHAPES.knob(size * 2.1), [size])
  /** つまみが動く幅の半分（溝の端の丸みの中心から中心まで） */
  const reach = (length - size) / 2
  const knobZ = track.edge / 2 + track.bulge + knob.back + 0.002
  const { state, moving, press, feel } = useFeel({
    on: undefined,
    tint: '#ffffff',
    halfWidth: knob.width / 2,
    halfHeight: knob.height / 2,
    travel: knob.bulge * 0.5,
    enabled,
    sound,
  })

  // ラベルと色は、渡された物そのものではなく中身で比べる（その場に書いた { ja, en, zh } や色でも、同じなら作り直さない）
  const labelId = labelKey(label)
  const tintId = new Color(tint).getHexString()
  const parts = useMemo(() => {
    const trackState = createGlassState(new Color('#ffffff'), track.width / 2, track.height / 2)
    trackState.uGloss.value = 0.5
    const ghostState = createGlassState(new Color(tint), knob.width / 2, knob.height / 2)
    const caption = label ? createLabelTexture(label) : null
    return {
      trackGeometry: createCapGeometry(track),
      trackGlass: createGlassMaterials(trackState),
      fillPlane: new PlaneGeometry(track.width * 0.94, track.height * 0.62),
      fill: createFillMaterial(new Color(tint), track.width * 0.94, track.height * 0.62),
      knobGeometry: createCapGeometry(knob),
      knobGlass: createGlassMaterials(state),
      ghostGlass: createGlassMaterials(ghostState),
      ghostState,
      caption: caption && {
        texture: caption.texture,
        material: createLabelMaterial(caption.texture),
        plane: new PlaneGeometry(labelWidth, labelWidth / caption.aspect),
        y: -(knob.height / 2 + 0.01 + labelWidth / caption.aspect / 2),
      },
    }
    // label と tint は、中身を表す labelId と tintId で比べる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, knob, state, tintId, labelId, labelWidth])

  useEffect(
    () => () => {
      parts.trackGeometry.dispose()
      parts.trackGlass.front.dispose()
      parts.trackGlass.back.dispose()
      parts.fillPlane.dispose()
      parts.fill.dispose()
      parts.knobGeometry.dispose()
      parts.knobGlass.front.dispose()
      parts.knobGlass.back.dispose()
      parts.ghostGlass.front.dispose()
      parts.ghostGlass.back.dispose()
      parts.caption?.texture.dispose()
      parts.caption?.material.dispose()
      parts.caption?.plane.dispose()
    },
    [parts],
  )

  const root = useRef<Group>(null)
  const probe = useRef<Group>(null)
  const ghost = useRef<Group>(null)
  const latest = useRef({ value, onChange })
  latest.current = { value, onChange }
  /** 自分が掴んでいるか（ほかの人が掴んでいても、値は動かさない） */
  const heldRef = useRef(false)
  const shown = useRef(value)
  const sent = useRef(value)

  const onGrab = useCallback(
    ({ isMine }: { isMine: boolean }) => {
      if (!isMine) return
      heldRef.current = true
      sent.current = latest.current.value
      press()
    },
    [press],
  )
  const onRelease = useCallback(
    ({ isMine }: { isMine: boolean }) => {
      if (!isMine && !heldRef.current) return
      heldRef.current = false
      if (sound) playTone('aim', 2.2)
    },
    [sound],
  )

  useFrame((three, delta) => {
    // 掴んでいるあいだ: 目から手元のつまみへの線が、スライダーの面と交わる所を値にする
    // （PC とスマホでは視線の先、VR では目から見て手のある所。掴んだ物は目から 1 m より先に浮かぶので、そのまま重ねると、ずれる）
    if (heldRef.current && probe.current && root.current) {
      probe.current.getWorldPosition(local)
      three.camera.getWorldPosition(eye)
      const next = sliderValueAt(root.current, eye, local, reach, knobZ)
      if (Math.abs(next - sent.current) > 0.003) {
        // 1 割ごとに、ごく小さなチッ（目盛りの手ごたえ）
        if (sound && Math.floor(next * 10 + 0.5) !== Math.floor(sent.current * 10 + 0.5)) {
          playTone('aim', 1.6)
          pulse(three.gl.xr.getSession(), 0.2, 12)
        }
        sent.current = next
        latest.current.onChange(next)
      }
    }
    // 溝の光とつまみの影は、値へなめらかに寄せる
    const target = heldRef.current ? sent.current : latest.current.value
    shown.current += (target - shown.current) * (1 - Math.exp(-delta / 0.05))
    parts.fill.uniforms.uValue.value = shown.current
    parts.fill.uniforms.uGlow.value = heldRef.current ? 1 : feel.current.aimed
    if (ghost.current) {
      ghost.current.position.x = (shown.current * 2 - 1) * reach
      ghost.current.visible = heldRef.current
    }
    parts.ghostState.uState.value.set(1, 0, 0, 9)
  })

  // 掴んでいないとき、つまみは溝の値の所に置く（離したら、ここへ戻る）
  const transform = useMemo(
    () => ({ position: { x: (clamp01(value) * 2 - 1) * reach, y: 0, z: knobZ }, rotation: { x: 0, y: 0, z: 0 } }),
    [value, reach, knobZ],
  )
  const nudge = (direction: number) => () => latest.current.onChange(clamp01(Math.round((latest.current.value + direction * step) / step) * step))

  return (
    <group {...group}>
      <group ref={root}>
        <mesh geometry={parts.trackGeometry} material={parts.trackGlass.back} renderOrder={GLASS_ORDER} />
        <mesh geometry={parts.fillPlane} material={parts.fill} position-z={track.edge / 2} renderOrder={GLASS_ORDER + 1} />
        <mesh geometry={parts.trackGeometry} material={parts.trackGlass.front} renderOrder={GLASS_ORDER + 2} />
        {/* 掴んでいるあいだ、溝の上の値の所に出す色つきのつまみ */}
        <group ref={ghost} position-z={knobZ} visible={false}>
          <mesh geometry={parts.knobGeometry} material={parts.ghostGlass.back} renderOrder={GLASS_ORDER + 3} />
          <mesh geometry={parts.knobGeometry} material={parts.ghostGlass.front} renderOrder={GLASS_ORDER + 4} />
        </group>
        <Grabbable id={id} transform={transform} sync={false} enabled={enabled} onGrab={onGrab} onRelease={onRelease}>
          <group ref={probe}>
            <group ref={moving}>
              <mesh geometry={parts.knobGeometry} material={parts.knobGlass.back} renderOrder={GLASS_ORDER + 5} />
              <mesh geometry={parts.knobGeometry} material={parts.knobGlass.front} renderOrder={GLASS_ORDER + 6} />
            </group>
          </group>
        </Grabbable>
      </group>
      {buttons && (
        <>
          <GlassButton id={`${id}-minus`} position={[-(length / 2 + size * 1.55), 0, 0.004]} size={size * 1.75} icon="minus" onPress={nudge(-1)} hint={hints?.minus} enabled={enabled} sound={sound} />
          <GlassButton id={`${id}-plus`} position={[length / 2 + size * 1.55, 0, 0.004]} size={size * 1.75} icon="plus" onPress={nudge(1)} hint={hints?.plus} enabled={enabled} sound={sound} />
        </>
      )}
      {parts.caption && <mesh geometry={parts.caption.plane} material={parts.caption.material} position={[0, parts.caption.y, 0]} renderOrder={GLASS_ORDER + 1} />}
    </group>
  )
}
