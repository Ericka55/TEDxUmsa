import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from './admin.guard';
import { EventsService } from './events.service';
import { CollaboratorGuard } from './collaborator.guard';
import { AdminOnlyGuard } from './admin-only.guard';
import { CollaboratorDto, ConfigureHallDto, EventDto, RegistrationDto, SatisfactionDto } from './dto';

@ApiTags('Eventos y formularios')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  listPublic() {
    return this.events.listPublic();
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  @ApiCookieAuth('tedxumsa_session')
  listAdmin(@Req() request: { user: { id: string; role: string } }) {
    return this.events.listAdmin(request.user);
  }

  @Get('collaborator')
  @UseGuards(CollaboratorGuard)
  @ApiCookieAuth('tedxumsa_session')
  listCollaboratorEvents(@Req() request: { collaboratorId: string }) {
    return this.events.listCollaboratorEvents(request.collaboratorId);
  }

  @Get('admin/:eventId/collaborators')
  @UseGuards(AdminGuard)
  @ApiCookieAuth('tedxumsa_session')
  listCollaborators(@Param('eventId') eventId: string) {
    return this.events.listCollaborators(eventId);
  }

  @Post('admin/:eventId/collaborators')
  @UseGuards(AdminGuard)
  @ApiCookieAuth('tedxumsa_session')
  createCollaborator(@Param('eventId') eventId: string, @Body() body: CollaboratorDto, @Req() request: { user: { role: string } }) {
    return this.events.createCollaborator(eventId, body as unknown as Record<string, unknown>, request.user.role);
  }

  @Delete('admin/:eventId/collaborators/:userId')
  @UseGuards(AdminGuard)
  @ApiCookieAuth('tedxumsa_session')
  removeCollaborator(@Param('eventId') eventId: string, @Param('userId') userId: string) {
    return this.events.removeCollaborator(eventId, userId);
  }

  @Post('admin/:eventId/close')
  @UseGuards(AdminGuard)
  @ApiCookieAuth('tedxumsa_session')
  closeEvent(@Param('eventId') eventId: string) {
    return this.events.closeEvent(eventId);
  }

  @Get('admin/:eventId/satisfaction')
  @UseGuards(AdminGuard)
  @ApiCookieAuth('tedxumsa_session')
  satisfactionReport(@Param('eventId') eventId: string) {
    return this.events.getSatisfactionReport(eventId);
  }

  @Get('satisfaction/:token')
  getSatisfactionSurvey(@Param('token') token: string) {
    return this.events.getSatisfactionSurvey(token);
  }

  @Post('satisfaction/:token')
  submitSatisfactionSurvey(@Param('token') token: string, @Body() body: SatisfactionDto) {
    return this.events.submitSatisfactionSurvey(token, body as unknown as Record<string, unknown>);
  }

  @Get('admin/:eventId/registrations')
  @UseGuards(AdminGuard)
  @ApiCookieAuth('tedxumsa_session')
  listRegistrations(@Param('eventId') eventId: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.events.listRegistrations(eventId, page, pageSize);
  }

  @Patch('admin/:eventId/hall')
  @UseGuards(AdminOnlyGuard)
  @ApiCookieAuth('tedxumsa_session')
  configureHall(@Param('eventId') eventId: string, @Body() body: ConfigureHallDto) {
    return this.events.configureHall(eventId, body as unknown as Record<string, unknown>);
  }

  @Patch('admin/:eventId')
  @UseGuards(AdminOnlyGuard)
  @ApiCookieAuth('tedxumsa_session')
  updateEvent(@Param('eventId') eventId: string, @Body() body: EventDto) {
    return this.events.updateEvent(eventId, body as unknown as Record<string, unknown>);
  }

  @Delete('admin/:eventId')
  @UseGuards(AdminOnlyGuard)
  @ApiCookieAuth('tedxumsa_session')
  deleteEvent(@Param('eventId') eventId: string) {
    return this.events.deleteEventPermanently(eventId);
  }

  @Post('admin/:eventId/registrations/:confirmationCode/check-in')
  @UseGuards(AdminGuard)
  @ApiCookieAuth('tedxumsa_session')
  checkIn(@Param('eventId') eventId: string, @Param('confirmationCode') confirmationCode: string) {
    return this.events.checkIn(eventId, confirmationCode);
  }

  @Post('collaborator/:eventId/check-in/:confirmationCode')
  @UseGuards(CollaboratorGuard)
  @ApiCookieAuth('tedxumsa_session')
  collaboratorCheckIn(@Param('eventId') eventId: string, @Param('confirmationCode') confirmationCode: string, @Req() request: { collaboratorId: string }) {
    return this.events.checkIn(eventId, confirmationCode, request.collaboratorId);
  }

  @Post()
  @UseGuards(AdminOnlyGuard)
  @ApiCookieAuth('tedxumsa_session')
  create(@Body() body: EventDto) {
    return this.events.create(body as unknown as Record<string, unknown>);
  }

  @Get(':slug/registrations/:confirmationCode')
  getRegistrationPass(@Param('slug') slug: string, @Param('confirmationCode') confirmationCode: string) {
    return this.events.getRegistrationPass(slug, confirmationCode);
  }

  @Get(':slug')
  getPublic(@Param('slug') slug: string) {
    return this.events.findPublic(slug);
  }

  @Post(':slug/registrations')
  register(@Param('slug') slug: string, @Body() body: RegistrationDto) {
    return this.events.register(slug, body as unknown as Record<string, unknown>);
  }
}
