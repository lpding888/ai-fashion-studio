# 快速运行本地测试

# Step 1: 安装 Serverless CLI（首次运行）
npm install -g @serverless/cli

# Step 2: 配置环境变量
# 编辑 .env.local 文件，填入真实的密钥

# Step 3: 运行测试（选择一种）

# 方式1: 官方推荐（scf invoke local）
scf invoke local --template template.yaml --event event.json

# 方式2: 直接Node.js（更简单）
node quick-test.js

Write-Host "测试完成！查看输出中的 imageUrl 链接" -ForegroundColor Green
