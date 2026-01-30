# 简单账号密码认证系统使用指南

## 🎯 功能说明

**内测阶段使用简单的账号密码认证**：
- 管理员后台创建账号
- 用户用账号密码登录
- 无需短信验证码
- 适合内测快速上手

---

## 🔑 管理员账户（开发 / 生产）

- **开发环境**：首次启动会自动创建管理员账户（便于本地调试）
  - 建议通过 `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` 自定义
  - 未设置时使用内置默认值（仅用于本地）
- **生产环境**：不会自动创建默认口令管理员；必须通过环境变量引导创建管理员：
  - `BOOTSTRAP_ADMIN_USERNAME`
  - `BOOTSTRAP_ADMIN_PASSWORD`（建议 ≥ 16 位）

建议：首次登录后立即修改管理员密码，并轮换 `JWT_SECRET`。

---

## 📡 API接口

### 1. 登录

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "<admin_username>",
  "password": "<admin_password>"
}
```

**响应**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "xxx",
    "username": "admin",
    "nickname": "管理员",
    "role": "ADMIN",
    "credits": 999999,
    "totalTasks": 0
  }
}
```

### 2. 获取当前用户

```http
GET /api/auth/me
Authorization: Bearer <your_token>
```

### 3. 创建新用户（管理员）

```http
POST /api/auth/admin/create-user
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123",
  "nickname": "测试用户",
  "email": "test@example.com",
  "role": "USER",
  "credits": 100,
  "notes": "内测用户A"
}
```

### 4. 获取所有用户（管理员）

```http
GET /api/auth/admin/users
Authorization: Bearer <admin_token>
```

### 5. 生成邀请码（管理员）

> 明文邀请码仅在创建时返回一次；服务端只保存 hash。

```http
POST /api/auth/admin/invite-codes
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "note": "内测用户 A（可选）"
}
```

### 6. 查看邀请码列表（管理员）
```http
GET /api/auth/admin/invite-codes
Authorization: Bearer <admin_token>
```

### 7. 撤销邀请码（管理员）
```http
DELETE /api/auth/admin/invite-codes/:inviteId
Authorization: Bearer <admin_token>
```

### 8. 注册（邀请码）
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123",
  "inviteCode": "xxxxxx"
}
```

---

## 💻 前端使用示例

### 登录页面示例

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async () => {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || '登录失败');
                return;
            }

            // 保存Token到localStorage
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            // 跳转到首页
            router.push('/');
        } catch (err) {
            setError('网络错误');
        }
    };

    return (
        <div className="login-page">
            <h1>AI Fashion Studio</h1>
            
            <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={e => setUsername(e.target.value)}
            />
            
            <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleLogin()}
            />

            {error && <p className="error">{error}</p>}
            
            <button onClick={handleLogin}>登录</button>
        </div>
    );
}
```

### 权限守卫

```tsx
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const token = request.cookies.get('token')?.value ||
                  request.headers.get('authorization')?.split(' ')[1];

    // 需要登录的页面
    const protectedPaths = ['/tasks', '/history', '/profile'];

    if (protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
        if (!token) {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    return NextResponse.next();
}
```

---

## 🛠️ 测试步骤

### 1. 启动服务器

```bash
cd server
npm run start:dev
```

### 2. 管理员登录

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<admin_username>","password":"<admin_password>"}'
```

### 3. 生成邀请码

```bash
curl -X POST http://localhost:3001/api/auth/admin/invite-codes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"note":"local test"}'
```

### 4. 使用邀请码注册
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123","inviteCode":"<invite_code>"}'
```

### 5. 测试用户登录

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123"}'
```

---

## 📊 数据存储

用户数据存储在：`server/data/users.json`

```json
{
  "users": [
    {
      "id": "uuid",
      "username": "admin",
      "password": "$2b$10$...",  // bcrypt加密
      "nickname": "管理员",
      "status": "ACTIVE",
      "role": "ADMIN",
      "credits": 999999,
      "totalTasks": 0,
      "createdAt": 1704700000000
    }
  ]
}
```

---

## 🔐 安全说明

1. **密码加密**：使用bcrypt加密存储
2. **JWT Token**：7天有效期
3. **权限控制**：USER vs ADMIN
4. **Token验证**：每个请求验证Token有效性

---

## ✅ 快速开始

**步骤1**：启动服务器
```bash
npm run start:dev
```

**步骤2**：准备管理员账户
- 开发环境：建议设置 `BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD`
- 生产环境：配置 `BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD` 引导创建

**步骤3**：生成邀请码
- 管理后台：邀请码页面生成
- 或使用 API：`POST /api/auth/admin/invite-codes`

**步骤4**：注册并登录
- 使用邀请码注册
- 登录后开始使用
- 开始使用系统

---

## 🎬 后续升级

内测结束后可升级到：
- 手机号+验证码
- 微信登录
- 邮箱注册

数据无缝迁移！
