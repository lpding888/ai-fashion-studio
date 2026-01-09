# 技术栈与开发规范 (Tech Stack & Development Rules)

## 1. 技术选型 (Tech Stack)

### 环境与包管理
- **Runtime**: Node.js v24 (Active LTS)
- **Package Manager**: pnpm v10.x
- **Container**: Docker (用于运行 Postgres 数据库)

### 前端 (Next.js App Router)
- **Framework**: Next.js 15 (Stable)
- **UI Library**: React 19
- **Styling**: TailwindCSS (如果你需要快速布局) 或 CSS Modules (保持纯净) <- *建议先用 TailwindCSS 提高开发速度，配合 shadcn/ui 组件库*
- **State Management**: Zustand (轻量级，适合本地应用状态) 或 React Query (管理服务端状态)

### 后端 (NestJS)
- **Framework**: NestJS 11
- **API Style**: REST (符合前后端分离标准，方便对接)

### 数据层 (Data Access)
- **ORM**: Prisma 7
- **Database**: PostgreSQL (Docker 部署)

### AI 交互层
- **Client**: `openai` SDK (用于连接 Brain 的 Chat 接口)
- **Client**: `google-auth-library` + `axios` (用于连接 Painter 的原生接口)

---

## 2. 目录结构规范 (Project Structure)

我们要在一个名为 `ai-fashion-studio` 的根目录下管理前后端（Monorepo 风格或独立目录，建议 MVP 简单点，用独立目录）：

```
ai-fashion-studio/
├── client/                 # Next.js 前端应用
│   ├── src/
│   │   ├── app/            # App Router 页面
│   │   ├── components/     # UI 组件
│   │   └── lib/            # 工具类
│   └── public/
├── server/                 # NestJS 后端服务
│   ├── src/
│   │   ├── modules/        # 业务模块 (Task, Shot, Brain, Painter)
│   │   ├── prisma/         # 数据库 Schema
│   │   └── main.ts
│   └── docker-compose.yml  # 数据库编排文件
└── docs/                   # 你的需求文档
```

---

## 3. 核心开发规则 (AI 避坑指南)

为了防止我（AI）或后续的 Copilot 瞎跑，必须严格遵守以下军规：

### 规则 A：类型即法律 (Types as Law)
- **禁止使用 `any`**。任何数据交互必须先定义 TypeScript Interface。
- **Prisma Schema 是唯一真理**。数据库改动必须先改 Schema，再跑 `prisma migrate`。
- Brain 输出的 JSON 必须通过 Zod Schema 校验，校验失败直接抛错，**严禁在代码里做模糊兼容**。

### 规则 B：双模隔离 (Model Isolation)
- **Brain 的代码**只能出现在 `server/src/modules/brain`，且只能调用 OpenAI 兼容接口。
- **Painter 的代码**只能出现在 `server/src/modules/painter`，且必须实现 `layout_mode` 的拼图逻辑。
- 两者通过 `TaskService` 协调，**严禁在一个函数里混写两个模型的调用逻辑**。

### 规则 C：文件系统直写 (File System Direct)
- 图片上传不存数据库，只存路径。
- 图片**必须**存放在 `server/uploads/{taskId}/` 目录下，按 `ref_A.png`, `shot_01_v1.png` 命名，严禁乱码文件名。

### 规则 D：错误处理 (Error Handling)
- 所有的 AI 调用必须包裹在 `try-catch` 中。
- 如果 Painter 生成失败，必须记录具体的 API 错误码（是 400 参数错还是 500 模型挂了）。

---

## 4. 下一步执行计划 (Execution Path)

1.  **Init**: 初始化项目目录，配置 Docker Postgres。
2.  **Backend Core**:
    - 初始化 NestJS + Prisma。
    - 定义 Task / Shot / Garment 等核心数据模型。
    - 跑通 Brain (OpenAI) 和 Painter (Google) 的基础连通性测试。
3.  **Frontend Core**:
    - 初始化 Next.js。
    - 搭建任务列表、新建任务页、任务详情页（含 Shot 网格）。
4.  **Integration**: 联调 AI 流程。

---

**Do you accept these rules?** 如果接受，我将开始第一步：**初始化项目结构和 Docker 环境**。
