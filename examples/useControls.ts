import { useInstanceState, useServerClock } from '@xrift/world-components'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 操作パネルで管理するステートの実装例。
 * ワールド内で 1 回だけ呼び出し、操作パネル（入力側）と演出コンポーネント（参照側）の両方に渡して使用する。
 *
 *   演出 (show)   : インスタンス全体で同期。同期するのは「開始時刻」のみとし、現在の進行状況は
 *                   XRift の共有クロックをもとに各クライアント側で計算する（通信はボタンを押した瞬間の 1 回のみで、
 *                   途中参加したプレイヤーにもズレなく同じ進行状況が再現される）。
 *   明かり (light): インスタンス全体で同期（ON / OFF のみ）。
 *   次へ (page)   : インスタンス全体で同期（現在のインデックス番号）。
 *   BGM (music)   : ローカルのみ（各プレイヤー個人の設定とし、他者には影響させない）。
 *
 * 時刻の計算にはすべて XRift の共有クロック（サーバー時刻ベースの秒数）を使用するため、端末ごとの時計のズレに左右されない。
 */

/** 演出 1 回あたりの再生時間（秒） */
export const SHOW_LENGTH = 30
/** ボタンを押してから演出が開始されるまでのリードタイム（秒）。全クライアントへのステート同期遅延を吸収する */
const SHOW_LEAD = 0.5

/** 演出の同期ステート（startedAt は共有クロック基準の開始秒数） */
export interface ShowState {
  playing: boolean
  startedAt: number
}

export function useControls() {
  const clock = useServerClock()
  const clockRef = useRef(clock)
  clockRef.current = clock
  /** 共有サーバー時刻（秒）を取得する関数。useFrame 内から再レンダリングを発生させずに参照できる */
  const now = useCallback(() => clockRef.current.now() / 1000, [])

  // インスタンス全体で共有するステート。キー名（第 1 引数）はワールド内で一意になるよう指定する
  const [show, setShow] = useInstanceState<ShowState>('panel-show', { playing: false, startedAt: 0 })
  const [light, setLight] = useInstanceState<boolean>('panel-light', false)
  const [page, setPage] = useInstanceState<number>('panel-page', 0)
  // 自分のクライアントのみで保持するローカルステート
  const [music, setMusic] = useState(true)

  const toggleShow = useCallback(() => {
    const time = now()
    // 再生中なら停止し、停止中または再生終了後であれば現在時刻（＋リードタイム）から開始する
    setShow((previous) => (previous.playing && time < previous.startedAt + SHOW_LENGTH ? { playing: false, startedAt: previous.startedAt } : { playing: true, startedAt: time + SHOW_LEAD }))
  }, [now, setShow])
  const toggleLight = useCallback(() => setLight((value) => !value), [setLight])
  const next = useCallback(() => setPage((value) => value + 1), [setPage])
  const toggleMusic = useCallback(() => setMusic((value) => !value), [])

  /** 演出が現在再生中かどうかを表すフラグ。終了時刻を過ぎたらローカルで自動的に false に戻す（共有ステート自体は書き換えない） */
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
