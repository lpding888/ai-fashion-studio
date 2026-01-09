# SCF Painter云函数

腾讯云Serverless函数，用于批量并行调用Painter API生成图片。

## 功能

- ✅ 从COS下载参考图
- ✅ WebP自动压缩（数据万象CI）
- ✅ 批量并行调用Painter API
- ✅ 保存生成图到COS
- ✅ 完整错误处理和日志

## 本地开发

### 1. 安装依赖

```bash
cd scf-painter
npm install
```

### 2. 配置环境变量

复制环境变量示例文件：

```bash
# Windows PowerShell
Copy-Item .env.local.example .env.local
```

编辑 `.env.local`，填入真实值：

```env
TENCENT_SECRET_ID=你的SecretId
TENCENT_SECRET_KEY=你的SecretKey
COS_BUCKET=你的存储桶名称
COS_REGION=ap-beijing
PAINTER_API_URL=Painter接口地址
PAINTER_API_KEY=Painter密钥
```

### 3. 本地测试

```bash
npm test
```

或直接运行：

```bash
node test-local.js
```

验证“压缩是否生效”（数据万象 CI）：
- 在 `.env.local` 里设置 `TEST_REFERENCE_IMAGE_URLS`（一个或多个 COS 图片 URL，逗号分隔）
- 运行 `node test-local.js`，脚本会同时拉取“原图 / CI 压缩后”的大小与 `Content-Type`，用于确认 `imageMogr2/...` 处理是否真正生效

## 部署到腾讯云

### 方式1：控制台部署（推荐）

1. **打包代码**

```powershell
# 安装依赖
npm install

# 打包（只包含必要文件）
Compress-Archive -Path index.js,package.json,node_modules -DestinationPath scf-painter.zip -Force
```

2. **上传部署**
   - 登录 [腾讯云SCF控制台](https://console.cloud.tencent.com/scf)
   - 点击"新建" → "从头开始"
   - 函数名称：`painter-generator`
   - 运行环境：Node.js 20.x
   - 提交方法：本地上传zip包
   - 执行方法：`index.main_handler`
   - 上传 `scf-painter.zip`

3. **配置环境变量**
   在函数配置页面添加环境变量：
   - `TENCENT_SECRET_ID`
   - `TENCENT_SECRET_KEY`
   - `COS_BUCKET`
   - `COS_REGION`

4. **配置函数参数**
   - 内存：1024MB
   - 超时时间：150秒
   - 并发配额：100（按需调整）

5. **创建API网关触发器**
   - 触发器类型：API网关
   - 请求方法：POST
   - 鉴权方式：免鉴权（后端调用可用密钥）
   - 复制API网关URL

### 方式2：命令行部署

使用腾讯云CLI工具：

```bash
# 安装CLI
npm install -g scf-cli

# 部署
scf deploy
```

## 调用示例

### NestJS后端调用

```typescript
import axios from 'axios';

const scfUrl = 'https://service-xxx.gz.apigw.tencentcs.com/release/painter-generator';

const result = await axios.post(scfUrl, {
  referenceImageUrls: [
    'https://your-bucket.cos.ap-beijing.myqcloud.com/image.jpg'
  ],
  prompts: [
    'Prompt 1',
    'Prompt 2',
    'Prompt 3'
  ],
  config: {
    painterApiUrl: 'https://painter-api.com/generate',
    apiKey: 'your-api-key',
    painterParams: {
      style: 'realistic',
      size: '1024x1024'
    }
  }
});

console.log(result.data.imageUrls);
```

### 请求格式

```json
{
  "referenceImageUrls": ["https://..."],
  "prompts": ["prompt 1", "prompt 2"],
  "config": {
    "painterApiUrl": "https://...",
    "apiKey": "...",
    "painterParams": {}
  }
}
```

### 响应格式

```json
{
  "success": true,
  "imageUrls": [
    "https://bucket.cos.region.myqcloud.com/generated/xxx-0.png",
    "https://bucket.cos.region.myqcloud.com/generated/xxx-1.png"
  ],
  "count": 2
}
```

## 成本估算

### 单次调用（生成3张图）

- 资源费用：1GB × 90秒 = 90 GBs = ¥0.010
- 外网流量：约28MB = ¥0.022
- **总计：¥0.032**

### 月1000任务

- SCF费用：¥34
- 加上免费额度后：约¥20-30

## 注意事项

1. **超时设置**：Painter API可能需要30-140秒，建议设置150秒超时
2. **内存配置**：处理多张图片建议1GB内存
3. **错误重试**：SCF会自动重试失败的调用
4. **日志查看**：在SCF控制台 → 日志查询中查看执行日志

## 文件说明

```
scf-painter/
├── index.js              # SCF主函数（部署）
├── package.json          # 依赖配置（部署）
├── node_modules/         # 依赖包（部署）
├── test-local.js         # 本地测试（不部署）
├── .env.local.example    # 环境变量示例（不部署）
├── .env.local           # 本地环境变量（不部署）
├── .gitignore           # Git忽略文件
└── README.md            # 说明文档
```

## 故障排查

### 问题1：函数超时

**原因**：Painter API响应慢  
**解决**：增加超时时间到180秒

### 问题2：内存不足

**原因**：处理图片过多  
**解决**：增加内存到1.5GB或2GB

### 问题3：COS上传失败

**原因**：权限配置错误  
**解决**：检查环境变量中的SecretId/Key是否正确

### 问题4：Painter API报错

**原因**：API密钥或参数错误  
**解决**：检查config.painterApiUrl和apiKey

## 开发调试

启用详细日志：

```javascript
// 在index.js中添加
console.log('详细信息:', JSON.stringify(data, null, 2));
```

查看SCF日志：
- 控制台 → 云函数 → 函数管理 → 日志查询
- 可以看到所有console.log输出

## 更新日志

- v1.0.0 (2026-01-07): 初始版本，支持批量并行生成
