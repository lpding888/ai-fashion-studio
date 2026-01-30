import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CosService } from './cos.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  CosCredentialsBodySchema,
  CosImageUrlBodySchema,
  CosOptimizedUrlBodySchema,
} from '../contracts/api.schemas';
import { z } from 'zod';

@ApiTags('Cos')
@ApiBearerAuth()
@Controller('cos')
export class CosController {
  private logger = new Logger(CosController.name);

  constructor(private cosService: CosService) {}

  /**
   * 获取上传临时密钥
   * POST /api/cos/credentials
   */
  @Post('credentials')
  @ApiOperation({ summary: '获取 COS 临时密钥' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { userId: { type: 'string' } },
    },
  })
  async getCredentials(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(CosCredentialsBodySchema))
    _body: z.infer<typeof CosCredentialsBodySchema> = {},
  ) {
    try {
      this.logger.log(`请求临时密钥，用户ID: ${user.id}`);
      this.logger.log(
        `Check Keys: SecretId=${process.env.TENCENT_SECRET_ID ? 'YES' : 'NO'}, SecretKey=${process.env.TENCENT_SECRET_KEY ? 'YES' : 'NO'}, Bucket=${process.env.COS_BUCKET}`,
      );
      return await this.cosService.getUploadCredentials(user.id);
    } catch (error) {
      this.logger.error('获取临时密钥致命错误', error);
      this.logger.error(error.stack);
      throw error;
    }
  }

  /**
   * 生成处理后的图片URL
   * POST /api/cos/image-url
   */
  @Post('image-url')
  @ApiOperation({ summary: '生成图片处理 URL' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        format: { type: 'string', enum: ['webp', 'avif', 'heif'] },
        quality: { type: 'number' },
        width: { type: 'number' },
      },
      required: ['key'],
    },
  })
  getImageUrl(
    @Body(new ZodValidationPipe(CosImageUrlBodySchema))
    body: z.infer<typeof CosImageUrlBodySchema>,
  ) {
    return {
      url: this.cosService.getImageUrl(body.key, body),
    };
  }

  /**
   * 获取优化后的URL（用于AI API调用）
   * POST /api/cos/optimized-url
   */
  @Post('optimized-url')
  @ApiOperation({ summary: '生成优化后的 URL' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  })
  getOptimizedUrl(
    @Body(new ZodValidationPipe(CosOptimizedUrlBodySchema))
    body: z.infer<typeof CosOptimizedUrlBodySchema>,
  ) {
    return {
      url: this.cosService.getOptimizedUrl(body.key),
    };
  }
}
