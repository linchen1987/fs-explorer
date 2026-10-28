import { create } from "zustand"

interface CompareSelection {
  base: string | null
  head: string | null
}

interface CompareState {
  /** 每个仓库记住的分支选择（repoPath -> { base, head }） */
  selections: Record<string, CompareSelection>
  setSelection: (repo: string, base: string | null, head: string | null) => void
}

export const useCompareStore = create<CompareState>((set) => ({
  selections: {},
  setSelection: (repo, base, head) =>
    set((s) => ({ selections: { ...s.selections, [repo]: { base, head } } })),
}))
