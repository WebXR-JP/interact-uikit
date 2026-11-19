import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Color, type ColorRepresentation, type Group, Matrix4, type Points, Vector2, Vector3 } from 'three'
import { createGlassState } from './material'
import { playTone, pulse } from './sound'

/**
 * 押したときの手ごたえ。部品（ボタン・スイッチ）で共通:
 *
 *   沈み込み   押すと奥へ沈み、ばねで少し行き過ぎてから戻る
 *   波紋       中央から縁へ光の輪が走り、縁から光の粒が散る
 *   音         ポーン（入れたときは上がる 2 音、切ったときは下がる 2 音）
 *   震え       VR のコントローラーやスマホを短く震わせる
 *   狙い       画面の中央（視線の先）が部品に重なると、縁が少し明るくなる
 *   入／切     入のあいだ、色の光がたまる（切り替わりはなめらかに）
 */

/** XRift のインタラクトが届く距離（m）。これより遠いと「狙われている」表示にしない */
const REACH = 3.5
/** ばねの硬さと抵抗（少し弾むくらい） */
const STIFFNESS = 520
const DAMPING = 17
/** 押し込んだまま保つ秒数（このあと、ばねで戻る） */
const HOLD = 0.07
/** きらめきが消えるまでの秒数 */
const SPARKLE = 0.6
/** 続けて届いた「押した」を 1 回として扱う秒数（二重に届いても切り替えが打ち消されないように） */
const DEBOUNCE = 0.14

const inverse = new Matrix4()
const eye = new Vector3()
const gaze = new Vector3()
const centre = new Vector3()
const bufferSize = new Vector2()

export interface FeelOptions {
  /** 入／切の状態。undefined なら押すだけのボタン */
  on: boolean | undefined
  tint: ColorRepresentation
  halfWidth: number
  halfHeight: number
  /** 沈み込む深さ（m） */
  travel: number
  enabled: boolean
  sound: boolean
  onPress?: () => void
  /** 縁に描く進み具合（0〜1）。関数なら毎フレーム呼ぶ */
  progress?: number | (() => number)
}

export function useFeel(options: FeelOptions) {
  const gl = useThree((three) => three.gl)
  const latest = useRef(options)
  latest.current = options
  const state = useMemo(() => createGlassState(new Color(options.tint), options.halfWidth, options.halfHeight), [])
  /** 沈み込む部分（ガラスと中の絵） */
  const moving = useRef<Group>(null)
  /** 縁から散る光の粒 */
  const sparks = useRef<Points>(null)
  const feel = useRef({
    offset: 0,
    velocity: 0,
    hold: 0,
    on: options.on ? 1 : 0,
    aimed: 0,
    sparkle: 0,
    ripple: 9,
    sincePress: 9,
    wasAimed: false,
    sinceAim: 9,
    /** 0〜1 に落ち着く、入／切のばね（スイッチのつまみを少し行き過ぎさせるのに使う） */
    slide: options.on ? 1 : 0,
    slideVelocity: 0,
  })

  useEffect(() => {
    state.uTint.value.set(options.tint)
    state.uHalf.value.set(options.halfWidth, options.halfHeight)
  }, [state, options.tint, options.halfWidth, options.halfHeight])

  // ほかの人が切り替えたとき（自分は押していないのに状態が変わった）は、音なしで波紋だけ出す
  const shown = useRef(options.on)
  useEffect(() => {
    if (shown.current === options.on) return
    shown.current = options.on
    const f = feel.current
    if (f.sincePress > 0.5) {
      f.sparkle = 0.6
      f.ripple = 0
    }
  }, [options.on])

  const press = useCallback(() => {
    const f = feel.current
    const { enabled, sound, on, onPress } = latest.current
    if (!enabled || f.sincePress < DEBOUNCE) return
    f.sincePress = 0
    f.hold = HOLD
    f.velocity -= 5
    f.sparkle = 1
    f.ripple = 0
    if (sound) playTone(on === undefined ? 'press' : on ? 'off' : 'on')
    pulse(gl.xr.getSession())
    onPress?.()
  }, [gl])

  useFrame(({ camera }, delta) => {
    const f = feel.current
    const { on, enabled, sound, progress } = latest.current
    const dt = Math.min(delta, 0.05)
    f.sincePress += dt
    f.sinceAim += dt

    // 狙い: 視線の先が部品の面に重なっているか
    let aimed = false
    const group = moving.current
    if (group && enabled) {
      camera.getWorldPosition(eye)
      group.getWorldPosition(centre)
      if (eye.distanceToSquared(centre) < REACH * REACH) {
        camera.getWorldDirection(gaze)
        inverse.copy(group.matrixWorld).invert()
        eye.applyMatrix4(inverse)
        gaze.transformDirection(inverse)
        if (eye.z > 0 && gaze.z < -0.02) {
          const t = -eye.z / gaze.z
          const { x, y } = state.uHalf.value
          aimed = Math.abs(eye.x + gaze.x * t) <= x && Math.abs(eye.y + gaze.y * t) <= y
        }
      }
    }
    if (aimed && !f.wasAimed && f.sinceAim > 0.3 && sound) {
      playTone('aim')
      f.sinceAim = 0
    }
    f.wasAimed = aimed
    f.aimed += ((aimed ? 1 : 0) - f.aimed) * (1 - Math.exp(-dt / 0.07))

    // 沈み込み: 押した直後は奥に引かれ、そのあとばねで戻る
    f.hold -= dt
    const pull = f.hold > 0 ? -1 : 0
    f.velocity += ((pull - f.offset) * STIFFNESS - f.velocity * DAMPING) * dt
    f.offset += f.velocity * dt
    if (group) {
      group.position.z = f.offset * latest.current.travel
      group.scale.setScalar(1 + f.offset * 0.03 + f.aimed * 0.025)
    }

    // 入／切: 光はなめらかに、つまみはばねで
    const target = on ? 1 : 0
    f.on += (target - f.on) * (1 - Math.exp(-dt / 0.12))
    f.slideVelocity += ((target - f.slide) * 300 - f.slideVelocity * 21) * dt
    f.slide += f.slideVelocity * dt

    f.sparkle = Math.max(0, f.sparkle - dt / SPARKLE)
    f.ripple += dt * 2.7
    // 押すだけのボタンは、押した直後だけ光る
    state.uState.value.set(on === undefined ? f.sparkle * 0.8 : f.on, f.aimed, f.sparkle, f.ripple)
    state.uProgress.value = progress === undefined ? -1 : typeof progress === 'function' ? progress() : progress

    const points = sparks.current
    if (points) {
      points.visible = f.sparkle > 0.001
      if (points.visible) {
        const material = points.material as { uniforms?: { uViewportHeight?: { value: number } } }
        if (material.uniforms?.uViewportHeight) material.uniforms.uViewportHeight.value = gl.getDrawingBufferSize(bufferSize).y
      }
    }
  })

  return { state, moving, sparks, press, feel }
}
