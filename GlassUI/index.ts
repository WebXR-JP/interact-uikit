/**
 * ガラスの UI 部品。空間に浮かべて、XRift のインタラクトで押す（スライダーは XRift の Grabbable で掴んで動かす）。
 * このフォルダーだけで完結していて（画像や音源のファイルは使わない）、ほかのワールドへそのまま持っていける。
 * 使い方は同じフォルダーの README.md に。
 */
export { GlassButton, type GlassButtonProps, GLASS_ORDER } from './GlassButton'
export { GlassSwitch, type GlassSwitchProps } from './GlassSwitch'
export { GlassSlider, type GlassSliderProps, sliderValueAt } from './GlassSlider'
export { GlassPlate, type GlassPlateProps } from './GlassPlate'
export { ICONS, type IconName, type IconPainter, type LabelText } from './icons'
export { setGlassEnvironment, type GlassEnvironment } from './material'
export { glassSound, playTone, type ToneName } from './sound'
