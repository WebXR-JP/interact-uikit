import {
  AdditiveBlending,
  BackSide,
  Color,
  CustomBlending,
  FrontSide,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
} from 'three'

/**
 * ガラスの見た目。
 *
 * 本物のガラスは「向こうが透けて、まわりを映す」だけなので、暗いワールドではほとんど見えなくなる。
 * ここでは UI として読めるように、澄んだガラスらしさを次のもので描く（背景を取り込む処理は使わないので軽い）:
 *
 *   縁の線      輪郭ぎりぎりの細い光の線。明かりを向いた側（左上）がいちばん明るい
 *   抜けた光    明かりの反対側（右下）の縁の内側に、ガラスを抜けてきた光がたまる
 *   窓の映り    左上の縁に沿って、細長い明かりがくっきり映る（面の丸みで弓なりになる）
 *   空の映り    まわりの空・地平線・地面の色（ワールドごとに setGlassEnvironment で渡す）
 *   裏の面      裏側の縁も描く。表の縁とずれて見えるので、厚みのある透明な塊に見える
 *
 * 中ほどはほとんど素通しにして、向こうが見えるままにする（ごく薄い曇りだけ）。
 *
 * 入・切や押したときの変化は uState で受け取る:
 *   x = 入（0〜1）, y = 狙われている（0〜1）, z = 押した直後のきらめき（1 → 0）, w = 波紋の半径（部品の半分 = 1）
 */

/** まわりの色と明かり。全部の部品で共有する */
const environment = {
  uEnvSky: { value: new Color(0.05, 0.07, 0.14) },
  uEnvHorizon: { value: new Color(0.3, 0.2, 0.24) },
  uEnvGround: { value: new Color(0.01, 0.012, 0.016) },
  /** 仮の明かりの向き（部品から見て。左上の手前） */
  uKey: { value: new Vector3(-0.45, 0.62, 0.64).normalize() },
  /** 縁の光の色と、曇りの色・濃さ */
  uRim: { value: new Color(0.62, 0.78, 1.0) },
  uFrost: { value: new Vector4(0.62, 0.74, 0.92, 0.008) },
  /** ガラスの濃さ（向こうをどれだけ暗くするか） */
  uShade: { value: 0.04 },
}
/** 部品の外に出すラベルの文字の色 */
const ink = { uInk: { value: new Color(0.9, 0.94, 1.0) } }

export interface GlassEnvironment {
  /** 空の高い所・地平線ぎわ・地面の色（リニア rgb） */
  sky?: readonly number[]
  horizon?: readonly number[]
  ground?: readonly number[]
  /** 縁の光の色 */
  rim?: readonly number[]
  /** 曇りの色（rgb）と濃さ（0〜1。既定は 0.008 でほぼ素通し。明るいワールドでは 0.05 くらいまで上げると読みやすい） */
  frost?: readonly number[]
  /**
   * ガラスの濃さ（0〜1）。既定は 0.04 でほぼ透明。昼間のような明るいワールドでは 0.3〜0.45 にして
   * 「色の濃いガラス」にすると、白いアイコンが読める
   */
  shade?: number
  /** 部品の外に出すラベルの文字の色。既定は白。明るいワールドでは暗い色にする */
  label?: readonly number[]
}

/** ワールドの空の色などを渡す。渡さなければ夕暮れ向きの既定値 */
export function setGlassEnvironment(values: GlassEnvironment) {
  if (values.sky) environment.uEnvSky.value.setRGB(values.sky[0], values.sky[1], values.sky[2])
  if (values.horizon) environment.uEnvHorizon.value.setRGB(values.horizon[0], values.horizon[1], values.horizon[2])
  if (values.ground) environment.uEnvGround.value.setRGB(values.ground[0], values.ground[1], values.ground[2])
  if (values.rim) environment.uRim.value.setRGB(values.rim[0], values.rim[1], values.rim[2])
  if (values.frost) environment.uFrost.value.set(values.frost[0], values.frost[1], values.frost[2], values.frost[3] ?? environment.uFrost.value.w)
  if (values.shade !== undefined) environment.uShade.value = values.shade
  if (values.label) ink.uInk.value.setRGB(values.label[0], values.label[1], values.label[2])
}

