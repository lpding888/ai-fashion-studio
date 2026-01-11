import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { User } from '../db/models';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
    constructor(private db: DbService) { }

    async findAll(
        page: number = 1,
        limit: number = 20,
        filters?: { role?: 'admin' | 'user'; status?: 'active' | 'inactive' }
    ) {
        let users = await this.db.getAllUsers();

        // Apply filters
        if (filters?.role) {
            users = users.filter(u => u.role === filters.role);
        }
        if (filters?.status) {
            users = users.filter(u => u.status === filters.status);
        }

        // Sort by creation time (newest first)
        users.sort((a, b) => b.createdAt - a.createdAt);

        // Pagination
        const start = (page - 1) * limit;
        const end = start + limit;
        const paginatedUsers = users.slice(start, end);

        return {
            users: paginatedUsers,
            total: users.length,
            page,
            limit,
            totalPages: Math.ceil(users.length / limit)
        };
    }

    async findOne(id: string): Promise<User | null> {
        return this.db.getUser(id);
    }

    async create(createUserDto: CreateUserDto): Promise<User> {
        const newUser: User = {
            id: crypto.randomUUID(),
            username: createUserDto.username,
            email: createUserDto.email,
            role: createUserDto.role,
            avatar: createUserDto.avatar,
            credits: 0,           // 新用户默认0积分
            totalTasks: 0,        // 新用户默认0任务
            status: createUserDto.status || 'active',
            createdAt: Date.now(),
        };

        return this.db.saveUser(newUser);
    }

    async update(id: string, updateUserDto: UpdateUserDto): Promise<User | null> {
        return this.db.updateUser(id, updateUserDto);
    }

    async remove(id: string): Promise<boolean> {
        return this.db.deleteUser(id);
    }
}
