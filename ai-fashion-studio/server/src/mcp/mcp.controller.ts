
import { Controller, Get, Post, Body, Res, Req, Query } from '@nestjs/common';
import type { Response, Request } from 'express';
import { StyleAgent } from './style-agent';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

@Controller('admin/mcp')
export class McpController {
    constructor(private styleAgent: StyleAgent) { }

    @Get('sse')
    async handleSse(@Res() res: Response) {
        // Create a new transport for this connection
        // The endpoint "/api/mcp/messages" is where the client (Cursor/Gemini) sends POST messages
        const transport = new SSEServerTransport("/api/admin/mcp/messages", res);

        // Connect the shared server to this transport
        // Note: Ideally we want a new server instance per connection to avoid crossed wires 
        // if SDK keeps state. But for tools, it should be fine.
        await this.styleAgent.server.connect(transport);

        // The transport handles the response lifecycle (headers, keep-alive)
        // We just need to ensure NestJS doesn't close it prematurely?
        // Usually `res` is handled by transport.start() logic inside connect()
    }

    @Post('messages')
    async handleMessages(@Req() req: Request, @Res() res: Response) {
        // This endpoint handles the POST messages from the client
        // We need to route this to the active transport?
        // Wait, SSEServerTransport logic is: 
        // The GET /sse establishes the channel.
        // The POST /messages receives commands.
        // The Transport instance needs to receive this POST body.

        // PROBLEM: We can't easily access the *specific* transport instance created in GET /sse 
        // because HTTP is stateless. 
        // The SDK's SSEServerTransport typically handles this by internal memory or expecting
        // us to map sessionId.

        // However, checking the SDK implementation (common pattern):
        // Usually, `handlePostMessage` is a method on the transport.
        // We need a way to store transports.

        // TEMPORARY SOLUTION for Single Client (Development):
        // We assume the last created transport is the active one, or we define it in the Service.
        // 
        // BETTER SOLUTION:
        // We should move transport management to the Service.

        // Let's rely on the service to handle the message.
        // But the service defined `transport` property as a single standard.
        // Let's pass the handling to the service.

        // For now, I'll implement a simple map in the Controller or Service to track transports if needed.
        // But for this step, let's look at `style-agent.ts`: I defined `public transport`.
        // I will use that for now (Single User Mode).

        const transport = this.styleAgent.transport;
        if (!transport) {
            res.status(500).send("No active transport");
            return;
        }

        await transport.handlePostMessage(req, res);
    }
}
