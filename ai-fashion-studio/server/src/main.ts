import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { json, urlencoded } from 'express';
import { AdminLogService } from './admin-log/admin-log.service';
import { StreamLogger } from './admin-log/stream-logger';
import { config as loadEnv } from 'dotenv';
import { AdminAnalyticsModule } from './admin-analytics/admin-analytics.module';
import { AdminLogModule } from './admin-log/admin-log.module';
import { AuthModule } from './auth/auth.module';
import { BrainPromptModule } from './brain-prompt/brain-prompt.module';
import { BrainRoutingModule } from './brain-routing/brain-routing.module';
import { CosModule } from './cos/cos.module';
import { CreditModule } from './credit/credit.module';
import { DirectPromptModule } from './direct-prompt/direct-prompt.module';
import { FacePresetModule } from './face-preset/face-preset.module';
import { LearnPromptModule } from './learn-prompt/learn-prompt.module';
import { McpModule } from './mcp/mcp.module';
import { ModelProfileModule } from './model-profile/model-profile.module';
import { PosePresetModule } from './pose-preset/pose-preset.module';
import { PresetCollectionModule } from './preset-collection/preset-collection.module';
import { PresetMetaModule } from './preset-meta/preset-meta.module';
import { PromptOptimizerModule } from './prompt-optimizer/prompt-optimizer.module';
import { PromptSnippetModule } from './prompt-snippet/prompt-snippet.module';
import { StylePresetModule } from './style-preset/style-preset.module';
import { TaskModule } from './task/task.module';
import { UserAssetModule } from './user-asset/user-asset.module';
import { WorkflowPromptModule } from './workflow-prompt/workflow-prompt.module';

const loadEnvFiles = () => {
  const serverRoot = resolve(__dirname, '..', '..');
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '.env.local'),
    resolve(serverRoot, '.env'),
    resolve(serverRoot, '.env.local'),
  ];
  candidates.forEach((path) => {
    if (!existsSync(path)) return;
    loadEnv({ path, override: true });
  });
};

async function bootstrap() {
  // 确保环境变量在模块初始化前可用（兼容多工作目录启动）
  loadEnvFiles();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 允许 JSON 里携带 base64 图片（用于局部编辑 mask / 参考图）。
  // 默认 25mb，可用 env 覆盖：JSON_BODY_LIMIT=50mb
  const jsonBodyLimit = (process.env.JSON_BODY_LIMIT || '25mb').trim();
  app.use(json({ limit: jsonBodyLimit }));
  app.use(urlencoded({ extended: true, limit: jsonBodyLimit }));

  // 用于管理员后台实时查看后端日志（内存环形缓冲）
  app.useLogger(new StreamLogger(app.get(AdminLogService)));

  // 反代部署（Caddy/Nginx）下获取真实客户端 IP
  app.set('trust proxy', 1);

  // Enable CORS（生产环境建议用白名单）
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl / server-to-server
      if (corsOrigins.length === 0) return callback(null, true); // dev default
      return callback(null, corsOrigins.includes(origin));
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ✅ 设置全局API前缀
  app.setGlobalPrefix('api');

  const isProd = process.env.NODE_ENV === 'production';
  const enableSwagger = process.env.ENABLE_SWAGGER === 'true';
  if (enableSwagger && !isProd) {
    const config = new DocumentBuilder()
      .setTitle('AI Fashion Studio API')
      .setDescription('API 文档（Phase 2：核心 + 扩展模块）')
      .setVersion('1.0')
      .addBearerAuth()
      .addServer('/api')
      .build();
    const document = SwaggerModule.createDocument(app, config, {
      include: [
        AuthModule,
        CreditModule,
        TaskModule,
        CosModule,
        FacePresetModule,
        StylePresetModule,
        PosePresetModule,
        ModelProfileModule,
        BrainPromptModule,
        BrainRoutingModule,
        DirectPromptModule,
        LearnPromptModule,
        WorkflowPromptModule,
        PromptSnippetModule,
        PromptOptimizerModule,
        PresetMetaModule,
        PresetCollectionModule,
        UserAssetModule,
        AdminLogModule,
        AdminAnalyticsModule,
        McpModule,
      ],
      deepScanRoutes: true,
    });
    SwaggerModule.setup('api-docs', app, document);
  }

  // Serve Static Assets
  // ⚠️ 生产环境仅暴露 uploads，避免静态暴露源码/环境变量等敏感文件
  const staticRoot = isProd
    ? join(process.cwd(), 'uploads')
    : join(process.cwd());
  const staticPrefix = isProd ? '/uploads' : '/';
  app.useStaticAssets(staticRoot, { prefix: staticPrefix });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
