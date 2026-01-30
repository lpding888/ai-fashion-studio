#!/bin/bash

# AI Fashion Studio - 本地开发一键启动脚本
# 支持前后端热更新

echo "🚀 AI Fashion Studio - 启动中..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 函数：关闭占用指定端口的进程
kill_port() {
    local port=$1
    local pid=$(lsof -ti:$port)
    
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}⚠️  端口 $port 被占用 (PID: $pid)，正在关闭...${NC}"
        kill -9 $pid 2>/dev/null
        sleep 1
        echo -e "${GREEN}✅ 端口 $port 已释放${NC}"
    fi
}

# 检查并关闭冲突的端口
echo -e "${BLUE}🔍 检查端口占用...${NC}"
kill_port 3000  # 前端端口
kill_port 3001  # 后端端口

# 检查 Docker 是否运行
echo -e "${BLUE}📦 检查 Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Docker 未运行，正在启动 Docker...${NC}"
    open -a Docker
    echo "等待 Docker 启动..."
    sleep 10
fi

# 启动 PostgreSQL 数据库
echo -e "${BLUE}🗄️  启动 PostgreSQL 数据库...${NC}"
docker-compose up -d
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 数据库已启动${NC}"
else
    echo -e "${YELLOW}⚠️  数据库可能已在运行${NC}"
fi

echo ""
echo -e "${BLUE}📡 启动后端服务器...${NC}"
echo -e "${BLUE}📱 启动前端应用...${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 开发环境启动完成！${NC}"
echo ""
echo "📍 访问地址："
echo "   - 前端: http://localhost:3000 (或查看上方输出)"
echo "   - 后端 API: http://localhost:3001/api"
echo "   - 数据库: localhost:5432"
echo ""
echo "⌨️  停止服务: 按 Ctrl+C"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 定义清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 正在停止服务...${NC}"
    kill $SERVER_PID 2>/dev/null
    kill $CLIENT_PID 2>/dev/null
    echo -e "${GREEN}✅ 已停止所有服务${NC}"
    echo -e "${BLUE}💡 提示: 数据库仍在运行，如需停止请运行: docker-compose down${NC}"
    exit 0
}

# 捕获 Ctrl+C 信号
trap cleanup SIGINT SIGTERM

# 启动后端（在后台运行）
cd server
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 后端依赖未安装，正在安装...${NC}"
    if command -v pnpm >/dev/null 2>&1; then
        pnpm install
    else
        npm install
    fi
fi
echo -e "${BLUE}📡 启动后端服务器...${NC}"
if command -v pnpm >/dev/null 2>&1; then
    pnpm run start:dev &
else
    npm run start:dev &
fi
SERVER_PID=$!

# 等待后端启动
sleep 5

# 启动前端（在后台运行）
cd ../client
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 前端依赖未安装，正在安装...${NC}"
    if command -v pnpm >/dev/null 2>&1; then
        pnpm install
    else
        npm install --legacy-peer-deps
    fi
fi
echo -e "${BLUE}📱 启动前端应用...${NC}"
if command -v pnpm >/dev/null 2>&1; then
    pnpm run dev &
else
    npm run dev &
fi
CLIENT_PID=$!

# 等待进程
wait