/** 部品 1 つぶんの状態。表・裏・アイコン・光の粒のマテリアルで共有する */
export interface GlassState {
  uState: { value: Vector4 }
  uTint: { value: Color }
  /** 幅と高さの半分（m） */
  uHalf: { value: Vector2 }
  /** 縁に沿って描く進み具合の輪（0〜1。負なら描かない） */
  uProgress: { value: number }
  /** 入のとき、面の中ほどにたまる色の光の強さ（1 = 縁が光るだけのボタン。スイッチの溝は大きくして面ごと光らせる） */
  uFill: { value: number }
  /** 明かりの映り込みの強さ（1 = ふくらんだボタン。平らな板は面ぜんたいが光ってしまうので小さくする） */
  uGloss: { value: number }
}

export function createGlassState(tint: Color, halfWidth: number, halfHeight: number): GlassState {
  return {
    uState: { value: new Vector4(0, 0, 0, 9) },
    uTint: { value: tint },
    uHalf: { value: new Vector2(halfWidth, halfHeight) },
    uProgress: { value: -1 },
    uFill: { value: 1 },
    uGloss: { value: 1 },
  }
}

/** 光を足しながら、濃さのぶんだけ後ろを隠す重ね方（色は濃さを掛けた値で出す） */
const LAYERED = {
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  premultipliedAlpha: true,
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
} as const

