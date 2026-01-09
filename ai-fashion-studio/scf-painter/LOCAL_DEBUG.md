# SCF Painter 本地调试快速开始

## 🚀 快速开始（3步）

### Step 1: 安装 Serverless CLI

```powershell
npm install -g @serverless/cli

# 验证安装
scf --version
```

### Step 2: 配置环境变量

创建 `.env.local` 文件（复制下面内容）：

```env
TENCENT_SECRET_ID=你的SecretId
TENCENT_SECRET_KEY=你的SecretKey
COS_BUCKET=你的存储桶名称-1234567890
COS_REGION=ap-beijing
PAINTER_API_URL=https://api.vectorengine.ai/v1
PAINTER_API_KEY=你的Gemini密钥
```

**获取方式**：
- 腾讯云密钥：https://console.cloud.tencent.com/cam/capi
- COS存储桶：https://console.cloud.tencent.com/cos/bucket

### Step 3: 运行本地测试

```powershell
cd scf-painter

# 方式1: 使用官方工具（推荐）
scf invoke local --template template.yaml --event event.json

# 方式2: 直接Node.js（更简单）
node quick-test.js
```

---

## 📋 测试事件说明

`event.json` 包含测试数据：

```json
{
  "body": "{
    \"referenceImageUrls\": [],
    \"prompt\": \"A beautiful fashion model...\",
    \"shotId\": \"test_shot_001\",
    \"config\": {
      \"painterApiUrl\": \"https://api.vectorengine.ai/v1\",
      \"apiKey\": \"YOUR_KEY\",
      \"painterModel\": \"gemini-3-pro-image-preview\"
    }
  }"
}
```

**修改提示词**：直接编辑 `event.json` 中的 `prompt` 字段

---

## ⚠️ 注意事项

1. **COS会产生真实费用**（存储+流量）
2. **测试用小文件**（1K图片约几KB）
3. **删除测试文件**（避免累积费用）

---

## 🔧 故障排查

### 问题1: scf 命令不存在

```powershell
npm install -g @serverless/cli
```

### 问题2: 环境变量未加载

确保 `.env.local` 在 `scf-painter` 目录下，且格式正确。

### 问题3: COS权限错误

在 CAM 控制台为密钥添加 `QcloudCOSFullAccess` 权限。

---

## ✅ 验证成功

看到以下输出表示成功：

```
✅ 图片生成完成
💾 保存 Shot test_shot_001: ...
✅ 保存完成: 512KB

{
  "success": true,
  "shotId": "test_shot_001",
  "imageUrl": "https://your-bucket.cos.ap-beijing.myqcloud.com/..."
}
```

复制 `imageUrl` 到浏览器查看生成的图片！
