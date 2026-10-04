import { useState } from 'react'
import { btn } from '../utils/ui'

interface ExportImportDialogProps {
  isOpen: boolean
  duplicateCount: number
  duplicateProjects: { projectId: string; name: string }[]
  onMergeStrategy: (strategy: 'overwrite' | 'keepBoth' | 'cancel') => void
}

export default function ExportImportDialog({
  isOpen,
  duplicateCount,
  duplicateProjects,
  onMergeStrategy,
}: ExportImportDialogProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<'overwrite' | 'keepBoth'>('keepBoth')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Duplicate Projects Found</h2>
        <p className="text-sm text-gray-600 mb-4">
          {duplicateCount} of the imported projects already exist:
        </p>

        <ul className="bg-gray-50 rounded p-3 mb-6 text-sm space-y-1 max-h-48 overflow-y-auto">
          {duplicateProjects.map((p) => (
            <li key={p.projectId} className="text-gray-700">
              • {p.name}
            </li>
          ))}
        </ul>

        <fieldset className="mb-6 space-y-3">
          <legend className="text-sm font-medium text-gray-700 mb-2">What should we do?</legend>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="strategy"
              value="keepBoth"
              checked={selectedStrategy === 'keepBoth'}
              onChange={(e) => setSelectedStrategy(e.target.value as 'keepBoth')}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">
              Keep both (imported projects will have <code className="bg-gray-100 px-1 rounded text-xs">_imported</code>{' '}
              suffix)
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="strategy"
              value="overwrite"
              checked={selectedStrategy === 'overwrite'}
              onChange={(e) => setSelectedStrategy(e.target.value as 'overwrite')}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">Overwrite existing projects</span>
          </label>
        </fieldset>

        <div className="flex gap-3">
          <button
            onClick={() => onMergeStrategy('cancel')}
            className={btn('outline', 'md')}
          >
            Cancel
          </button>
          <button
            onClick={() => onMergeStrategy(selectedStrategy)}
            className={btn('primary', 'md')}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
