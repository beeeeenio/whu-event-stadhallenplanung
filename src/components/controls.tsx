/** Gemeinsame Bedienelemente für schwebende Panels (3D-Ansicht, Ebenen-Menü). */

/** Beschriftete Gruppe in einem Bedienpanel. */
export function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink3">{label}</div>
      {children}
    </div>
  )
}

/** Auswahl genau einer Möglichkeit: die gewählte ist weiß hinterlegt und fett. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string; title?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 p-0.5 rounded-lg bg-black/[0.07]">
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={`flex-1 h-8 rounded-md text-[12px] transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              active ? 'bg-white text-ink font-semibold shadow-sm' : 'text-ink2 hover:text-ink font-medium'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Ein-/Ausschalter mit sichtbarem Zustand (Schalter links Aus, rechts An). */
export function SwitchRow({
  label,
  checked,
  onChange,
  disabled,
  title,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between h-8 px-1 rounded-md text-[12px] font-medium text-ink select-none hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <span>{label}</span>
      <span className={`relative w-8 h-[18px] rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-black/25'}`}>
        <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[14px]' : ''}`} />
      </span>
    </button>
  )
}
