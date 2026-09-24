/**
 * Gemeinsame Tailwind-Klassenbausteine für ein konsistentes UI.
 * Zentrale Stelle für Button-Varianten, schwebende Inseln und Eingabefelder,
 * damit die einzelnen Bedien-Inseln nicht jeweils eigene Ad-hoc-Klassen pflegen.
 * Farben kommen aus den Design-Tokens in index.css (@theme).
 */

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors select-none ' +
  'disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1'

const sizes = {
  sm: 'text-xs px-2.5 py-1.5',
  md: 'text-sm px-3.5 py-2',
  icon: 'text-xs w-7 h-7 p-0',
} as const

const variants = {
  primary: 'bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent/50 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400 shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400 shadow-sm',
  dark: 'bg-ink text-white hover:bg-ink2 focus-visible:ring-gray-400 shadow-sm',
  outline: 'bg-white text-ink2 border border-line hover:bg-chip focus-visible:ring-gray-300',
  secondary: 'bg-chip text-ink hover:bg-chip-hover focus-visible:ring-gray-300',
  ghost: 'bg-transparent text-ink2 hover:bg-chip focus-visible:ring-gray-300',
  dangerOutline: 'bg-white text-red-700 border border-red-200 hover:bg-red-50 focus-visible:ring-red-300',
  primaryOutline: 'bg-white text-accent border border-accent/30 hover:bg-accent-soft focus-visible:ring-accent/40',
} as const

export type ButtonVariant = keyof typeof variants
export type ButtonSize = keyof typeof sizes

/** Baut eine Button-Klassenliste aus Variante + Größe, optional erweiterbar. */
export function btn(variant: ButtonVariant = 'outline', size: ButtonSize = 'sm', extra = ''): string {
  return [base, sizes[size], variants[variant], extra].filter(Boolean).join(' ')
}

/** Schwebende, halbtransparente Bedien-Insel über dem Hallenplan. */
export const island =
  'bg-white/95 backdrop-blur-md border border-line rounded-2xl shadow-[0_10px_30px_-12px_rgba(20,30,35,0.28)]'

/**
 * Touch-taugliche Insel-Schaltfläche (mind. 40px hoch, für Tablet-Bedienung bei der Hallenbegehung).
 * `tone`: 'chip' (grauer Grund), 'plain' (transparent), 'dark' (aktiv/primär), 'accent'.
 */
export function islandBtn(tone: 'chip' | 'plain' | 'dark' | 'accent' = 'plain', extra = ''): string {
  const tones = {
    chip: 'bg-chip text-ink hover:bg-chip-hover',
    plain: 'bg-transparent text-ink hover:bg-chip',
    dark: 'bg-ink text-white hover:bg-ink2',
    accent: 'bg-accent text-white hover:bg-accent-hover',
  }
  return [
    'h-10 min-w-10 px-3 rounded-xl inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold',
    'transition-colors select-none disabled:opacity-35 disabled:cursor-not-allowed',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
    tones[tone],
    extra,
  ].join(' ')
}

/** Tastenkürzel-Kappe. */
export const kbd =
  'inline-flex items-center font-mono text-[10.5px] leading-none border border-line border-b-2 rounded px-1 py-0.5 text-ink3 bg-white'

/** Klassen für ein umrandetes Panel. */
export const panel = 'bg-white flex flex-col'
export const panelHeader = 'p-3 border-b border-line'
export const panelTitle = 'text-sm font-bold text-ink'
export const panelSubtitle = 'text-xs text-ink3 mt-0.5'
export const sectionLabel = 'text-[10.5px] font-semibold text-ink3 uppercase tracking-[0.1em]'

/** Standard-Textinput. */
export const input =
  'border border-line bg-white rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50'

/** Dünner vertikaler Trenner zwischen Insel-Gruppen. */
export const dividerV = 'w-px self-stretch bg-line mx-1'

/** Dropdown/Popover-Panel. */
export const popoverPanel = `absolute z-30 mt-2 ${island} p-3`

/** Segmented-Control-Container. */
export const segmentedGroup = 'inline-flex rounded-lg bg-chip p-0.5 gap-0.5'
export function segmentedItem(active: boolean, extra = ''): string {
  return [
    'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
    active ? 'bg-ink text-white shadow-sm' : 'text-ink2 hover:bg-white',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}
