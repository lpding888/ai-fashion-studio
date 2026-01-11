
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class PrismaService implements OnModuleInit {
    async onModuleInit() {
        // Mock connect
        console.log('Mock Prisma Connected');
    }
}
