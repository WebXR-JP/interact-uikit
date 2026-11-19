import { AudioContext as SharedAudioContext } from 'three'

/**
 * 押したときの音。音源ファイルは使わず、その場で合成する。
 *
 *   press  ポーン（押すだけのボタン）
 *   on     ポポン↑（入れた）
 *   off    ポポン↓（切った）
 *   aim    狙いが合ったときの、ごく小さなチッ
 *
 * どれもグラスや鉄琴を軽く叩いたような音: 基音と、その 2.76 倍の倍音を、すぐに減衰させる。
 * 少しだけ残響を付けて、空間に浮かんでいる物が鳴ったように聞かせる。
 */
export type ToneName = 'press' | 'on' | 'off' | 'aim'

/** 全体の大きさ（0〜1）。ワールドの環境音が小さめなら下げる */
export const glassSound = { volume: 0.42 }

interface Rig {
  context: AudioContext
  dry: GainNode
  wet: GainNode
}

let rig: Rig | null = null

function getRig(): Rig | null {
  if (rig) return rig
  let context: AudioContext
  try {
    // three.js の音と同じコンテキストを使う（ブラウザが作れる数には限りがある）
    context = SharedAudioContext.getContext() as AudioContext
  } catch {
    return null
  }
  const out = context.createGain()
  out.connect(context.destination)
  const dry = context.createGain()
  dry.connect(out)
  // 残響: 0.9 秒で消えていく雑音を響きの型にする
  const length = Math.floor(context.sampleRate * 0.9)
  const impulse = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp((-i / length) * 6.5)
  }
  const reverb = context.createConvolver()
  reverb.buffer = impulse
  const wet = context.createGain()
  wet.gain.value = 0.2
  wet.connect(reverb)
  reverb.connect(out)
  rig = { context, dry, wet }
  return rig
}

/** 1 音。when: 鳴らす時刻, pitch: 基音（Hz）, level: 大きさ, ring: 鳴り終わるまでの秒数 */
function strike({ context, dry, wet }: Rig, when: number, pitch: number, level: number, ring: number) {
  const voice = context.createGain()
  voice.connect(dry)
  voice.connect(wet)
  const partials: [number, number, number][] = [
    [1, 1, ring],
    [2.756, 0.2, ring * 0.3],
    [5.404, 0.06, ring * 0.14],
  ]
  for (const [ratio, share, decay] of partials) {
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    // 叩いた瞬間だけわずかに高い（当たりの硬さが出る）
    oscillator.frequency.setValueAtTime(pitch * ratio * 1.015, when)
    oscillator.frequency.exponentialRampToValueAtTime(pitch * ratio, when + 0.04)
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(level * share, when + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + decay)
    oscillator.connect(gain)
    gain.connect(voice)
    oscillator.start(when)
    oscillator.stop(when + decay + 0.05)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
  }
  window.setTimeout(() => voice.disconnect(), (when - context.currentTime + ring + 1.2) * 1000)
}

/** 音を鳴らす。ブラウザが音を止めているとき（まだ画面を操作していない）は、起こしてから鳴らす */
export function playTone(name: ToneName, volume = 1) {
  const current = getRig()
  if (!current) return
  const { context } = current
  if (context.state !== 'running') {
    if (name === 'aim') return
    context.resume().catch(() => {})
  }
  const level = glassSound.volume * volume
  if (level <= 0) return
  const now = context.currentTime + 0.005
  if (name === 'press') {
    strike(current, now, 659.26, 0.3 * level, 0.5)
  } else if (name === 'on') {
    strike(current, now, 587.33, 0.24 * level, 0.36)
    strike(current, now + 0.085, 880, 0.3 * level, 0.6)
  } else if (name === 'off') {
    strike(current, now, 783.99, 0.22 * level, 0.3)
    strike(current, now + 0.085, 523.25, 0.24 * level, 0.5)
  } else {
    strike(current, now, 1318.5, 0.035 * level, 0.07)
  }
}

/**
 * 押した手ごたえ。VR ではトリガーを引いているコントローラーを、スマホでは本体を、短く震わせる。
 * どちらも無ければ何もしない。
 */
export function pulse(session: XRSession | null | undefined, strength = 0.5, milliseconds = 26) {
  try {
    if (session) {
      for (const source of session.inputSources) {
        const pad = source.gamepad
        if (!pad) continue
        // 引き金か握りを押している手だけ
        if (!pad.buttons.slice(0, 2).some((button) => button.pressed || button.value > 0.35)) continue
        const actuators = (pad as Gamepad & { hapticActuators?: { pulse?: (value: number, duration: number) => Promise<unknown> }[] }).hapticActuators
        const done = actuators?.[0]?.pulse?.(strength, milliseconds)
        done?.catch(() => {})
      }
    } else if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && 'vibrate' in navigator) {
      navigator.vibrate(Math.round(milliseconds * 0.4))
    }
  } catch {
    // 震わせられない端末では何もしない
  }
}
