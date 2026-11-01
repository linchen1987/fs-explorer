# Git GUI

一个**轻量、可定制、渐进式演进**的 Git 桌面客户端。基于 Tauri 2 + React 19 + shadcn/ui，直接调用系统 `git`，按需慢慢长出你日常需要的功能。

## 功能

### 项目管理

- 一个 Project = 一个本地目录（必须是 git 仓库，添加时自动定位到仓库根目录）
- 单窗口：所有项目并列展示在左侧栏，同一时间选中/管理一个
- 可随时移除（只移出列表，不动磁盘文件）
- 侧栏实时显示每个项目的当前分支与是否有未提交改动

### 模块（主区域，可扩展）

| 模块 | 说明 |
| --- | --- |
| **工作区** | 当前 diff：已暂存 / 未暂存 / 未跟踪三组文件，点击查看 staged / unstaged / 全新增 diff，合并冲突文件可直接查看当前冲突内容，支持暂存与取消暂存（单个或整组） |
| **文件** | 项目文件树与筛选，合并冲突文件带 U 标识；代码查看/编辑/保存（基础高亮、⌘/Ctrl+S、未保存确认）；Markdown 支持 GFM、本地图片与 Mermaid 图表渲染，SVG 支持源码/渲染预览，并支持常见图片和视频查看 |
| **提交历史** | 当前分支或所有分支的提交拓扑图，显示分支/tag 装饰，按 80 条分页加载；点击提交查看元信息、变更文件和单文件 diff（合并提交相对第一父提交） |
| **分支对比** | 类 PR 视图：选择 base 与 head 两个分支，查看文件变更列表（M/A/D/R 状态、±行数）、每个提交、以及单文件 diff（rename 识别、二进制/模式变更提示） |

> 文件模块展示已跟踪及所有未跟踪文件（包括被 `.gitignore` 等规则忽略的文件，但不包含 `.git` 内容）。文本查看/编辑限 UTF-8、2 MiB；图片/视频预览限 32 MiB。

> 新模块通过 `apps/desktop/src/modules/registry.ts` 注册即可接入，见下文。

## 技术栈

- **pnpm monorepo**：`apps/*` + `packages/*`
- **Tauri 2**（Rust 后端执行系统 git 命令，无 libgit2 依赖）
- **React 19 + TypeScript + Vite 8**
- **Tailwind CSS v4 + shadcn/ui**（radix 基座）
- **CodeMirror 6**（按需加载语言高亮）与 **react-markdown + GFM + Mermaid**（图表按需渲染）
- **zustand** 状态管理，**sonner** 错误提示

## 目录结构

```
git-gui/
├── apps/
│   └── desktop/                 # Tauri 桌面应用
│       ├── src/                 # 前端
│       │   ├── components/      # 侧栏/主区域/DiffViewer 等共享组件
│       │   ├── modules/         # 主区域模块（registry.ts 注册）
│       │   │   ├── branch-compare/   # 分支对比
│       │   │   ├── worktree/         # 工作区
│       │   │   ├── files/            # 文件树、查看器与文本编辑器
│       │   │   └── history/          # 提交历史与拓扑图
│       │   ├── stores/          # zustand（projects / compare）
│       │   └── lib/             # IPC 封装、hooks
│       └── src-tauri/           # Rust 后端
│           └── src/
│               ├── commands.rs  # Tauri commands（前后端契约）
│               ├── state.rs     # 项目列表持久化
│               ├── files.rs     # 受限的项目文件读取与文本保存
│               └── git/         # git 输出解析（status/refs/diff/history，含单元测试）
└── packages/
    └── core/                    # @git-gui/core：领域类型 + Diff/提交图/文件树处理（vitest 测试）
```

## 开发

前置要求：Node ≥ 20、pnpm、Rust（rustup）、系统 `git`。

```bash
pnpm install          # 安装依赖
pnpm dev:app          # 启动桌面应用（tauri dev，热更新）
pnpm --filter @git-gui/desktop dev   # 仅启动前端 dev server

pnpm test             # packages/core 的 vitest 测试
pnpm check            # 全部 TypeScript 类型检查
pnpm check:rs         # Rust 单元测试 + cargo check

pnpm build:app        # 打包桌面应用（dmg/app）
pnpm install:local    # macOS：构建并安装到 /Applications/Git GUI.app（替换已有版本）
```

> macOS 开发模式的 Dock 图标在 Rust 编译时内嵌。修改图标后需要完全退出并重新执行 `pnpm dev:app`，仅刷新前端不会更新 Dock。

项目列表保存在系统应用配置目录（macOS：`~/Library/Application Support/com.gitgui.desktop/projects.json`）。

## 架构说明

### 前后端契约

- Rust 侧 `src-tauri/src/commands.rs` 中的每个 `#[tauri::command]` 对应前端 `src/lib/ipc.ts` 中的一个类型化封装；领域类型定义在 `packages/core/src/types.ts`（与 Rust 结构体的 camelCase serde 输出一一对应，修改需两侧同步）。
- 文件状态与文件列表使用 `-z` / `--porcelain=v2` 等机器友好格式；提交历史携带 parent SHA 与 ref 装饰，前端据此计算拓扑。rename、merge、root commit 等约定以真实 git 输出的单元测试固化。

### 如何新增一个模块

1. 在 `apps/desktop/src/modules/` 下新建目录，实现组件：`function MyModule({ project }: ModuleProps)`
2. 在 `modules/registry.ts` 的 `MODULES` 数组中注册（id、标题、图标、组件）
3. 完成。模块自行通过 `ipc` 调用后端命令；需要新数据时在 `commands.rs` 加一个 command 并在 `ipc.ts` 加封装

## 路线图（渐进式）

- [ ] 模块·提交：写 commit message 并提交
- [x] 模块·文件：文件树、代码查看/编辑、Markdown/SVG 与媒体预览
- [x] 模块·历史：分支的提交时间线（graph）
- [ ] 工作区：放弃更改、stash
- [ ] 分支对比：按目录折叠文件树、关键词过滤
- [ ] 侧栏：文件系统监听自动刷新
- [ ] i18n / 设置面板 / 自定义模块顺序
