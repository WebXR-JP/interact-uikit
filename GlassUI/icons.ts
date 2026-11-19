import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, type Texture } from 'three'

/**
 * アイコンとラベルの絵。画像ファイルは使わず、その場でキャンバスに描いてテクスチャにする
 * （部品のフォルダーだけを別のワールドへ持っていっても、そのまま動くように）。
 *
 * テクスチャの r に形、g にそのまわりのにじみ（入のときに光る分）を入れる。色はシェーダーが付ける。
 */

/** アイコンを描く関数。24 × 24 の枠の中に、線（stroke）と塗り（fill）で描く。色と線の太さは設定済み */
export type IconPainter = (ctx: CanvasRenderingContext2D) => void

const line = (ctx: CanvasRenderingContext2D, d: string) => ctx.stroke(new Path2D(d))
const solid = (ctx: CanvasRenderingContext2D, d: string) => {
  const path = new Path2D(d)
  ctx.fill(path)
  ctx.stroke(path)
}
const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}
const arc = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, from: number, to: number) => {
  ctx.beginPath()
  ctx.arc(x, y, r, from, to)
  ctx.stroke()
}
const frame = (x0: number, y0: number, x1: number, y1: number, r: number) =>
  `M${x0 + r} ${y0} H${x1 - r} A${r} ${r} 0 0 1 ${x1} ${y0 + r} V${y1 - r} A${r} ${r} 0 0 1 ${x1 - r} ${y1} H${x0 + r} A${r} ${r} 0 0 1 ${x0} ${y1 - r} V${y0 + r} A${r} ${r} 0 0 1 ${x0 + r} ${y0} Z`
