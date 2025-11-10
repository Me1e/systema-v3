import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { diffLines } from 'diff';

export interface PromptHistoryEntry {
  id: string;
  content: string;
  timestamp: number;
  name: string;
  parentId: string | null;
  linesAdded: number;
  linesRemoved: number;
}

interface PromptStore {
  currentPrompt: string;
  history: PromptHistoryEntry[];

  // Actions
  setCurrentPrompt: (prompt: string) => void;
  saveToHistory: (name?: string) => void;
  revertToHistory: (historyId: string) => void;
  renameHistoryEntry: (historyId: string, newName: string) => void;
  getHistoryEntry: (historyId: string) => PromptHistoryEntry | undefined;
  getDiffWithParent: (
    historyId: string
  ) => { oldContent: string; newContent: string } | null;
  clearHistory: () => void;
}

export const usePromptStore = create<PromptStore>()(
  persist(
    (set, get) => ({
      currentPrompt: '',
      history: [],

      setCurrentPrompt: (prompt: string) => {
        set({ currentPrompt: prompt });
      },

      saveToHistory: (name?: string) => {
        const state = get();
        const timestamp = Date.now();
        const id = `prompt-${timestamp}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        // Get the most recent history entry as parent
        const parentEntry =
          state.history.length > 0
            ? state.history[state.history.length - 1]
            : null;

        // Calculate diff stats
        let linesAdded = 0;
        let linesRemoved = 0;

        if (parentEntry) {
          const changes = diffLines(parentEntry.content, state.currentPrompt);
          changes.forEach((change) => {
            if (change.added) {
              linesAdded += change.count || 0;
            } else if (change.removed) {
              linesRemoved += change.count || 0;
            }
          });
        } else {
          // First entry - count all lines as added
          linesAdded = state.currentPrompt.split('\n').length;
        }

        const newEntry: PromptHistoryEntry = {
          id,
          content: state.currentPrompt,
          timestamp,
          name: name || `Version ${state.history.length + 1}`,
          parentId: parentEntry?.id || null,
          linesAdded,
          linesRemoved,
        };

        set({
          history: [...state.history, newEntry],
        });
      },

      revertToHistory: (historyId: string) => {
        const state = get();
        const entry = state.history.find((h) => h.id === historyId);

        if (entry) {
          // Set current prompt to the historical version
          set({ currentPrompt: entry.content });

          // Create a new history entry for this revert action
          const timestamp = Date.now();
          const newId = `prompt-${timestamp}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          // Get the most recent history entry for parent reference
          const parentEntry = state.history[state.history.length - 1];

          // Calculate diff stats from the most recent entry
          let linesAdded = 0;
          let linesRemoved = 0;

          if (parentEntry) {
            const changes = diffLines(parentEntry.content, entry.content);
            changes.forEach((change) => {
              if (change.added) {
                linesAdded += change.count || 0;
              } else if (change.removed) {
                linesRemoved += change.count || 0;
              }
            });
          }

          const revertEntry: PromptHistoryEntry = {
            id: newId,
            content: entry.content,
            timestamp,
            name: `Reverted to "${entry.name}"`,
            parentId: parentEntry?.id || null,
            linesAdded,
            linesRemoved,
          };

          set({
            history: [...state.history, revertEntry],
          });
        }
      },

      renameHistoryEntry: (historyId: string, newName: string) => {
        const state = get();
        const updatedHistory = state.history.map((entry) =>
          entry.id === historyId ? { ...entry, name: newName } : entry
        );
        set({ history: updatedHistory });
      },

      getHistoryEntry: (historyId: string) => {
        const state = get();
        return state.history.find((h) => h.id === historyId);
      },

      getDiffWithParent: (historyId: string) => {
        const state = get();
        const entry = state.history.find((h) => h.id === historyId);

        if (!entry) return null;

        let parentContent = '';
        if (entry.parentId) {
          const parentEntry = state.history.find(
            (h) => h.id === entry.parentId
          );
          if (parentEntry) {
            parentContent = parentEntry.content;
          }
        }

        return {
          oldContent: parentContent,
          newContent: entry.content,
        };
      },

      clearHistory: () => {
        if (
          confirm(
            'Are you sure you want to clear all prompt history? This cannot be undone.'
          )
        ) {
          set({ history: [], currentPrompt: '' });
        }
      },
    }),
    {
      name: 'prompt-history-storage',
      partialize: (state) => ({
        currentPrompt: state.currentPrompt,
        history: state.history,
      }),
    }
  )
);
