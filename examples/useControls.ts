import { useInstanceState, useServerClock } from '@xrift/world-components'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 操作盤が切り替える状態の例。ワールドの中で 1 回だけ呼び、操作盤（押す側）と演出（使う側）の両方に渡す。
 *
 *   演出     全員で共有する。共有するのは「いつ始めたか」だけ。いまどこまで進んだかは、
 *            XRift の共有時計から、全員が同じように計算する（通信は押したときの 1 回だけで、
 *            あとから入った人にも、途中からそのまま同じに見える）
 *   明かり   全員で共有する（入／切だけ）
 *   次へ     全員で共有する（何番めか）
 *   BGM      自分だけ（ほかの人の耳には関係しない）
 *
 * 時刻は XRift の共有時計（サーバーの時刻）の秒数。端末の時計のずれに左右されない。
 */

/** 演出 1 回の長さ（秒） */
export const SHOW_LENGTH = 30
/** 押してから演出が始まるまでの秒数（全員に知らせが届くのを待つ） */
const SHOW_LEAD = 0.5

/** 演出: 始めた時刻（共有時計の秒数） */
export interface ShowState {
  playing: boolean
  startedAt: number
}

export function useControls() {
  const clock = useServerClock()
  const clockRef = useRef(clock)
  clockRef.current = clock
  /** 共有の時計（秒）。関数なので、useFrame の中から描き直しなしで呼べる */
  const now = useCallback(() => clockRef.current.now() / 1000, [])

  // 全員で共有する状態。名前（第 1 引数）は、ワールドの中で重ならないものにする
  const [show, setShow] = useInstanceState<ShowState>('panel-show', { playing: false, startedAt: 0 })
  const [light, setLight] = useInstanceState<boolean>('panel-light', false)
  const [page, setPage] = useInstanceState<number>('panel-page', 0)
  // 自分だけの状態
  const [music, setMusic] = useState(true)

  const toggleShow = useCallback(() => {
    const time = now()
    // 流れている途中なら止める。止まっているか、もう終わっていれば、いまから始める
    setShow((previous) => (previous.playing && time < previous.startedAt + SHOW_LENGTH ? { playing: false, startedAt: previous.startedAt } : { playing: true, startedAt: time + SHOW_LEAD }))
  }, [now, setShow])
  const toggleLight = useCallback(() => setLight((value) => !value), [setLight])
  const next = useCallback(() => setPage((value) => value + 1), [setPage])
  const toggleMusic = useCallback(() => setMusic((value) => !value), [])

  /** 演出が流れているか。終わりの時刻を過ぎたら、自動で false に戻る（共有している値は書き換えない） */
  const [showOn, setShowOn] = useState(false)
  useEffect(() => {
    const update = () => setShowOn(show.playing && now() < show.startedAt + SHOW_LENGTH)
    update()
    if (!show.playing) return
    const timer = window.setInterval(update, 500)
    return () => window.clearInterval(timer)
  }, [show, now])

  return { now, show, showOn, light, page, music, toggleShow, toggleLight, next, toggleMusic }
}

export type Controls = ReturnType<typeof useControls>