const GLASS_VERTEX = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float inset;
  uniform vec2 uHalf;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vShape;      // 部品から見た面の向き
  varying vec3 vToEye;      // 部品から見た、目のある向き
  varying vec2 vLocal;
  varying float vInset;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    // 大きさは変えても向きだけ回す（拡大率が軸ごとに違うことは無い前提）
    vNormal = normalize(mat3(modelMatrix) * normal);
    vShape = normal;
    vToEye = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position;
    vLocal = position.xy / uHalf;
    vInset = inset;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`

const GLASS_FRAGMENT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uEnvSky;
  uniform vec3 uEnvHorizon;
  uniform vec3 uEnvGround;
  uniform vec3 uKey;
  uniform vec3 uRim;
  uniform vec4 uFrost;
  uniform float uShade;
  uniform vec3 uTint;
  uniform vec4 uState;
  uniform float uProgress;
  uniform float uFill;
  uniform float uGloss;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vShape;
  varying vec3 vToEye;
  varying vec2 vLocal;
  varying float vInset;

  // その向きに見えるまわりの色: 地平線ぎわが明るく、上は空、下は地面
  vec3 surroundings(vec3 ray) {
    vec3 above = mix(uEnvHorizon, uEnvSky, smoothstep(0.0, 0.55, ray.y));
    return mix(above, uEnvGround, smoothstep(0.0, 0.3, -ray.y));
  }

  // 細長い明かり（窓）の映り込み。向き toward を中心に、縁に沿う方向へ長い
  float window(vec3 mirrored, vec3 toward, float along, float across) {
    vec3 side = normalize(vec3(toward.y, -toward.x, 0.0));
    vec3 lift = cross(toward, side);
    float a = dot(mirrored, side);
    float b = dot(mirrored, lift);
    return (1.0 - smoothstep(along * 0.7, along, abs(a))) * (1.0 - smoothstep(across * 0.55, across, abs(b))) * step(0.0, dot(mirrored, toward));
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 normal = normalize(vNormal);
    vec3 shape = normalize(vShape);
    vec3 toEye = normalize(vToEye);
    #ifdef GLASS_BACK
      normal = -normal;
      shape = -shape;
    #endif
    float away = 1.0 - clamp(dot(normal, view), 0.0, 1.0);
    float thin = pow(away, 7.0);    // 輪郭ぎりぎりの細い線
    float soft = pow(away, 2.4);    // そこから内へ広がる淡い光
    vec3 mirrored = reflect(-view, normal);
    vec3 seen = reflect(-toEye, shape);  // 同じ映り込みを、部品から見た向きで
    // 縁がどれだけ明かりのほうを向いているか（-1〜1。部品の面の中で）
    float toward = dot(normalize(vShape.xy + vec2(1e-5)), normalize(uKey.xy));
    float on = uState.x;
    float aimed = uState.y;
    float sparkle = uState.z;
    float reach = length(vLocal);
    // 平らな板（uGloss が小さい）は、斜めから見ると面ぜんたいが「輪郭」になって、看板のように光ってしまう。
    // 縁の光は形の端の近くだけに絞り、空の映り込みも控えめにする
    float rimOnly = mix(1.0 - smoothstep(0.02, 0.16, vInset), 1.0, uGloss);
    float sky = mix(0.3, 1.0, uGloss);

    #ifdef GLASS_BACK
      // 裏の面: 縁の線と、明かりの反対側に映る小さな窓だけ（表より控えめ）
      float lit = 0.25 + 0.75 * smoothstep(-0.2, 1.0, -toward);
      vec3 light = uRim * thin * 0.5 * lit * rimOnly + surroundings(mirrored) * soft * 0.35 * sky;
      light += vec3(0.9, 0.95, 1.0) * window(seen, vec3(-uKey.xy, uKey.z), 0.5, 0.11) * 0.16 * uGloss;
      light += uTint * on * (0.3 * thin + 0.08 * soft);
      gl_FragColor = vec4(light, thin * 0.1 * rimOnly);
    #else
      float lit = 0.22 + 0.78 * smoothstep(-0.25, 1.0, toward);
      float through = smoothstep(0.15, 1.0, -toward);
      vec3 light = surroundings(mirrored) * (0.012 + 0.85 * soft) * sky;
      light += uRim * (thin * (0.35 + 1.0 * lit) + soft * 0.07) * (1.0 + 0.6 * aimed) * rimOnly;
      light += uRim * through * soft * (1.0 - thin) * 0.3 * rimOnly;
      light += vec3(1.0) * window(seen, uKey, 0.62, 0.1) * (0.5 + 0.2 * aimed) * uGloss;
      // 曇り: ごく薄く。狙われると少し濃くなる
      float frost = uFrost.a * (1.0 + 0.25 * vLocal.y + 2.5 * aimed);
      light += uFrost.rgb * frost;
      // 入: 縁を色の光が回り、中央にも淡くたまる
      light += uTint * on * (uFill * (0.012 + 0.05 * exp(-reach * reach * 2.0)) + thin * (0.5 + 0.6 * lit) + 0.3 * soft);
      // 押した直後: 中央から縁へ走る波紋と、全体のきらめき
      float ring = exp(-pow((reach - uState.w) / 0.16, 2.0)) * sparkle;
      light += mix(vec3(1.0), uTint, 0.45) * (ring * 0.3 + sparkle * 0.05);
      // 進み具合の輪: 縁の少し内側を、上から時計回りに進む
      if (uProgress >= 0.0) {
        float band = smoothstep(0.03, 0.07, vInset) * (1.0 - smoothstep(0.13, 0.19, vInset));
        float turn = fract(atan(vLocal.x, vLocal.y) / 6.2831853 + 1.0);
        float done = 1.0 - smoothstep(uProgress - 0.006, uProgress + 0.006, turn);
        light += (mix(vec3(1.0), uTint, 0.5) * done * 0.85 + vec3(0.1) * (1.0 - done)) * band;
      }
      // ガラスの濃さのぶんだけ、向こうが暗く見える
      gl_FragColor = vec4(light, clamp(uShade + frost + thin * 0.35 * rimOnly, 0.0, 0.92));
    #endif
    #include <colorspace_fragment>
  }
`

