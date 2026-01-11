import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Controller('admin/users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    async findAll(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('role') role?: 'admin' | 'user',
        @Query('status') status?: 'active' | 'inactive',
    ) {
        const pageNum = parseInt(page || '1');
        const limitNum = parseInt(limit || '20');
        return this.usersService.findAll(pageNum, limitNum, { role, status });
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const user = await this.usersService.findOne(id);
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
        return user;
    }

    @Post()
    async create(@Body() createUserDto: CreateUserDto) {
        return this.usersService.create(createUserDto);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
        const user = await this.usersService.update(id, updateUserDto);
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
        return user;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        const success = await this.usersService.remove(id);
        if (!success) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
        return { success: true, message: 'User deleted successfully' };
    }
}
