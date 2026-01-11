
import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { StyleAgent } from './style-agent';
import { DbModule } from '../db/db.module';

@Module({
    imports: [DbModule],
    controllers: [McpController],
    providers: [StyleAgent],
    exports: [StyleAgent]
})
export class McpModule { }
