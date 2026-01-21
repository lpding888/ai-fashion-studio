import { Test, TestingModule } from '@nestjs/testing';
import { PainterService } from './painter.service';
import { CosService } from '../cos/cos.service';
import { Readable } from 'stream';
import { DbService } from '../db/db.service';

describe('PainterService', () => {
  let service: PainterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PainterService,
        {
          provide: CosService,
          useValue: {
            isEnabled: jest.fn(() => true),
            getImageUrl: jest.fn(
              (key: string) => `https://cos.example.com/${key}`,
            ),
            uploadFile: jest.fn(),
          },
        },
        {
          provide: DbService,
          useValue: {
            getTask: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PainterService>(PainterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should parse SSE multi-line data events and resolve image', async () => {
    const base64 = Buffer.from('png-bytes').toString('base64');
    const json = JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: base64,
                },
              },
            ],
          },
        },
      ],
    });

    const splitAt = Math.floor(json.length / 2);
    const stream = new Readable({ read() {} });
    stream.push(`event: message\n`);
    stream.push(`data: ${json.slice(0, splitAt)}\n`);
    stream.push(`data: ${json.slice(splitAt)}\n`);
    stream.push(`\n`);
    stream.push(null);

    const onJson = async (obj: any) => {
      const imageData = obj?.candidates?.[0]?.content?.parts?.[0]?.inline_data;
      if (!imageData) return null;
      return { base64Data: imageData.data, mimeType: imageData.mime_type };
    };

    const result = await (service as any).readGeminiStreamForImage(
      stream,
      onJson,
    );
    expect(result.base64Data).toBe(base64);
    expect(result.mimeType).toBe('image/png');
  });

  it('should parse NDJSON lines and resolve image', async () => {
    const base64 = Buffer.from('jpg-bytes').toString('base64');
    const line = JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64,
                },
              },
            ],
          },
        },
      ],
    });

    const stream = new Readable({ read() {} });
    stream.push(`${line}\n`);
    stream.push(null);

    const onJson = async (obj: any) => {
      const imageData = obj?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!imageData) return null;
      return { base64Data: imageData.data, mimeType: imageData.mimeType };
    };

    const result = await (service as any).readGeminiStreamForImage(
      stream,
      onJson,
    );
    expect(result.base64Data).toBe(base64);
    expect(result.mimeType).toBe('image/jpeg');
  });
});
