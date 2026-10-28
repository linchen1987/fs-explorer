import { describe, expect, it } from "vitest"
import { layoutCommitGraph } from "./commit-graph"
import type { HistoryCommit } from "./types"

function commit(sha: string, parentShas: string[] = []): HistoryCommit {
  return {
    sha,
    shortSha: sha,
    authorName: "Test",
    authorEmail: "test@example.com",
    timestamp: 0,
    subject: sha,
    parentShas,
    refs: [],
  }
}

describe("layoutCommitGraph", () => {
  it("线性历史始终使用同一 lane，并连接相邻行", () => {
    const layout = layoutCommitGraph([
      commit("c3", ["c2"]),
      commit("c2", ["c1"]),
      commit("c1"),
    ])

    expect(layout.laneCount).toBe(1)
    expect(layout.rows.map((row) => row.nodeLane)).toEqual([0, 0, 0])
    expect(layout.rows.map((row) => row.parentLanes)).toEqual([[0], [0], []])
    expect(layout.rows[0].segments).toEqual([
      { kind: "outgoing", fromLane: 0, fromY: 0.5, toLane: 0, toY: 1 },
    ])
    expect(layout.rows[1].segments).toEqual([
      { kind: "incoming", fromLane: 0, fromY: 0, toLane: 0, toY: 0.5 },
      { kind: "outgoing", fromLane: 0, fromY: 0.5, toLane: 0, toY: 1 },
    ])
    expect(layout.rows[2].segments).toEqual([
      { kind: "incoming", fromLane: 0, fromY: 0, toLane: 0, toY: 0.5 },
    ])
  })

  it("merge 连接所有 parent，贯穿其他分支并汇合已预留的 parent lane", () => {
    //       M
    //      / \
    //     A   B
    //      \ /
    //       C
    const layout = layoutCommitGraph([
      commit("M", ["A", "B"]),
      commit("A", ["C"]),
      commit("B", ["C"]),
      commit("C"),
    ])

    expect(layout.laneCount).toBe(2)
    expect(layout.rows.map((row) => row.nodeLane)).toEqual([0, 0, 1, 0])
    expect(layout.rows.map((row) => row.parentLanes)).toEqual([[0, 1], [0], [0], []])

    expect(layout.rows[0].segments).toEqual([
      { kind: "outgoing", fromLane: 0, fromY: 0.5, toLane: 0, toY: 1 },
      { kind: "outgoing", fromLane: 0, fromY: 0.5, toLane: 1, toY: 1 },
    ])
    expect(layout.rows[1].segments).toContainEqual({
      kind: "passThrough",
      fromLane: 1,
      fromY: 0,
      toLane: 1,
      toY: 1,
    })
    // C 已由 A 预留在 lane 0，B 直接汇到该 lane，不能再创建一条 C lane。
    expect(layout.rows[2].segments).toContainEqual({
      kind: "outgoing",
      fromLane: 1,
      fromY: 0.5,
      toLane: 0,
      toY: 1,
    })
    expect(layout.rows[3].segments).toEqual([
      { kind: "incoming", fromLane: 0, fromY: 0, toLane: 0, toY: 0.5 },
    ])
  })

  it("根提交正确终止，空历史没有 lane", () => {
    const layout = layoutCommitGraph([commit("root")])

    expect(layout).toEqual({
      laneCount: 1,
      rows: [{ sha: "root", nodeLane: 0, parentLanes: [], segments: [] }],
    })
    expect(layoutCommitGraph([])).toEqual({ rows: [], laneCount: 0 })
  })

  it("独立 head 插入时没有入边，并保持已有分支贯穿", () => {
    const layout = layoutCommitGraph([
      commit("A", ["B"]),
      commit("X", ["Y"]),
      commit("B"),
      commit("Y"),
    ])

    expect(layout.laneCount).toBe(2)
    expect(layout.rows.map((row) => row.nodeLane)).toEqual([0, 1, 0, 1])
    expect(layout.rows.map((row) => row.parentLanes)).toEqual([[0], [1], [], []])
    expect(layout.rows[1].segments).toEqual([
      { kind: "passThrough", fromLane: 0, fromY: 0, toLane: 0, toY: 1 },
      { kind: "outgoing", fromLane: 1, fromY: 0.5, toLane: 1, toY: 1 },
    ])
  })

  it("新 head 指向已有 parent 时复用 lane，避免重复 sha lane", () => {
    const layout = layoutCommitGraph([
      commit("A", ["B"]),
      commit("X", ["B"]),
      commit("B"),
    ])

    expect(layout.rows[1]).toMatchObject({ sha: "X", nodeLane: 1, parentLanes: [0] })
    expect(layout.rows[1].segments).toContainEqual({
      kind: "outgoing",
      fromLane: 1,
      fromY: 0.5,
      toLane: 0,
      toY: 1,
    })
    expect(layout.rows[2]).toMatchObject({ sha: "B", nodeLane: 0, parentLanes: [] })
  })

  it("每个分页切片都可独立重新布局，包括 parent 尚未加载的边界", () => {
    const commits = [
      commit("M", ["A", "B"]),
      commit("A", ["C"]),
      commit("B", ["C"]),
      commit("C"),
    ]

    for (const pageSize of [1, 2, 3]) {
      for (let start = 0; start < commits.length; start += pageSize) {
        const page = commits.slice(start, start + pageSize)
        const layout = layoutCommitGraph(page)

        expect(layout.rows.map((row) => row.sha)).toEqual(page.map((item) => item.sha))
        expect(layout.rows).toHaveLength(page.length)
        for (const [index, row] of layout.rows.entries()) {
          expect(Number.isInteger(row.nodeLane)).toBe(true)
          expect(row.nodeLane).toBeGreaterThanOrEqual(0)
          expect(row.nodeLane).toBeLessThan(layout.laneCount)
          expect(row.parentLanes).toHaveLength(page[index].parentShas.length)
          for (const parentLane of row.parentLanes) {
            expect(Number.isInteger(parentLane)).toBe(true)
            expect(parentLane).toBeGreaterThanOrEqual(0)
            expect(parentLane).toBeLessThan(layout.laneCount)
          }
          for (const segment of row.segments) {
            expect(segment.fromLane).toBeGreaterThanOrEqual(0)
            expect(segment.toLane).toBeGreaterThanOrEqual(0)
            expect(segment.fromLane).toBeLessThan(layout.laneCount)
            expect(segment.toLane).toBeLessThan(layout.laneCount)
            expect([0, 0.5, 1]).toContain(segment.fromY)
            expect([0, 0.5, 1]).toContain(segment.toY)
          }
        }
      }
    }

    // 第二页从 B 重新开始；它没有上一页状态，因此只向页底的 C 画出边。
    const secondPage = layoutCommitGraph(commits.slice(2, 4))
    expect(secondPage.rows[0].sha).toBe("B")
    expect(secondPage.rows[0].segments).toEqual([
      { kind: "outgoing", fromLane: 0, fromY: 0.5, toLane: 0, toY: 1 },
    ])
  })
})
