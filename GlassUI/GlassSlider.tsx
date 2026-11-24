import { type ThreeElements, useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Color,
  type ColorRepresentation,
  PlaneGeometry,
  ShaderMaterial,
} from "three";
import { GLASS_ORDER, GlassButton } from "./GlassButton";
import { createCapGeometry, SHAPES } from "./geometry";
import { createLabelTexture, labelKey, type LabelText } from "./icons";
import {
  createGlassMaterials,
  createGlassState,
  createLabelMaterial,
} from "./material";

export interface GlassSliderProps extends Omit<
  ThreeElements["group"],
  "id" | "onChange"
> {
  /** XRift のインタラクトの id のもと。両端のボタンは `${id}-minus` と `${id}-plus`（ワールドの中で重ならない名前にする） */
  id: string;
  /** いまの値（0〜1） */
  value: number;
  /** − ＋ を押して値が変わったとき */
  onChange: (value: number) => void;
  /** 溝の長さ（m） */
  length?: number;
  /** 溝の高さ（m）。− ＋ のボタンはその 1.75 倍 */
  size?: number;
  label?: LabelText;
  /** 下に出すラベルの横幅（m） */
  labelWidth?: number;
  /** 溝にたまる光の色（値のところまで光る） */
  tint?: ColorRepresentation;
  /** − ＋ で動く量 */
  step?: number;
  /** − ＋ を狙ったときに XRift が出す説明 */
  hints?: { minus?: string; plus?: string };
  enabled?: boolean;
  sound?: boolean;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** 溝の中の光（左の端から値のところまでの、丸い端の帯）。溝のガラスの裏と表のあいだに描く */
function createFillMaterial(tint: Color, length: number, height: number) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTint: { value: tint },
      uValue: { value: 0 },
      uSize: { value: [length, height] },
      uGlow: { value: 0 },
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
        // 丸い端の帯（左の端から値のところまで）と、そのまわりのにじみ。値が 0 のときは何も光らない
        vec2 q = vec2(p.x - clamp(p.x, x0, x1), p.y);
        float d = length(q) - r * step(0.001, uValue);
        float aa = max(fwidth(d), 1e-4);
        float body = 1.0 - smoothstep(-aa, aa, d);
        float halo = exp(-max(d, 0.0) / (r * 0.9)) * (0.25 + 0.3 * uGlow) * step(0.001, uValue);
        // 帯の中は、先ほど明るい
        float lift = 0.75 + 0.25 * smoothstep(x0, x1 + 1e-4, p.x);
        vec3 col = uTint * (body * lift * (0.85 + 0.35 * uGlow) + halo);
        gl_FragColor = vec4(col, max(body * 0.82, halo * 0.7));
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * ガラスのスライダー: 細い溝の両端に − ＋ のボタン。押すと step ずつ値が動き、溝が値のところまで光る（つまみはない）。
 * 押すしくみは、両端のボタン（GlassButton）の XRift の Interactable。
 * 値は使う側で持つ（自分だけの音量なら useState、全員で共有したければ useInstanceState に）。
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
  tint = "#ffc46b",
  step = 0.1,
  hints,
  enabled = true,
  sound = true,
  ...group
}: GlassSliderProps) => {
  const track = useMemo(
    () => ({ ...SHAPES.track(size), width: length }),
    [size, length],
  );
  // ラベルと色は、渡された物そのものではなく中身で比べる（その場に書いた { ja, en, zh } や色でも、同じなら作り直さない）
  const labelId = labelKey(label);
  const tintId = new Color(tint).getHexString();
  const parts = useMemo(() => {
    const trackState = createGlassState(
      new Color("#ffffff"),
      track.width / 2,
      track.height / 2,
    );
    trackState.uGloss.value = 0.5;
    const caption = label ? createLabelTexture(label) : null;
    return {
      trackGeometry: createCapGeometry(track),
      trackGlass: createGlassMaterials(trackState),
      fillPlane: new PlaneGeometry(track.width * 0.94, track.height * 0.62),
      fill: createFillMaterial(
        new Color(tint),
        track.width * 0.94,
        track.height * 0.62,
      ),
      caption: caption && {
        texture: caption.texture,
        material: createLabelMaterial(caption.texture),
        plane: new PlaneGeometry(labelWidth, labelWidth / caption.aspect),
        y: -(size * 0.9 + 0.01 + labelWidth / caption.aspect / 2),
      },
    };
    // label と tint は、中身を表す labelId と tintId で比べる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, size, tintId, labelId, labelWidth]);

  useEffect(
    () => () => {
      parts.trackGeometry.dispose();
      parts.trackGlass.front.dispose();
      parts.trackGlass.back.dispose();
      parts.fillPlane.dispose();
      parts.fill.dispose();
      parts.caption?.texture.dispose();
      parts.caption?.material.dispose();
      parts.caption?.plane.dispose();
    },
    [parts],
  );

  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const shown = useRef(clamp01(value));
  /** 値が変わった直後に、溝の光を少し強める */
  const flash = useRef(0);
  const last = useRef(value);

  useFrame((_, delta) => {
    const target = clamp01(latest.current.value);
    if (target !== last.current) {
      last.current = target;
      flash.current = 1;
    }
    shown.current += (target - shown.current) * (1 - Math.exp(-delta / 0.06));
    flash.current = Math.max(0, flash.current - delta / 0.5);
    parts.fill.uniforms.uValue.value = shown.current;
    parts.fill.uniforms.uGlow.value = flash.current;
  });

  const nudge = useCallback(
    (direction: number) => () =>
      latest.current.onChange(
        clamp01(
          Math.round((latest.current.value + direction * step) / step) * step,
        ),
      ),
    [step],
  );

  return (
    <group {...group}>
      <mesh
        geometry={parts.trackGeometry}
        material={parts.trackGlass.back}
        renderOrder={GLASS_ORDER}
      />
      <mesh
        geometry={parts.fillPlane}
        material={parts.fill}
        position-z={track.edge / 2}
        renderOrder={GLASS_ORDER + 1}
      />
      <mesh
        geometry={parts.trackGeometry}
        material={parts.trackGlass.front}
        renderOrder={GLASS_ORDER + 2}
      />
      <GlassButton
        id={`${id}-minus`}
        position={[-(length / 2 + size * 1.55), 0, 0.004]}
        size={size * 1.75}
        icon="minus"
        onPress={nudge(-1)}
        hint={hints?.minus}
        enabled={enabled}
        sound={sound}
      />
      <GlassButton
        id={`${id}-plus`}
        position={[length / 2 + size * 1.55, 0, 0.004]}
        size={size * 1.75}
        icon="plus"
        onPress={nudge(1)}
        hint={hints?.plus}
        enabled={enabled}
        sound={sound}
      />
      {parts.caption && (
        <mesh
          geometry={parts.caption.plane}
          material={parts.caption.material}
          position={[0, parts.caption.y, 0]}
          renderOrder={GLASS_ORDER + 1}
        />
      )}
    </group>
  );
};
