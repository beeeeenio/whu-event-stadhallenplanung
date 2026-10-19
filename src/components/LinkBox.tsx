import { useState } from 'react'
import { btn } from '../utils/ui'

const field =
  'border border-line bg-white rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Link zum Kopieren, mit Hinweis zum Versand. */
export default function LinkBox({ link, info }: { link: string; info: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-2 rounded-lg border border-line bg-ground p-2.5">
      <div className="flex gap-2">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={`${field} flex-1 min-w-0 text-xs`} aria-label="Link" />
        <button
          type="button"
          onClick={async () => {
            setCopied(await copyText(link))
            setTimeout(() => setCopied(false), 2000)
          }}
          className={btn('primary', 'sm')}
        >
          {copied ? 'Kopiert' : 'Link kopieren'}
        </button>
      </div>
      <p className="text-[11px] text-ink3 mt-1.5">{info}</p>
    </div>
  )
}
