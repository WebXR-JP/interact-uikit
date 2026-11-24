import { BufferGeometry, Float32BufferAttribute } from 'three'

/**
 * ガラスパーツの基本形状パラメータ。
 * 角丸プレートの表裏をなだらかに膨らませたドーム／ベベル形状を定義する。
 * 丸ボタン・カプセル・タイル・スイッチのつまみ等は、すべてこの共通形状の寸法違いとして生成する。
 */
export interface CapShape {
  /** 幅と高さ（単位: m） */
  width: number
  height: number
  /** 角丸の半径（単位: m）。最大値は幅・高さの半分（半分にすると正円やカプセル型になる） */
  radius: number
  /** 側面の厚み（単位: m） */
  edge: number
  /** 表面の膨らみ高さ（単位: m）。外縁から中央に向かって盛り上がる量 */
  bulge: number
  /** 裏面の膨らみ高さ（単位: m） */
  back: number
  /** 膨らみの曲率指数。2 で球面に近い丸みになり、値が大きいほど「エッジ付近だけ丸く中央はフラット」な形状になる */
  roundness: number
}

/** 角丸 1 箇所あたりの分割数（丸ボタンの場合は円周全体でこの 4 倍の分割数になる） */
const CORNER_STEPS = 14
/** 外縁から中央までの同心リング分割数（曲率変化の大きい外縁付近ほど密に配置する） */
const RINGS = 9

const CORNERS: [number, number][] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
]

/**
 * ガラスパーツのジオメトリを生成する。原点は中心、表面は +z 方向。
 *   position : 頂点座標
 *   normal   : 法線ベクトル
 *   uv       : 幅・高さ全体を 0〜1 に正規化した UV 座標
 *   inset    : 外縁から中央への進行度（0 = 外縁, 1 = 中央）
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

  /** 外縁から距離 s（m）だけ内側の頂点リングを 1 周分追加する。z は高さ、slope は法線の傾き（0 = 真横向き, Infinity = 正面向き） */
  const addRing = (s: number, z: number, slope: number, facing: number, inset: number) => {
    for (const [c, [sx, sy]] of CORNERS.entries()) {
      for (let i = 0; i <= CORNER_STEPS; i++) {
        const angle = ((c + i / CORNER_STEPS) * Math.PI) / 2
        const nx = Math.cos(angle)
        const ny = Math.sin(angle)
        const r = radius - s
        // 角丸の半径より内側に入った領域では角が収束する（中央付近のフラットな面になるため見た目上の影響はない）
        const x = r > 0 ? sx * (halfW - radius) + nx * r : sx * Math.max(halfW - s, 0)
        const y = r > 0 ? sy * (halfH - radius) + ny * r : sy * Math.max(halfH - s, 0)
        positions.push(x, y, z)
        // 法線ベクトル: 外向きの水平法線と前後方向（±z）を傾き（slope）に応じて合成する
        const length = Math.hypot(1, slope)
        normals.push(nx / length, ny / length, (facing * slope) / length)
        uvs.push(x / shape.width + 0.5, y / shape.height + 0.5)
        insets.push(inset)
      }
    }
    return positions.length / 3 - perRing
  }

  /**
   * 隣接する 2 つの頂点リング間を三角形メッシュで接続する（各リングの頂点は +z 側から見て反時計回り）。
   * inward: リング a から b へ向かって内側（または +z 方向）に進む場合は true（表面が外側・+z 側を向くようインデックスを組む）
   */
  const bridge = (a: number, b: number, inward: boolean) => {
    for (let j = 0; j < perRing; j++) {
      const k = (j + 1) % perRing
      if (inward) indices.push(a + j, b + k, b + j, a + j, a + k, b + k)
      else indices.push(a + j, b + j, b + k, a + j, b + k, a + k)
    }
  }

  // 断面のプロファイル曲線: 外縁で垂直に立ち上がり、中央に向かって滑らかに水平へ近づく（超楕円の 1/4 曲線）
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
      // 接線の傾きの逆数（真横向き = 0）。外縁では 0、中央では非常に大きな値（ほぼ正面向き）になる
      const slope = dzds === Infinity ? 0 : dzds <= 1e-6 ? 1e6 : 1 / dzds
      const ring = addRing(x * deepest, rim + facing * height * lift(x), slope, facing, x)
      // 表面は外縁から中央へ進むほど +z 側、裏面は -z 側へ膨らむ（裏面は面の向きを反転させて法線を -z 側に向ける）
      if (previous >= 0) bridge(previous, ring, facing > 0)
      previous = ring
    }
  }

  // 側面: 裏面と表面の外縁リング同士を接続する
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

/** 各 UI パーツの形状プリセット。size は丸ボタン・タイルでは直径／一辺の長さ、カプセルでは高さ（単位: m）を表す */
export const SHAPES = {
  /** 丸ボタン: レンズ状に膨らんだ円形 */
  round: (size: number): CapShape => ({ width: size, height: size, radius: size / 2, edge: size * 0.05, bulge: size * 0.13, back: size * 0.05, roundness: 2.3 }),
  /** カプセル型: アイコンとラベルを横に並べやすい横長ボタン */
  pill: (size: number, width = size * 2.7): CapShape => ({ width, height: size, radius: size / 2, edge: size * 0.06, bulge: size * 0.14, back: size * 0.05, roundness: 2.6 }),
  /** タイル型: 画像などを載せやすい角丸の四角形ボタン */
  tile: (size: number, width = size): CapShape => ({ width, height: size, radius: size * 0.2, edge: size * 0.05, bulge: size * 0.07, back: size * 0.03, roundness: 5 }),
  /** スイッチのトラック（つまみがスライドするレール部分） */
  track: (size: number): CapShape => ({ width: size * 1.9, height: size, radius: size / 2, edge: size * 0.05, bulge: size * 0.06, back: size * 0.04, roundness: 3.2 }),
  /** スイッチのつまみ（ノブ） */
  knob: (size: number): CapShape => ({ width: size * 0.82, height: size * 0.82, radius: size * 0.41, edge: size * 0.05, bulge: size * 0.2, back: size * 0.05, roundness: 2.1 }),
  /** ベースプレート: 各パーツを並べて配置する薄いガラス板 */
  plate: (width: number, height: number): CapShape => ({ width, height, radius: Math.min(width, height) * 0.22, edge: 0.004, bulge: 0.004, back: 0.002, roundness: 4 }),
}

export type ShapeName = 'round' | 'pill' | 'tile'
