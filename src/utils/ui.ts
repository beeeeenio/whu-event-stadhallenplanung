/**
 * Gemeinsame Tailwind-Klassenbausteine für ein konsistentes UI.
 * Zentrale Stelle für Button-Varianten, Panel-Rahmen und Eingabefelder,
 * damit Toolbar, Sidebar, Panels etc. nicht jeweils eigene Ad-hoc-Klassen pflegen.
 */

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors ' +
  'disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1'

const sizes = {
  sm: 'text-xs px-2.5 py-1.5',
  md: 'text-sm px-3.5 py-2',
  icon: 'text-xs w-7 h-7 p-0',
} as const

const variants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-400 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400 shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400 shadow-sm',
  dark: 'bg-gray-900 text-white hover:bg-gray-700 focus-visible:ring-gray-400 shadow-sm',
  outline: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus-visible:ring-gray-300',
  secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus-visible:ring-gray-300',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 focus-visible:ring-gray-300',
  dangerOutline: 'bg-white text-red-600 border border-red-200 hover:bg-red-50 focus-visible:ring-red-300',
  primaryOutline: 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 focus-visible:ring-blue-300',
} as const

export type ButtonVariant = keyof typeof variants
export type ButtonSize = keyof typeof sizes

/** Baut eine Button-Klassenliste aus Variante + Größe, optional erweiterbar. */
export function btn(variant: ButtonVariant = 'outline', size: ButtonSize = 'sm', extra = ''): string {
  return [base, sizes[size], variants[variant], extra].filter(Boolean).join(' ')
}

/** Klassen für ein umrandetes Panel (Sidebar/Inventory/Phasen-Spalten). */
export const panel = 'bg-white flex flex-col'
export const panelHeader = 'p-3 border-b border-gray-200'
export const panelTitle = 'text-sm font-semibold text-gray-800'
export const panelSubtitle = 'text-xs text-gray-400 mt-0.5'
export const sectionLabel = 'text-xs font-semibold text-gray-500 uppercase tracking-wide'

/** Standard-Textinput. */
export const input =
  'border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300'

/** Dünner vertikaler Trenner zwischen Toolbar-Gruppen. */
export const dividerV = 'w-px self-stretch bg-gray-200 mx-1'

/** Dropdown/Popover-Panel (z. B. Toolbar-Menüs). */
export const popoverPanel =
  'absolute z-20 mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-3'

/** Collapse-Toggle-Button am Rand eines einklappbaren Panels. */
export const collapseToggle =
  'flex items-center justify-center w-full h-8 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0'

/** Segmented-Control-Container (z. B. Werkzeugauswahl im Canvas). */
export const segmentedGroup = 'inline-flex rounded-md border border-gray-200 overflow-hidden shadow-sm'
export function segmentedItem(active: boolean, extra = ''): string {
  return [
    'px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-200 last:border-r-0',
    active ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}
