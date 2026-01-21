import { Controller, Post, Body, Logger } from '@nestjs/common';
import { CosService } from './cos.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';

@Controller('cos')
export class CosController {
  private logger = new Logger(CosController.name);

  constructor(private cosService: CosService) {}

  /**
   * 获取上传临时密钥
   * POST /api/cos/credentials
   */
  @Post('credentials')
  async getCredentials(
    @CurrentUser() user: UserModel,
    @Body() _body: { userId?: string } = {},
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
  getImageUrl(
    @Body()
    body: {
      key: string;
      format?: 'webp' | 'avif' | 'heif';
      quality?: number;
      width?: number;
    },
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
  getOptimizedUrl(@Body() body: { key: string }) {
    return {
      url: this.cosService.getOptimizedUrl(body.key),
    };
  }
}
