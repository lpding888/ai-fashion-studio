import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserDbService } from '../db/user-db.service';
import { JwtGuard } from './guards/jwt.guard';

@Module({
    controllers: [AuthController],
    providers: [
        AuthService,
        UserDbService,
        {
            provide: APP_GUARD,
            useClass: JwtGuard,
        },
    ],
    exports: [AuthService, UserDbService]
})
export class AuthModule { }
