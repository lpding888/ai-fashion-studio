# AI Fashion Studio

## 📖 项目简介

AI Fashion Studio 是一个基于 AI 生成时尚图像的全栈应用项目。本项目集成了 Next.js 前端、NestJS 后端以及 Serverless 云函数（SCF），用于提供高质量的 AI 图片生成与管理服务。

## 🚀 快速开始

本项目提供了自动化脚本，支持一键启动完整的开发环境。

### 方式一：一键启动（推荐）

在 macOS/Linux 环境下：

```bash
./dev.sh
```

或者直接双击运行 `启动开发环境.command` (macOS)。

此脚本会自动：
1. 启动 PostgreSQL 数据库（Docker 容器）
2. 启动 NestJS 后端服务（3000 端口）
3. 启动 Next.js 前端应用（3001 端口）

### 方式二：手动启动

如果你需要单独控制各个服务，可以按以下步骤操作：

#### 1. 启动数据库
确保已安装 Docker，然后运行：
```bash
docker-compose up -d
```

#### 2. 启动后端 (Server)
```bash
cd server
npm install
npm run start:dev
```
后端 API 地址: `http://localhost:3000`

#### 3. 启动前端 (Client)
```bash
cd client
npm install
npm run dev
```
前端访问地址: `http://localhost:3001`

## 🛠️ 技术栈

### 前端 (Client)
- **框架**: [Next.js 15](https://nextjs.org/) (React 19)
- **UI 库**: Tailwind CSS 4, Radix UI, Lucide React
- **状态管理**: Zustand
- **数据请求**: SWR, Axios
- **动画**: Framer Motion
- **交互**: Dnd Kit (拖拽)

### 后端 (Server)
- **框架**: [NestJS 11](https://nestjs.com/)
- **数据库 ORM**: Prisma 7
- **数据库**: PostgreSQL
- **工具**: Docker, Zod (验证), OpenAI SDK, COS SDK (腾讯云对象存储)

### 其他组件
- **SCF Painter**: 位于 `scf-painter/`，用于处理图像生成的 Serverless 函数。

## 🔑 默认账号信息

开发环境默认管理员账号：
- **用户名**: `lpd520`
- **密码**: `13112188769cc`

> ⚠️ 注意：生产环境请务必修改默认密码。

## 📂 目录结构

```
ai-fashion-studio/
├── client/                 # Next.js 前端项目
├── server/                 # NestJS 后端项目
├── scf-painter/            # 图像生成云函数
├── deploy/                 # 部署相关脚本
├── README_DEV.md           # 开发指南
├── dev.sh                  # 开发环境启动脚本
└── docker-compose.yml      # 数据库容器编排
```

## 🔧 常见问题与维护

### 数据库操作
- **查看状态**: `docker ps`
- **重置数据**: 运行 `./reset_db_for_new_admin.sh` (慎用)
- **停止服务**: `docker-compose down`

详细开发文档请参考 [README_DEV.md](./README_DEV.md)。
