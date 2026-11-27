import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthController } from './auth.controller';
import { EventsController } from './events.controller';
import { DatabaseModule } from './database.module';
import { AuthService } from './auth.service';
import { AdminGuard } from './admin.guard';
import { EventsService } from './events.service';
import { HallsController } from './halls.controller';
import { HallsService } from './halls.service';
import { CollaboratorGuard } from './collaborator.guard';
import { AdminOnlyGuard } from './admin-only.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AppController, AuthController, EventsController, HallsController],
  providers: [AuthService, AdminGuard, AdminOnlyGuard, CollaboratorGuard, EventsService, HallsService],
})
export class AppModule {}
