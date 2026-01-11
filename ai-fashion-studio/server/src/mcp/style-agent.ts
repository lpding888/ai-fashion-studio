
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { DbService } from '../db/db.service';
import { Request, Response } from 'express';

@Injectable()
export class StyleAgent implements OnModuleInit {
    private logger = new Logger(StyleAgent.name);
    public server: McpServer;
    public transport: SSEServerTransport;

    constructor(private db: DbService) {
        this.server = new McpServer({
            name: "Fashion-Style-Agent",
            version: "1.0.0"
        });

        // Initialize SSE transport path
        // Transport will be managed by Controller
        this.transport = undefined;
        // Note: NestJS manages response differently, we will attach manually in Controller
        // Actually, we use a slightly different pattern for NestJS + MCP SDK generally. 
        // We will create a fresh transport per connection? No, ModelContextProtocol SDK 
        // usually assumes one server instance.
        // For SSE, we usually need the `transport` to handle the connection.
        // Let's stick to the official SDK pattern: 
        // We don't instantiate transport here if we want to handle it in controller per request?
        // Wait, standardized MCP over SSE usually has one long-lived server but multiple transports?
        // The SDK might be designed for single-transport per server instance slightly.
        // Let's try to keep it simple: 
        // We will create the server here, and in the controller we will Create a NEW Transport for each connection 
        // and connect it to the server? 
        // 
        // Actually, looking at SDK docs (simulated):
        // server.connect(transport);

        // Let's modify the design slightly: 
        // The McpServer logic (Tools) is constant.
        // The Transport is per-connection.
        // BUT the SDK `McpServer` class might manage the connection state.
        // If we want to support multiple clients, we might need to handle that.
        // 
        // For now, let's register tools on `this.server`.
        // And regarding transport, we will instantiate `new SSEServerTransport` in the controller 
        // and confirm IF `this.server` supports multiple concurrent connections.
        // If `this.server` is single-client, we might need to create a `new McpServer` per request 
        // or look deeper. 
        // 
        // Given this is a local desktop app agent integration, single connection is likely okay for now,
        // but creating a new Server instance per connection is safer for statelessness.

        // REVAMPED PLAN: 
        // We will NOT instantiate `this.server` in constructor as a singleton if it holds state.
        // Actually, tools are stateless.
        // Let's register tools on a "Blueprint" or just helper method.

        // However, to keep it simple and standard:
        // Let's define the tools here.
    }

    onModuleInit() {
        this.registerTools();
    }

    private registerTools() {
        this.server.tool(
            "search_styles",
            { query: z.string().describe("Style keywords (e.g. 'cyberpunk', 'vintage', 'rainy')") },
            async ({ query }) => {
                this.logger.log(`🔍 MCP Tool performing search_styles: "${query}"`);

                const allStyles = await this.db.getAllStylePresets();

                // Simple fuzzy search
                const lowerQuery = query.toLowerCase();
                const matches = allStyles.filter(s =>
                    s.name.toLowerCase().includes(lowerQuery) ||
                    s.tags?.some(t => t.toLowerCase().includes(lowerQuery)) ||
                    s.description?.toLowerCase().includes(lowerQuery) ||
                    // Search in analysis fields too for better recall!
                    s.analysis?.vibe?.toLowerCase().includes(lowerQuery) ||
                    s.analysis?.scene?.toLowerCase().includes(lowerQuery) ||
                    s.analysis?.grading?.toLowerCase().includes(lowerQuery)
                );

                // Limit results to avoid token overflow
                const topResults = matches.slice(0, 5).map(s => ({
                    id: s.id,
                    name: s.name,
                    description: s.description,
                    tags: s.tags,
                    // Return key visual analysis cues to help Agent decide
                    analysis_summary: s.analysis ?
                        `Lighting: ${s.analysis.lighting}, Vibe: ${s.analysis.vibe}` : "No detailed analysis"
                }));

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(topResults, null, 2)
                    }]
                };
            }
        );

        this.server.tool(
            "get_style_details",
            { style_id: z.string().describe("The ID of the style preset to retrieve") },
            async ({ style_id }) => {
                this.logger.log(`📖 MCP Tool performing get_style_details: "${style_id}"`);

                const style = await this.db.getStylePreset(style_id);
                if (!style) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Style with ID ${style_id} not found.` }]
                    };
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(style, null, 2)
                    }]
                };
            }
        );

        this.server.tool(
            "create_image_task",
            {
                style_id: z.string().describe("Selected style ID"),
                prompt: z.string().describe("Final generated prompt (English)"),
                shot_count: z.number().default(1),
                aspect_ratio: z.enum(['1:1', '3:4', '16:9']).default('3:4')
            },
            async (args) => {
                // For now, we return a "Configuration Object" that the Frontend/User will confirm.
                // We do NOT create the task directly in DB yet, because we need User Approval UI.
                // The Agent will display this config to the user.

                this.logger.log(`📝 MCP Tool proposing task creation: ${args.style_id}`);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            action: "PROPOSE_TASK",
                            configuration: args,
                            status: "WAITING_USER_CONFIRMATION"
                        })
                    }]
                };
            }
        );

        this.logger.log("✅ MCP Tools registered: search_styles, get_style_details, create_image_task");
    }
}
