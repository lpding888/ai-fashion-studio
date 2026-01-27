#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}⚠️  警告: 即将重置本地数据库以更新管理员密码！${NC}"
echo -e "${YELLOW}⚠️  警告: 所有本地数据将被清除！${NC}"
echo ""

# 停止容器
echo -e "${BLUE}🛑 停止数据库容器...${NC}"
docker-compose down -v

# 启动容器
echo -e "${BLUE}🚀 重新启动数据库...${NC}"
docker-compose up -d

# 等待数据库就绪
echo -e "${BLUE}⏳ 等待数据库就绪...${NC}"
sleep 5

# 运行迁移
echo -e "${BLUE}🔄 运行数据库迁移...${NC}"
cd server
npm run prisma:migrate:deploy

echo ""
echo -e "${GREEN}✅ 数据库重置完成！${NC}"
echo -e "${GREEN}👤 新管理员账号配置生效:${NC}"
echo "   用户名: lpd520"
echo "   密码:   634171"
echo ""
echo -e "${BLUE}💡 现在请重新运行启动脚本: ./dev.sh${NC}"
