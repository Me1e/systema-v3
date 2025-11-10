'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Edit2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PromptHistoryEntry } from '@/lib/stores/prompt-store'

interface PromptHistoryItemProps {
  entry: PromptHistoryEntry
  isSelected?: boolean
  onSelect: (entry: PromptHistoryEntry) => void
  onRename: (id: string, name: string) => void
}

export function PromptHistoryItem({
  entry,
  isSelected = false,
  onSelect,
  onRename
}: PromptHistoryItemProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(entry.name)

  const handleRename = () => {
    if (newName.trim() && newName !== entry.name) {
      onRename(entry.id, newName.trim())
    }
    setIsRenaming(false)
    setNewName(entry.name)
  }

  const handleCancel = () => {
    setIsRenaming(false)
    setNewName(entry.name)
  }

  const formattedTime = format(new Date(entry.timestamp), 'MM/dd HH:mm', { locale: ko })

  return (
    <div
      className={cn(
        'group relative px-3 py-2 rounded-lg border transition-all cursor-pointer',
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-neutral-200 hover:border-neutral-300 hover:bg-white bg-white/50'
      )}
      onClick={() => !isRenaming && onSelect(entry)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') handleCancel()
                }}
                className="h-6 text-sm bg-white border-neutral-200 text-neutral-700"
                autoFocus
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 hover:bg-neutral-100"
                onClick={handleRename}
              >
                <Check className="h-3 w-3 text-green-600" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 hover:bg-neutral-100"
                onClick={handleCancel}
              >
                <X className="h-3 w-3 text-red-600" />
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">{formattedTime}</span>
                <span className="text-sm font-medium text-neutral-700 truncate">
                  {entry.name}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {entry.linesAdded > 0 && (
                  <span className="text-green-600 font-medium">+{entry.linesAdded}</span>
                )}
                {entry.linesRemoved > 0 && (
                  <span className="text-red-600 font-medium">-{entry.linesRemoved}</span>
                )}
                {entry.linesAdded === 0 && entry.linesRemoved === 0 && (
                  <span className="text-neutral-400">변경 없음</span>
                )}
              </div>
            </div>
          )}
        </div>

        {!isRenaming && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-neutral-100"
            onClick={(e) => {
              e.stopPropagation()
              setIsRenaming(true)
            }}
          >
            <Edit2 className="h-3 w-3 text-neutral-500" />
          </Button>
        )}
      </div>
    </div>
  )
}