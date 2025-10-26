import { Controller, Get } from '@nestjs/common';
import { MailService } from './mail.service';
import { Public, ResponseMessage } from 'src/decorator/customize';
import { MailerService } from '@nestjs-modules/mailer';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { Subscriber, SubscriberDocument } from 'src/subscribers/schemas/subscriber.schema';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { InjectModel } from '@nestjs/mongoose';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Cron } from '@nestjs/schedule';

@ApiTags('Mail')
@Controller('mail')
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly mailerService: MailerService,
    @InjectModel(Subscriber.name) private subscriberModel: SoftDeleteModel<SubscriberDocument>,
    @InjectModel(Job.name) private jobModel: SoftDeleteModel<JobDocument>,
  ) {}
  @Get()
  @Public()
  @ApiOperation({
    summary: 'Gửi email',
    description: 'Gửi email giới thiệu việc làm tới tất cả người đăng ký dựa trên kỹ năng của họ.',
  })
  @ResponseMessage('Send email')
  @Cron('0 0 0 * * 0') // 0h0m0s (every sunday)
  async handleTestEmail() {
    const subscribers = await this.subscriberModel.find({});
    for (const subs of subscribers) {
      const subsSkills = subs.skills;
      const jobWithMatchingSkills = await this.jobModel.find({ skills: { $in: subsSkills } });
      if (jobWithMatchingSkills?.length > 0) {
        const jobs = jobWithMatchingSkills.map(job => {
          return {
            name: job.name,
            company: job.company.name,
            salary: `${job.salary}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' đ',
            skills: job.skills,
          };
        });
        await this.mailerService.sendMail({
          to: subs.email,
          from: '"Support Team" <support@example.com>',
          subject: 'job for you',
          template: 'job',
          context: {
            receiver: subs.name,
            jobs: jobs,
          },
        });
      }

      //build template
    }
  }
}
