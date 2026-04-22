import { Module } from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import { SubscribersController } from './subscribers.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Subscriber, SubscriberSchema } from './schemas/subscriber.schema';
import { SubscribersRepository } from './repositories/subscribers.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: Subscriber.name, schema: SubscriberSchema }])],
  controllers: [SubscribersController],
  providers: [SubscribersService, SubscribersRepository],
})
export class SubscribersModule {}