/** ガラスの表と裏。同じ形に 2 枚重ねて、裏 → 中身 → 表の順に描く */
export function createGlassMaterials(state: GlassState) {
  const uniforms = { ...environment, ...state }
  const front = new ShaderMaterial({ ...LAYERED, side: FrontSide, uniforms, vertexShader: GLASS_VERTEX, fragmentShader: GLASS_FRAGMENT })
  const back = new ShaderMaterial({ ...LAYERED, side: BackSide, uniforms, defines: { GLASS_BACK: '' }, vertexShader: GLASS_VERTEX, fragmentShader: GLASS_FRAGMENT })
  return { front, back }
}

export interface FaceOptions {
  /** 絵の大きさ（部品の高さ = 1。icon では正方形の一辺、ほかは 1 で面いっぱい） */
  face: number
  /** 絵を描く板が部品の何倍か（まわりへにじむ光のぶん） */
  spread: number
  /**
   * icon: 中央に正方形の線画（テクスチャの r = 線, g = 線のまわりのにじみ。icons.ts が作る）
   * wide: 面いっぱいの線画（カプセルの「アイコン＋ラベル」）
   * image: 面いっぱいの画像（rgb をそのまま出し、部品の角の丸みで切り抜く）
   */
  mode: 'icon' | 'wide' | 'image'
  /** 角の丸み（部品の高さの半分 = 1） */
  radius: number
  /** 部品の横 ÷ 縦 */
  aspect: number
}

/**
 * ガラスの中に浮かぶ絵（アイコンや画像）と、入のときに部品のまわりへにじむ光。
 * 絵は部品より大きい板に描く: 中央が絵、その外は光のにじみだけ。
 */
