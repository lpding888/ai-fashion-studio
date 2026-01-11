import {
  Controller,
  Get,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('test-connection')
  async testConnection(
    @Body() body: { gateway: string; apiKey: string; model?: string },
  ) {
    const axios = require('axios');

    // Clean up gateway URL
    const gateway = body.gateway.replace(/\/$/, '');
    const model = body.model || 'gemini-2.0-flash-exp';

    // Create a custom axios instance WITHOUT Authorization header
    // Google Native format uses key in URL query parameter
    const client = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    try {
      // Ensure we use v1beta for Google Native
      let baseUrl = gateway;
      if (baseUrl.endsWith('/v1')) {
        baseUrl = baseUrl.replace('/v1', '/v1beta');
      } else if (!baseUrl.includes('/v1beta')) {
        baseUrl = baseUrl.replace(/\/$/, '') + '/v1beta';
      }

      const endpoint = `${baseUrl}/models/${model}:generateContent?key=${body.apiKey}`;
      console.log(
        `[Test] Calling: ${endpoint.replace(body.apiKey, 'API_KEY')}`,
      );

      // Minimal payload with Safety Settings
      const payload = {
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: { maxOutputTokens: 100 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_NONE',
          },
        ],
      };

      // Use URL Key authentication (no Authorization header)
      const response = await client.post(endpoint, payload);

      if (response.data.candidates || response.data.promptFeedback) {
        return { status: 'ok', message: '连接成功！' };
      }

      throw new Error('No valid response from API');
    } catch (e: any) {
      console.error(
        '[Test] Connection Error:',
        e.response?.status,
        e.response?.data || e.message,
      );

      let errorMsg = '';
      const status = e.response?.status;
      const responseData = e.response?.data;

      if (status === 401) {
        errorMsg = 'API Key 无效 (401)';
      } else if (status === 403) {
        errorMsg = '访问被拒绝 (403)';
      } else if (status === 404) {
        errorMsg = `接口或模型不存在 (404)`;
      } else if (status === 429) {
        errorMsg = '上游服务拥堵 (429)，请尝试切换模型 (如 gemini-1.5-flash)';
        if (responseData && responseData.error && responseData.error.message) {
          errorMsg += `: ${responseData.error.message}`;
        }
      } else if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
        errorMsg = '连接超时，请检查网络';
      } else if (e.code === 'ENOTFOUND') {
        errorMsg = '无法解析域名，请检查网关地址';
      } else {
        errorMsg = responseData?.error?.message || e.message || '未知错误';
      }

      throw new HttpException(errorMsg, HttpStatus.BAD_REQUEST);
    }
  }
}
