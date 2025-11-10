'use client'

import { useMemo } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PromptHistoryEntry } from '@/lib/stores/prompt-store'
import { GitBranch } from 'lucide-react'

interface PromptDiffModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: PromptHistoryEntry | null
  parentEntry: PromptHistoryEntry | null
  onRevert: () => void
}

export function PromptDiffModal({
  open,
  onOpenChange,
  entry,
  parentEntry,
  onRevert
}: PromptDiffModalProps) {
  const diffViewerStyles = useMemo(() => ({
    variables: {
      light: {
        diffViewerBackground: '#ffffff',
        diffViewerColor: '#171717',
        addedBackground: '#dcfce7',
        addedColor: '#166534',
        removedBackground: '#fee2e2',
        removedColor: '#991b1b',
        wordAddedBackground: '#bbf7d0',
        wordRemovedBackground: '#fecaca',
        addedGutterBackground: '#dcfce7',
        removedGutterBackground: '#fee2e2',
        gutterBackground: '#f5f5f5',
        gutterBackgroundDark: '#f5f5f5',
        highlightBackground: '#f3f4f6',
        highlightGutterBackground: '#f3f4f6',
        codeFoldGutterBackground: '#f5f5f5',
        codeFoldBackground: '#fafafa',
        emptyLineBackground: '#fafafa',
        gutterColor: '#737373',
        addedGutterColor: '#166534',
        removedGutterColor: '#991b1b',
        codeFoldContentColor: '#171717',
        diffViewerTitleBackground: '#f9fafb',
        diffViewerTitleColor: '#171717',
        diffViewerTitleBorderColor: '#e5e7eb',
      }
    },
    line: {
      padding: '4px 8px',
      fontSize: '14px',
      fontFamily: 'ui-monospace, monospace'
    },
    gutter: {
      minWidth: 50,
      padding: '0 10px',
      backgroundColor: '#f9fafb'
    }
  }), [])

  if (!entry) return null

  const oldContent = parentEntry?.content || ''
  const newContent = entry.content

  const formatTimestamp = (timestamp: number) => {
    return format(new Date(timestamp), 'yyyy년 MM월 dd일 HH:mm', { locale: ko })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] bg-white border-neutral-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-neutral-800">
            <GitBranch className="h-4 w-4 text-neutral-600" />
            버전 비교
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <div className="text-neutral-600">
              {parentEntry ? (
                <>
                  <span className="text-red-600 font-medium">{parentEntry.name}</span>
                  <span className="mx-2 text-neutral-400">→</span>
                  <span className="text-green-600 font-medium">{entry.name}</span>
                </>
              ) : (
                <>초기 버전: <span className="text-green-600 font-medium">{entry.name}</span></>
              )}
            </div>
            <div className="text-xs text-neutral-500">
              {formatTimestamp(entry.timestamp)}
            </div>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 border-y border-neutral-200">
          <div className="min-h-full bg-neutral-50 rounded-lg p-2">
            <ReactDiffViewer
              oldValue={oldContent}
              newValue={newContent}
              splitView={false}
              useDarkTheme={false}
              styles={diffViewerStyles}
              leftTitle={parentEntry?.name || '이전 버전 없음'}
              rightTitle={entry.name}
              compareMethod="diffLines"
            />
          </div>
        </ScrollArea>

        <DialogFooter>
          <div className="flex justify-between items-center w-full">
            <div className="text-sm text-neutral-600">
              <span className="text-green-600 font-medium">+{entry.linesAdded}</span>
              <span className="text-neutral-400"> / </span>
              <span className="text-red-600 font-medium">-{entry.linesRemoved}</span>
              <span className="text-neutral-500"> 라인 변경</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-neutral-200 hover:bg-neutral-100 text-neutral-700"
              >
                닫기
              </Button>
              <Button
                onClick={() => {
                  onRevert()
                  onOpenChange(false)
                }}
                variant="default"
              >
                이 버전으로 돌아가기
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}