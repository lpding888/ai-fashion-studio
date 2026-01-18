import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type PromptSnippetDto = {
  id: string;
  name?: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};

@Injectable()
export class PromptSnippetService {
  constructor(private readonly prisma: PrismaService) { }

  private mapSnippet(row: {
    id: string;
    name: string | null;
    text: string;
    createdAt: Date;
    updatedAt: Date;
  }): PromptSnippetDto {
    return {
      id: row.id,
      name: row.name ?? undefined,
      text: row.text,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  async listByUser(userId: string): Promise<PromptSnippetDto[]> {
    const rows = await this.prisma.promptSnippet.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.mapSnippet(row));
  }

  async createSnippet(userId: string, input: { name?: string; text: string }): Promise<PromptSnippetDto> {
    const name = input.name?.trim();
    const row = await this.prisma.promptSnippet.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        name: name ? name : null,
        text: input.text.trim(),
      },
    });
    return this.mapSnippet(row);
  }

  async deleteSnippet(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.promptSnippet.deleteMany({
      where: {
        id,
        userId,
      },
    });
    return result.count > 0;
  }
}
