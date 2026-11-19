import { BufferGeometry, Float32BufferAttribute } from 'three'

/**
 * ガラスの部品の形。角の丸い板を、表も裏もなだらかにふくらませた「磨いたガラスの小石」。
 * 丸ボタン・カプセル・タイル・スイッチのつまみは、どれもこの 1 つの作り方の寸法ちがい。
 */
export interface CapShape {
  /** 幅と高さ（m） */
  width: number
  height: number
  /** 角の丸み（m）。幅・高さの半分まで（半分にすると丸やカプセルになる） */
  radius: number
  /** 側面の厚み（m） */
  edge: number
  /** 表のふくらみ（m）。縁から中央へ盛り上がる高さ */
  bulge: number
  /** 裏のふくらみ（m） */
  back: number
  /** ふくらみ方。2 で球のよう、大きいほど「縁だけ丸くて上は平ら」になる */
  roundness: number
}

/** 角 1 つを何分割するか（丸ボタンは 4 倍の角数の多角形になる） */
const CORNER_STEPS = 14
/** 縁から中央までの輪の数。縁の近くほど細かく取る */
const RINGS = 9

const CORNERS: [number, number][] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
]

/**
 * 形を作る。原点は中心、表は +z。
 *   position  頂点
 *   normal    面の向き
 *   uv        幅・高さいっぱいを 0〜1 にしたもの
 *   inset     縁から内側へどれだけ入ったか（0 = 縁, 1 = 中央）
 */
export function createCapGeometry(shape: CapShape): BufferGeometry {
  const halfW = shape.width / 2
  const halfH = shape.height / 2
  const deepest = Math.min(halfW, halfH)
  const radius = Math.min(shape.radius, deepest)
  const perRing = CORNERS.length * (CORNER_STEPS + 1)

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const insets: number[] = []
  const indices: number[] = []

  /** 縁から s（m）だけ内側の輪を 1 周ぶん足す。高さ z、面の傾き slope（0 = 真横向き, 無限大 = 真上向き） */
  const addRing = (s: number, z: number, slope: number, facing: number, inset: number) => {
    for (const [c, [sx, sy]] of CORNERS.entries()) {
      for (let i = 0; i <= CORNER_STEPS; i++) {
        const angle = ((c + i / CORNER_STEPS) * Math.PI) / 2
        const nx = Math.cos(angle)
        const ny = Math.sin(angle)
        const r = radius - s
        // 丸みより内側まで入ると、角は尖る（そこはもう平らなので見分けはつかない）
        const x = r > 0 ? sx * (halfW - radius) + nx * r : sx * Math.max(halfW - s, 0)
        const y = r > 0 ? sy * (halfH - radius) + ny * r : sy * Math.max(halfH - s, 0)
        positions.push(x, y, z)
        // 面の向き: 外向き（輪の法線）と前後の向きを、傾きで混ぜる
        const length = Math.hypot(1, slope)
        normals.push(nx / length, ny / length, (facing * slope) / length)
        uvs.push(x / shape.width + 0.5, y / shape.height + 0.5)
        insets.push(inset)
      }
    }
    return positions.length / 3 - perRing
  }

  /**
   * 2 つの輪を帯でつなぐ。輪は +z から見て反時計回りに並んでいる。
   * inward: a から b へ行くと輪の内側（または +z 側）へ進むとき true（面の表が外・+z を向く）
   */
  const bridge = (a: number, b: number, inward: boolean) => {
    for (let j = 0; j < perRing; j++) {
      const k = (j + 1) % perRing
      if (inward) indices.push(a + j, b + k, b + j, a + j, a + k, b + k)
      else indices.push(a + j, b + j, b + k, a + j, b + k, a + k)
    }
  }

  // ふくらみの形: 縁では垂直に立ち上がり、中央で平らになる（超楕円の 4 分の 1）
  const p = Math.max(shape.roundness, 1.2)
  const lift = (x: number) => (1 - (1 - x) ** p) ** (1 / p)
  const steep = (x: number) => (x <= 0 ? Infinity : (1 - (1 - x) ** p) ** (1 / p - 1) * (1 - x) ** (p - 1))

  for (const facing of [1, -1]) {
    const height = facing > 0 ? shape.bulge : shape.back
    const rim = (facing * shape.edge) / 2
    let previous = -1
    for (let k = 0; k <= RINGS; k++) {
      const x = (k / RINGS) ** 2.2
      const dzds = (height * steep(x)) / deepest
      // 傾きの逆数（真横向き = 0）。縁では 0、中央では無限大になる
      const slope = dzds === Infinity ? 0 : dzds <= 1e-6 ? 1e6 : 1 / dzds
      const ring = addRing(x * deepest, rim + facing * height * lift(x), slope, facing, x)
      // 表は縁から中央へ進むほど +z 側、裏は -z 側（裏は逆向きに張って、面の表を -z に向ける）
      if (previous >= 0) bridge(previous, ring, facing > 0)
      previous = ring
    }
  }

  // 側面: 裏の縁と表の縁をつなぐ
  if (shape.edge > 0) {
    const top = addRing(0, shape.edge / 2, 0, 1, 0)
    const bottom = addRing(0, -shape.edge / 2, 0, 1, 0)
    bridge(bottom, top, true)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('inset', new Float32BufferAttribute(insets, 1))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

/** 部品の形の決まり。size は丸とタイルなら差し渡し、カプセルなら高さ（m） */
export const SHAPES = {
  /** 丸ボタン: レンズのようにふくらんだ円 */
  round: (size: number): CapShape => ({ width: size, height: size, radius: size / 2, edge: size * 0.05, bulge: size * 0.13, back: size * 0.05, roundness: 2.3 }),
  /** カプセル: アイコンとラベルを横に並べる横長のボタン */
  pill: (size: number, width = size * 2.7): CapShape => ({ width, height: size, radius: size / 2, edge: size * 0.06, bulge: size * 0.14, back: size * 0.05, roundness: 2.6 }),
  /** タイル: 画像を載せる角丸の四角 */
  tile: (size: number, width = size): CapShape => ({ width, height: size, radius: size * 0.2, edge: size * 0.05, bulge: size * 0.07, back: size * 0.03, roundness: 5 }),
  /** スイッチの溝（つまみが動くレール） */
  track: (size: number): CapShape => ({ width: size * 1.9, height: size, radius: size / 2, edge: size * 0.05, bulge: size * 0.06, back: size * 0.04, roundness: 3.2 }),
  /** スイッチのつまみ */
  knob: (size: number): CapShape => ({ width: size * 0.82, height: size * 0.82, radius: size * 0.41, edge: size * 0.05, bulge: size * 0.2, back: size * 0.05, roundness: 2.1 }),
  /** 台: 部品を並べて載せる薄いガラスの板 */
  plate: (width: number, height: number): CapShape => ({ width, height, radius: Math.min(width, height) * 0.22, edge: 0.004, bulge: 0.004, back: 0.002, roundness: 4 }),
}

export type ShapeName = 'round' | 'pill' | 'tile'
