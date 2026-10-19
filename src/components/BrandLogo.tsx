/** WHU-Event-Logo (Dateien in public/brand/). `variant`: schwarz für helle, weiß für dunkle Flächen; `icon` = nur der Drehregler. */
interface Props {
  variant?: 'black' | 'white' | 'icon'
  className?: string
}

export default function BrandLogo({ variant = 'black', className = 'h-8' }: Props) {
  const src = variant === 'icon' ? '/brand/whu-event-icon.svg' : `/brand/whu-event-logo-${variant}.svg`
  return <img src={src} alt="WHU Event – Information & Event Technology" className={`${className} w-auto select-none`} draggable={false} />
}
