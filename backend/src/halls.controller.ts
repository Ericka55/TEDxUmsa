import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnlyGuard } from './admin-only.guard';
import { HallsService } from './halls.service';
import { HallDto } from './dto';

@ApiTags('Salones')
@Controller('halls')
@UseGuards(AdminOnlyGuard)
@ApiCookieAuth('tedxumsa_session')
export class HallsController {
  constructor(private readonly halls: HallsService) {}

  @Get()
  list() { return this.halls.list(); }

  @Post()
  create(@Body() body: HallDto) { return this.halls.create(body as unknown as Record<string, unknown>); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: HallDto) { return this.halls.update(id, body as unknown as Record<string, unknown>); }
}
