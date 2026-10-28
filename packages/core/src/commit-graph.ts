import type { HistoryCommit } from "./types"

/** 行内纵坐标：行顶、节点中心、行底。UI 乘以行高即可得到 SVG 坐标。 */
export type CommitGraphY = 0 | 0.5 | 1

export type CommitGraphSegmentKind = "incoming" | "passThrough" | "outgoing"

/**
 * 一条可直接渲染的线段。
 *
 * 所有 lane 都是列下标；fromY/toY 是当前行内的归一化纵坐标。
 * UI 可自行根据 fromLane 或 toLane 选择颜色，并决定使用直线还是曲线。
 */
export interface CommitGraphSegment {
  kind: CommitGraphSegmentKind
  fromLane: number
  fromY: CommitGraphY
  toLane: number
  toY: CommitGraphY
}

export interface CommitGraphRow {
  sha: string
  nodeLane: number
  /** 与输入提交的 parentShas 一一对应；分页末尾尚未加载的 parent 也会分配 lane。 */
  parentLanes: number[]
  /** 本行需要绘制的全部线段，绘制顺序为从上一行来的边/贯穿线，再到出边。 */
  segments: CommitGraphSegment[]
}

export interface CommitGraphLayout {
  rows: CommitGraphRow[]
  /** 整个布局使用过的最大 lane 数，可用于计算 SVG 宽度。 */
  laneCount: number
}

/** 返回第一个可复用的空位；没有空位时在末尾新增 lane。 */
function freeLane(lanes: readonly (string | null)[]): number {
  const empty = lanes.indexOf(null)
  return empty === -1 ? lanes.length : empty
}

/**
 * 为按 `git log --date-order` 排序的提交计算无运行时依赖的图布局。
 *
 * activeLanes 表示“当前行顶边界上，每条 lane 正在等待哪个 commit sha”，
 * null 是可复用空位。处理节点时消费它的 lane，再为 parent 预留 lane：
 * 第一 parent 优先继承节点 lane，其余 parent 使用已有 lane 或空位。
 * 如果 parent 已被其他分支预留，则直接汇到该 lane，避免同一 sha 同时占据多条 lane。
 *
 * 每次调用都是独立布局，因此可直接用于单个分页切片；页内指向未加载提交的
 * parent 边会画到行底，不会报错。跨页连续状态如需保留，应由 UI 在页边界处理。
 */
export function layoutCommitGraph(commits: readonly HistoryCommit[]): CommitGraphLayout {
  let activeLanes: (string | null)[] = []
  let laneCount = 0

  const rows = commits.map((commit): CommitGraphRow => {
    const lanesBefore = activeLanes.slice()
    const nextLanes = lanesBefore.slice()
    const segments: CommitGraphSegment[] = []

    // 正常输入中同一 sha 最多出现一次；同时消费所有匹配项也能在异常输入下恢复唯一性。
    const incomingLanes: number[] = []
    lanesBefore.forEach((sha, lane) => {
      if (sha === commit.sha) incomingLanes.push(lane)
    })

    // 未被任何已有 lane 等待的提交是新的 head，不伪造一条从上一行来的边。
    const nodeLane = incomingLanes[0] ?? freeLane(nextLanes)
    if (incomingLanes.length === 0) {
      // 确保新 head 的 lane 存在于本行状态中，随后立即消费它。
      nextLanes[nodeLane] = null
    } else {
      for (const lane of incomingLanes) nextLanes[lane] = null
    }

    for (let lane = 0; lane < lanesBefore.length; lane += 1) {
      const sha = lanesBefore[lane]
      if (sha === null) continue

      if (sha === commit.sha) {
        // 上一行行底 -> 当前节点。通常竖直，清理重复 lane 时也可能斜向汇合。
        segments.push({
          kind: "incoming",
          fromLane: lane,
          fromY: 0,
          toLane: nodeLane,
          toY: 0.5,
        })
      } else {
        // 与本节点无关的分支竖直贯穿整行。
        segments.push({
          kind: "passThrough",
          fromLane: lane,
          fromY: 0,
          toLane: lane,
          toY: 1,
        })
      }
    }

    const parentLanes = commit.parentShas.map((parentSha, parentIndex) => {
      // 另一分支已经等待同一 parent 时，汇合到原 lane，而不是再复制一条 lane。
      const existingLane = nextLanes.indexOf(parentSha)
      if (existingLane !== -1) return existingLane

      // 第一 parent 优先延续当前分支；若该 lane 已被占用则复用其他空位。
      const targetLane =
        parentIndex === 0 && nextLanes[nodeLane] === null ? nodeLane : freeLane(nextLanes)
      nextLanes[targetLane] = parentSha
      return targetLane
    })

    for (let index = 0; index < commit.parentShas.length; index += 1) {
      // 当前节点 -> 下一行行底。根提交没有 parent，因而不会留下悬挂的出边。
      segments.push({
        kind: "outgoing",
        fromLane: nodeLane,
        fromY: 0.5,
        toLane: parentLanes[index],
        toY: 1,
      })
    }

    // 只去掉尾部空位，不移动仍有提交或后续 parent 的 lane，保证线段坐标稳定。
    while (nextLanes.length > 0 && nextLanes[nextLanes.length - 1] === null) {
      nextLanes.pop()
    }

    const rowLaneCount = Math.max(lanesBefore.length, nodeLane + 1, nextLanes.length)
    laneCount = Math.max(laneCount, rowLaneCount)
    activeLanes = nextLanes

    return { sha: commit.sha, nodeLane, parentLanes, segments }
  })

  return { rows, laneCount }
}
