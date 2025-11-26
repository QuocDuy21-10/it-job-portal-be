import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { ResponseMessage, SkipCheckPermission, User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Subscriber')
@Controller('subscribers')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @Post()
  @ResponseMessage('Create a subscriber')
  @SkipCheckPermission()
  @ApiOperation({
    summary: 'Create a new subscriber',
    description:
      'Creates a new subscriber with the provided information. No authentication required.',
  })
  create(@Body() createSubscriberDto: CreateSubscriberDto, @User() user: IUser) {
    return this.subscribersService.create(createSubscriberDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Fetch subscribers with paginate',
    description: 'Retrieves a paginated list of all subscribers. Supports filtering and sorting.',
  })
  @ResponseMessage('Fetch subscribers with paginate')
  findAll(@Query('page') page: string, @Query('limit') limit: string, @Query() query: string) {
    return this.subscribersService.findAll(+page, +limit, query);
  }



  @Patch()
  @ApiOperation({
    summary: 'Update a subscriber',
    description:
      'Updates an existing subscriber. Only the fields provided will be updated. Requires authentication.',
  })
  @SkipCheckPermission()
  @ResponseMessage('Update a subscriber')
  update(@Body() updateSubscriberDto: UpdateSubscriberDto, @User() user: IUser) {
    return this.subscribersService.update(updateSubscriberDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a subscriber',
    description:
      'Soft deletes a subscriber. The subscriber will be marked as deleted but not removed from database. Requires authentication.',
  })
  @SkipCheckPermission()
  @ResponseMessage('Delete a subscriber')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.subscribersService.remove(id, user);
  }

  @Post('skills')
  @ApiOperation({
    summary: 'Get subscriber skills by email',
    description: 'Retrieves the skills associated with the authenticated subscriber.',
  })
  @ResponseMessage('Get subscriber skills by email')
  @SkipCheckPermission()
  getUserSkills(@User() user: IUser) {
    return this.subscribersService.getUserSkills(user);
  }

  @Get('by-user')
  @ApiOperation({
    summary: 'Get my subscriptions',
    description: 'Retrieves all active subscriptions of the authenticated user.',
  })
  @ResponseMessage('Fetch my subscriptions')
  @SkipCheckPermission()
  getMySubscriptions(@User() user: IUser) {
    return this.subscribersService.getMySubscriptions(user);
  }

  @Get(':id')
  @SkipCheckPermission()
  @ApiOperation({
    summary: 'Fetch subscriber by id',
    description: 'Retrieves detailed information about a specific subscriber by its ID',
  })
  @ResponseMessage('Fetch subscriber by id')
  findOne(@Param('id') id: string) {
    return this.subscribersService.findOne(id);
  }
}