export function createFaceMaterial(state: GlassState, icon: Texture, options: FaceOptions) {
  return new ShaderMaterial({
    ...LAYERED,
    uniforms: {
      ...state,
      uShade: environment.uShade,
      uIcon: { value: icon },
      uFace: { value: new Vector4(options.face, options.spread, options.mode === 'icon' ? 0 : options.mode === 'image' ? 1 : 2, options.radius) },
      uAspect: { value: options.aspect },
    },
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
      uniform sampler2D uIcon;
      uniform vec3 uTint;
      uniform vec4 uState;
      uniform float uShade;
      uniform vec4 uFace;
      uniform float uAspect;
      varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        float on = uState.x;
        float aimed = uState.y;
        float sparkle = uState.z;
        // 板の中心からの位置（部品の高さの半分 = 1）
        vec2 p = (vUv - 0.5) * 2.0 * uFace.y;
        p.x *= uAspect;
        vec3 light = vec3(0.0);
        float cover = 0.0;
        // 入のとき、部品のまわりへにじむ光（部品の形に沿って広がる）
        vec2 outside = max(abs(p) - vec2(max(uAspect - 1.0, 0.0), 0.0), 0.0);
        float away = length(outside);
        // 縁のあたりから外へ（中ほどは澄んだまま）
        light += uTint * (on * 0.14 + sparkle * 0.12) * smoothstep(0.5, 1.0, away) * exp(-away * away * 2.2) * (1.0 - smoothstep(uFace.y * 0.55, uFace.y, away));

        // uFace = 絵の大きさ, 板の倍率, 種類（0 = 中央の正方形, 1 = 画像, 2 = 面いっぱいの線画）, 角の丸み
        vec2 at = p / (uFace.x * vec2(uFace.z > 0.5 ? uAspect : 1.0, 1.0)) * 0.5 + 0.5;
        if (at.x > 0.0 && at.x < 1.0 && at.y > 0.0 && at.y < 1.0) {
          vec4 texel = texture2D(uIcon, at);
          if (uFace.z > 0.5 && uFace.z < 1.5) {
            // 画像: 部品の角の丸みで切り抜き、切のときは少し沈める
            vec2 corner = abs(p) - (vec2(uAspect, 1.0) * uFace.x - uFace.w);
            float inside = 1.0 - smoothstep(-0.02, 0.02, length(max(corner, 0.0)) - uFace.w);
            float level = mix(0.55, 1.0, on) + aimed * 0.12 + sparkle * 0.25;
            light += texel.rgb * texel.a * inside * level;
            cover = texel.a * inside * 0.92;
          } else {
            // 濃いガラス（明るいワールド向け）では、切のときの絵も少し明るく保つ
            float level = mix(0.5 + 0.6 * uShade, 1.0, on) + aimed * 0.22 + sparkle * 0.3;
            light += mix(vec3(0.84, 0.9, 1.0), mix(vec3(1.0), uTint, 0.2), on) * texel.r * level;
            light += uTint * texel.g * (0.02 + 0.26 * on + 0.3 * sparkle);
            // 明るい背景の前でも線が読めるよう、線のまわりをわずかに暗くする
            cover = max(texel.r * 0.85, texel.g * 0.22);
          }
        }
        gl_FragColor = vec4(light, cover);
        #include <colorspace_fragment>
      }
    `,
  })
}

/** ラベル（文字）。テクスチャの r = 文字, g = 文字のまわりの影 */
export function createLabelMaterial(texture: Texture, state?: GlassState) {
  return new ShaderMaterial({
    ...LAYERED,
    uniforms: {
      ...ink,
      uLabel: { value: texture },
      uState: state?.uState ?? { value: new Vector4(1, 0, 0, 9) },
    },
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
      uniform sampler2D uLabel;
      uniform vec4 uState;
      uniform vec3 uInk;
      varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        vec4 texel = texture2D(uLabel, vUv);
        float level = 0.72 + 0.28 * uState.x + 0.15 * uState.y;
        // 白い文字には、まわりに淡い影を付ける（明るい背景の前でも読めるように）。暗い文字には付けない
        float shadow = texel.g * 0.45 * step(0.5, dot(uInk, vec3(0.2126, 0.7152, 0.0722)));
        gl_FragColor = vec4(uInk * texel.r * level, max(texel.r * 0.9, shadow));
        #include <colorspace_fragment>
      }
    `,
  })
}

/** 押したときに縁から飛び散る光の粒。position = 飛ぶ向き（部品の面の中）, seed = 粒ごとの乱数 */
export function createSparkMaterial(state: GlassState) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
    uniforms: { ...state, uViewportHeight: { value: 1080 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float seed;
      uniform vec4 uState;
      uniform vec2 uHalf;
      uniform float uViewportHeight;
      varying float vLife;
      void main() {
        // きらめきは 1 から 0 へ減っていく。粒はそのあいだに縁から外へ出て、ゆっくり止まる
        float age = 1.0 - uState.z;
        float travel = 1.0 - pow(1.0 - age, 2.4);
        vec2 from = position.xy * uHalf;
        vec3 local = vec3(from * (1.02 + travel * (0.5 + 0.7 * seed)), 0.004 + travel * 0.012 * (seed - 0.3));
        vec4 mv = modelViewMatrix * vec4(local, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        vLife = uState.z * smoothstep(0.0, 0.08, age);
        float pixelsPerMetre = projectionMatrix[1][1] * uViewportHeight * 0.5 / max(-mv.z, 0.05);
        gl_PointSize = clamp((0.004 + 0.004 * seed) * pixelsPerMetre, 1.5, 40.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uTint;
      varying float vLife;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = gl_PointCoord - 0.5;
        float glow = exp(-dot(p, p) * 22.0);
        gl_FragColor = vec4(mix(vec3(1.0), uTint, 0.5) * glow * vLife * 0.9, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
}
