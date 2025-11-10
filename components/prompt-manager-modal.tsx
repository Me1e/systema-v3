'use client';

import { useState, useEffect } from 'react';
import { Save, History, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { usePromptStore } from '@/lib/stores/prompt-store';
import { PromptHistoryItem } from './prompt-history-item';
import { PromptDiffModal } from './prompt-diff-modal';
import { cn } from '@/lib/utils';

interface PromptManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromptManagerModal({
  open,
  onOpenChange,
}: PromptManagerModalProps) {
  const {
    currentPrompt,
    history,
    setCurrentPrompt,
    saveToHistory,
    revertToHistory,
    renameHistoryEntry,
    getHistoryEntry,
    clearHistory,
  } = usePromptStore();

  const [localPrompt, setLocalPrompt] = useState(currentPrompt);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalPrompt(currentPrompt);
      setHasChanges(false);
    }
  }, [open, currentPrompt]);

  useEffect(() => {
    setHasChanges(localPrompt !== currentPrompt);
  }, [localPrompt, currentPrompt]);

  const handleSave = () => {
    if (!localPrompt.trim()) return;

    setCurrentPrompt(localPrompt);
    saveToHistory();
    setHasChanges(false);
  };

  const handleSelectHistory = (entry: any) => {
    setSelectedEntry(entry.id);
    setShowDiff(true);
  };

  const handleRevert = () => {
    if (selectedEntry) {
      revertToHistory(selectedEntry);
      const entry = getHistoryEntry(selectedEntry);
      if (entry) {
        setLocalPrompt(entry.content);
        setHasChanges(false);
      }
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (confirm('저장하지 않은 변경사항이 있습니다. 정말 닫으시겠습니까?')) {
        onOpenChange(false);
      }
    } else {
      onOpenChange(false);
    }
  };

  const selectedHistoryEntry = selectedEntry
    ? getHistoryEntry(selectedEntry)
    : null;
  const parentHistoryEntry = selectedHistoryEntry?.parentId
    ? getHistoryEntry(selectedHistoryEntry.parentId)
    : null;

  const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-6xl h-[85vh] p-0 bg-white border-neutral-200">
          <div className="flex h-full overflow-hidden">
            {/* Left Panel - History */}
            <div className="w-[30%] border-r border-neutral-200 flex flex-col bg-neutral-50">
              <div className="p-4 border-b border-neutral-200 bg-white">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-neutral-700">
                  <History className="h-4 w-4 text-neutral-600" />
                  히스토리
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  총 {history.length}개의 버전
                </p>
              </div>

              <ScrollArea className="flex-1 p-2">
                {sortedHistory.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400 text-sm">
                    저장된 히스토리가 없습니다
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedHistory.map((entry) => (
                      <PromptHistoryItem
                        key={entry.id}
                        entry={entry}
                        isSelected={selectedEntry === entry.id}
                        onSelect={handleSelectHistory}
                        onRename={renameHistoryEntry}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>

              {history.length > 0 && (
                <div className="p-2 border-t border-neutral-200 bg-white">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={clearHistory}
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    히스토리 전체 삭제
                  </Button>
                </div>
              )}
            </div>

            {/* Right Panel - Editor */}
            <div className="flex-1 flex flex-col bg-white">
              <DialogHeader className="p-4 border-b border-neutral-200">
                <DialogTitle className="text-neutral-800">
                  프롬프트 편집기
                </DialogTitle>
                <DialogDescription className="text-neutral-600">
                  프롬프트를 편집하고 버전을 관리하세요
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 p-4">
                <Textarea
                  value={localPrompt}
                  onChange={(e) => setLocalPrompt(e.target.value)}
                  placeholder="프롬프트를 입력하세요..."
                  className={cn(
                    'h-full resize-none bg-neutral-50 border-neutral-200 text-neutral-800',
                    'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                    'font-mono text-sm placeholder:text-neutral-400'
                  )}
                />
              </div>

              <Separator className="bg-neutral-200" />

              <div className="p-4 flex justify-between items-center border-t border-neutral-200">
                <div className="text-sm text-neutral-600">
                  {hasChanges && (
                    <span className="text-amber-600 font-medium">
                      • 저장되지 않은 변경사항
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    className="border-neutral-200 hover:bg-neutral-100 text-neutral-700"
                  >
                    닫기
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!localPrompt.trim() || !hasChanges}
                    variant="default"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    저장하기
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diff Modal */}
      <PromptDiffModal
        open={showDiff}
        onOpenChange={setShowDiff}
        entry={selectedHistoryEntry}
        parentEntry={parentHistoryEntry}
        onRevert={handleRevert}
      />
    </>
  );
}