/** 4 つの先が尖った星（きらめき） */
const star = (x: number, y: number, outer: number, inner: number) => {
  let d = ''
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2
    const r = i % 2 ? inner : outer
    d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * r).toFixed(2)} ${(y + Math.sin(a) * r).toFixed(2)} `
  }
  return `${d}Z`
}

/** 用意してあるアイコン */
export const ICONS = {
  /** 音楽・BGM */
  music: (ctx) => {
    line(ctx, 'M9.2 17.6 V6.6 L18.6 4.6 V15.6')
    dot(ctx, 6.9, 17.6, 2.35)
    dot(ctx, 16.3, 15.6, 2.35)
  },
  /** 花火 */
  fireworks: (ctx) => {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 - Math.PI / 2
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      // 真下の 1 本は、打ち上がってきた尾として長く引く
      const far = k === 4 ? 11.2 : k % 2 ? 6.1 : 7.9
      line(ctx, `M${12 + cos * 3.4} ${10.4 + sin * 3.4} L${12 + cos * far} ${10.4 + sin * far}`)
      if (k % 2 === 0 && k !== 4) dot(ctx, 12 + cos * 9.9, 10.4 + sin * 9.9, 0.95)
    }
  },
  /** 再生 */
  play: (ctx) => solid(ctx, 'M9.2 6.3 L18 12 L9.2 17.7 Z'),
  /** 停止 */
  stop: (ctx) => solid(ctx, frame(7.2, 7.2, 16.8, 16.8, 1.3)),
  /** 一時停止 */
  pause: (ctx) => {
    solid(ctx, frame(7.4, 6.6, 10.2, 17.4, 0.6))
    solid(ctx, frame(13.8, 6.6, 16.6, 17.4, 0.6))
  },
  /** 動画・スクリーン */
  video: (ctx) => {
    line(ctx, frame(3, 4.8, 21, 16.4, 2))
    solid(ctx, 'M10.5 8.4 L14.5 10.6 L10.5 12.8 Z')
    line(ctx, 'M12 16.4 V19.8 M8.4 19.8 H15.6')
  },
  /** 画像 */
  image: (ctx) => {
    line(ctx, frame(3.2, 4.8, 20.8, 19.2, 2.2))
    dot(ctx, 8.4, 9.6, 1.5)
    line(ctx, 'M4.4 17 L9.3 12.2 L12.4 15.1 L15.2 12.6 L19.6 16.8')
  },
  /** 電源・汎用の入／切 */
  power: (ctx) => {
    line(ctx, 'M12 3.6 V11.4')
    arc(ctx, 12, 12.9, 7.1, -Math.PI / 2 + 0.72, -Math.PI / 2 - 0.72 + Math.PI * 2)
  },
  /** 音・効果音 */
  sound: (ctx) => {
    solid(ctx, 'M3.8 9.8 H6.8 L11 6.4 V17.6 L6.8 14.2 H3.8 Z')
    arc(ctx, 11.2, 12, 3.7, -0.62, 0.62)
    arc(ctx, 11.2, 12, 7, -0.72, 0.72)
  },
  /** 明かり */
  light: (ctx) => {
    arc(ctx, 12, 12, 3.7, 0, Math.PI * 2)
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      line(ctx, `M${12 + Math.cos(a) * 6.4} ${12 + Math.sin(a) * 6.4} L${12 + Math.cos(a) * 8.6} ${12 + Math.sin(a) * 8.6}`)
    }
  },
  /** 次へ */
  next: (ctx) => line(ctx, 'M4.5 12 H18.5 M13 6.5 L18.5 12 L13 17.5'),
  /** 演出・きらめき */
  sparkle: (ctx) => {
    solid(ctx, star(10.6, 12.8, 7.4, 2.1))
    solid(ctx, star(18.4, 5.8, 2.9, 0.9))
  },
  /** 決定 */
  check: (ctx) => line(ctx, 'M5.5 12.5 L10.2 17 L18.5 7.5'),
  /** 案内 */
  info: (ctx) => {
    dot(ctx, 12, 7, 1.25)
    line(ctx, 'M12 11 V17.6')
  },
  /** 場所・方角 */
  pin: (ctx) => {
    line(ctx, 'M12 21 C12 21 5.6 14.7 5.6 9.9 A6.4 6.4 0 0 1 18.4 9.9 C18.4 14.7 12 21 12 21 Z')
    dot(ctx, 12, 9.8, 2.1)
  },
  /** マイク・ライブ */
  mic: (ctx) => {
    line(ctx, frame(9.2, 3.6, 14.8, 13.4, 2.8))
    line(ctx, 'M6.4 11.2 A5.6 5.6 0 0 0 17.6 11.2 M12 16.8 V20.2 M8.8 20.2 H15.2')
  },
} satisfies Record<string, IconPainter>

export type IconName = keyof typeof ICONS

/** ラベルの文字。文字列 1 つか、3 言語（日本語を大きく、英語と中国語を小さく添える） */
export type LabelText = string | { ja: string; en?: string; zh?: string }

const FONT = '"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", "Meiryo", "Noto Sans CJK JP", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'

const splitLabel = (label: LabelText) =>
  typeof label === 'string' ? { main: label, sub: '' } : { main: label.ja, sub: [label.en, label.zh].filter(Boolean).join('  ·  ') }

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not available')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  // r と g を別々に足していく（形は r、にじみは g）
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  return { canvas, ctx }
}

function toTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = NoColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

/** 形を r に、にじみを g に描く。paint は色と影を設定したあとに 2 回呼ばれる */
function paintLayers(ctx: CanvasRenderingContext2D, glow: number, paint: () => void) {
  ctx.shadowBlur = 0
  ctx.strokeStyle = ctx.fillStyle = '#f00'
  paint()
  ctx.shadowColor = '#0f0'
  ctx.shadowBlur = glow
  ctx.strokeStyle = ctx.fillStyle = '#0f0'
  paint()
  ctx.shadowBlur = 0
}

function paintIcon(ctx: CanvasRenderingContext2D, painter: IconPainter, x: number, y: number, size: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.lineWidth = 1.9
  paintLayers(ctx, size * 0.06, () => painter(ctx))
  ctx.restore()
}

const iconCache = new Map<IconPainter, Texture>()

/** アイコン 1 つのテクスチャ（正方形）。同じアイコンは使い回す */
export function createIconTexture(icon: IconName | IconPainter): Texture {
  const painter = typeof icon === 'function' ? icon : ICONS[icon]
  let texture = iconCache.get(painter)
  if (!texture) {
    const size = 256
    const { canvas, ctx } = createCanvas(size, size)
    // にじみが端で切れないよう、まわりに余白を取る
    paintIcon(ctx, painter, size * 0.14, size * 0.14, size * 0.72)
    texture = toTexture(canvas)
    iconCache.set(painter, texture)
  }
  return texture
}

/** アイコンのテクスチャの中で、絵（24 × 24 の枠）が占める割合 */
export const ICON_INNER = 0.72

/** 部品の下や横に添えるラベル。戻り値の aspect は横 ÷ 縦 */
export function createLabelTexture(label: LabelText, align: 'center' | 'left' = 'center') {
  const { main, sub } = splitLabel(label)
  const width = 512
  const height = sub ? 176 : 112
  const { canvas, ctx } = createCanvas(width, height)
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const x = align === 'center' ? width / 2 : 20
  const fit = (text: string, size: number, weight: number) => {
    let px = size
    do {
      ctx.font = `${weight} ${px}px ${FONT}`
      px -= 2
    } while (ctx.measureText(text).width > width - 40 && px > 16)
  }
  paintLayers(ctx, 10, () => {
    fit(main, 62, 600)
    ctx.fillText(main, x, sub ? 62 : height / 2)
    if (sub) {
      fit(sub, 31, 500)
      ctx.fillText(sub, x, 132)
    }
  })
  return { texture: toTexture(canvas), aspect: width / height }
}

/** カプセルの面いっぱいに描く絵: 左にアイコン、右にラベル。aspect はカプセルの横 ÷ 縦 */
export function createPillFaceTexture(icon: IconName | IconPainter | null, label: LabelText, aspect: number) {
  const { main, sub } = splitLabel(label)
  const height = 200
  const width = Math.round(height * aspect)
  const { canvas, ctx } = createCanvas(width, height)
  let left = height * 0.34
  if (icon) {
    const painter = typeof icon === 'function' ? icon : ICONS[icon]
    paintIcon(ctx, painter, height * 0.3, height * 0.24, height * 0.52)
    left = height * 0.94
  }
  ctx.textAlign = icon ? 'left' : 'center'
  ctx.textBaseline = 'middle'
  const room = width - left - height * 0.3
  const x = icon ? left : width / 2
  const fit = (text: string, size: number, weight: number) => {
    let px = size
    do {
      ctx.font = `${weight} ${px}px ${FONT}`
      px -= 2
    } while (ctx.measureText(text).width > room && px > 14)
  }
  paintLayers(ctx, 9, () => {
    fit(main, sub ? 58 : 66, 600)
    ctx.fillText(main, x, sub ? height * 0.4 : height * 0.5)
    if (sub) {
      fit(sub, 27, 500)
      ctx.fillText(sub, x, height * 0.7)
    }
  })
  return toTexture(canvas)
}
