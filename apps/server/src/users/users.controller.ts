import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { AdminUser, AuthUser } from '@rbac/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@RequirePermission('user:manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<AdminUser[]> {
    return this.users.list();
  }

  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<AdminUser> {
    return this.users.create(dto, actor, ip);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<AdminUser> {
    return this.users.update(id, dto, actor, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<void> {
    return this.users.remove(id, actor, ip);
  }
}
