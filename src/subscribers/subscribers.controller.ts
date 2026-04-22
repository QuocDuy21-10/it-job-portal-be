import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { GetSubscribersQueryDto } from './dto/get-subscribers-query.dto';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { IUser } from 'src/users/user.interface';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Subscriber')
@Controller('subscribers')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @Post()
  @ResponseMessage('Create a subscriber')
  @ApiOperation({
    summary: 'Create a new subscriber',
    description:
      'Creates a new job-alert subscription for the authenticated user. Email is derived from the authenticated user and cannot be overridden.',
  })
  create(@Body() createSubscriberDto: CreateSubscriberDto, @User() user: IUser) {
    return this.subscribersService.create(createSubscriberDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Fetch my subscriptions with pagination',
    description:
      "Retrieves a paginated list of the authenticated user's subscriptions. Supports filtering by location and skill.",
  })
  @ResponseMessage('Fetch subscribers with paginate')
  findAll(@Query() query: GetSubscribersQueryDto, @User() user: IUser) {
    return this.subscribersService.findAll(query.page, query.limit, query, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a subscription by ID',
    description:
      'Updates a subscription owned by the authenticated user. Only the fields provided will be updated. Email cannot be changed.',
  })
  @ResponseMessage('Update a subscriber')
  update(
    @Param('id') id: string,
    @Body() updateSubscriberDto: UpdateSubscriberDto,
    @User() user: IUser,
  ) {
    return this.subscribersService.update(id, updateSubscriberDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a subscription by ID',
    description:
      'Soft deletes a subscription owned by the authenticated user. The record is marked as deleted but not removed from the database.',
  })
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
  getUserSkills(@User() user: IUser) {
    return this.subscribersService.getUserSkills(user);
  }

  @Get('by-user')
  @ApiOperation({
    summary: 'Get my subscriptions (alias)',
    description: 'Retrieves all active subscriptions of the authenticated user.',
  })
  @ResponseMessage('Fetch my subscriptions')
  getMySubscriptions(@User() user: IUser) {
    return this.subscribersService.getMySubscriptions(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Fetch my subscription by ID',
    description:
      'Retrieves detailed information about a specific subscription owned by the authenticated user.',
  })
  @ResponseMessage('Fetch subscriber by id')
  findOne(@Param('id') id: string, @User() user: IUser) {
    return this.subscribersService.findOne(id, user);
  }
}
