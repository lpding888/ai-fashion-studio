import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TranslationService {
  private logger = new Logger(TranslationService.name);

  /**
   * 翻译文本到中文
   * @param text 需要翻译的英文文本
   * @param model Gemini 模型名称
   * @param apiKey API密钥
   * @param gateway API网关地址
   */
  async translateToZH(
    text: string,
    model: string,
    apiKey: string,
    gateway: string = 'https://api.vectorengine.ai/v1',
  ): Promise<string> {
    if (!text || text.trim().length === 0) {
      return text;
    }

    // 检测是否已经是中文（简单检测）
    if (this.isChinese(text)) {
      this.logger.log('文本已经是中文，跳过翻译');
      return text;
    }

    try {
      this.logger.log(`翻译文本，长度: ${text.length} 字符`);

      // 构建翻译 prompt
      const translationPrompt = `请将以下英文文本翻译成简体中文。
要求：
1. 保持原文的格式和结构（如 Markdown 格式、换行等）
2. 翻译要准确、流畅、符合中文表达习惯
3. 专业术语保持专业性
4. 不要添加任何额外的解释或注释
5. 只返回翻译后的中文文本

原文：
${text}

翻译：`;

      // Normalize gateway URL
      let normalizedGateway = gateway.replace(/\/+$/, '');
      if (!normalizedGateway.match(/\/v1(beta)?$/)) {
        normalizedGateway = `${normalizedGateway}/v1`;
      }

      const endpoint = `${normalizedGateway}/models/${model}:generateContent?key=${apiKey}`;

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: translationPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3, // 低温度保证翻译稳定性
          maxOutputTokens: 8192,
        },
      };

      const response = await axios.post(endpoint, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      const candidate = response.data?.candidates?.[0];
      if (!candidate) {
        throw new Error('翻译响应无效');
      }

      const translatedText = candidate.content?.parts?.[0]?.text || '';

      if (!translatedText) {
        this.logger.warn('翻译结果为空，返回原文');
        return text;
      }

      this.logger.log(`✅ 翻译完成，长度: ${translatedText.length} 字符`);
      return translatedText.trim();
    } catch (error) {
      this.logger.error('翻译失败，返回原文', error.message);
      return text; // 翻译失败时返回原文
    }
  }

  /**
   * 批量翻译多段文本
   * @param texts 文本数组
   * @param model Gemini 模型
   * @param apiKey API密钥
   * @param gateway API网关
   */
  async translateBatch(
    texts: string[],
    model: string,
    apiKey: string,
    gateway?: string,
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    // 将多段文本合并，用分隔符分开
    const separator = '\n---TRANSLATION_SEPARATOR---\n';
    const combinedText = texts.join(separator);

    const translated = await this.translateToZH(
      combinedText,
      model,
      apiKey,
      gateway,
    );

    // 分割翻译结果
    const translatedTexts = translated.split(separator);

    // 确保返回数组长度一致
    if (translatedTexts.length !== texts.length) {
      this.logger.warn('批量翻译结果数量不匹配，逐个翻译');
      // 降级为逐个翻译
      const results: string[] = [];
      for (const text of texts) {
        const result = await this.translateToZH(text, model, apiKey, gateway);
        results.push(result);
      }
      return results;
    }

    return translatedTexts;
  }

  /**
   * 简单检测文本是否主要为中文
   */
  private isChinese(text: string): boolean {
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
    const totalChars = text.replace(/\s/g, '').length;

    if (totalChars === 0) return false;

    const chineseRatio = (chineseChars?.length || 0) / totalChars;
    return chineseRatio > 0.3; // 如果30%以上是中文字符，认为是中文
  }
}
