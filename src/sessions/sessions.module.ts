import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionsService } from './sessions.service';
import { Session, SessionSchema } from './schemas/session.schema';

/**
 * Sessions Module - Module quản lý refresh token sessions
 * Export SessionsService để AuthModule có thể sử dụng
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Session.name,
        schema: SessionSchema,
      },
    ]),
  ],
  providers: [SessionsService],
  exports: [SessionsService], // Export để các module khác có thể sử dụng
})
export class SessionsModule {}
