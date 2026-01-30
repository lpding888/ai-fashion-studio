# 🚀 本地开发快速指南

## 一键启动（推荐）

```bash
./dev.sh
```

这个脚本会自动：
- ✅ 启动 PostgreSQL 数据库（Docker）
- ✅ 启动后端服务器（带热重载）
- ✅ 启动前端应用（带热重载）

### 停止服务

按 `Ctrl+C` 即可停止前后端服务。

> **注意**: 数据库会继续运行，如需停止：
> ```bash
> docker-compose down
> ```

---

## 手动启动

### 启动数据库
```bash
docker-compose up -d
```

### 启动后端
打开终端 1：
```bash
cd server
npm run start:dev
```

### 启动前端
打开终端 2：
```bash
cd client
npm run dev
```

---

## 访问地址

- **前端**: http://localhost:3000
- **后端 API**: http://localhost:3001/api
- **数据库**: localhost:5432

---

## 管理员账号（开发/生产）

- **开发环境**：首次启动会自动创建管理员账户（建议在 `server/.env` 中设置 `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` 自定义；未设置时使用内置默认值，仅用于本地）
- **生产环境**：必须设置 `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`

---

## 常用命令

```bash
# 查看数据库状态
docker ps

# 停止数据库
docker-compose down

# 重置数据库（删除所有数据）
docker-compose down -v
docker-compose up -d
cd server && npm run prisma:migrate:deploy

# 查看数据库日志
docker logs ai_fashion_db
```

---

## 故障排查

### 端口被占用
如果端口被占用，可以在相应的配置文件中修改端口：
- 后端: `server/.env` 中的 `PORT`
- 前端: Next.js 会自动选择可用端口

### 数据库连接失败
```bash
# 重启数据库容器
docker-compose restart
```

### 前端或后端无法访问
检查对应的终端输出，确保没有报错。
