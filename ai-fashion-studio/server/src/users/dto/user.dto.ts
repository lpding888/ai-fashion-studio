export class CreateUserDto {
    username: string;
    email: string;
    role: 'admin' | 'user';
    avatar?: string;
    status?: 'active' | 'inactive';
}

export class UpdateUserDto {
    username?: string;
    email?: string;
    role?: 'admin' | 'user';
    avatar?: string;
    status?: 'active' | 'inactive';
}
