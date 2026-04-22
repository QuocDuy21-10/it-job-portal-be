import { Injectable, Logger } from '@nestjs/common';
import { ResumeRepository } from '../repositories/resume.repository';
import { NotificationsService } from 'src/notifications/notifications.service';
import { ApplicationNotificationQueueService } from 'src/queues/services/application-notification-queue.service';
import { ENotificationType } from 'src/notifications/enums/notification-type.enum';
import { IUser } from 'src/users/user.interface';

@Injectable()
export class ApplicationNotificationService {
  private readonly logger = new Logger(ApplicationNotificationService.name);

  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly notificationsService: NotificationsService,
    private readonly applicationNotificationQueueService: ApplicationNotificationQueueService,
  ) {}

  async notifyHrNewApplication(
    resumeId: string,
    jobName: string,
    companyName: string,
    companyId: string,
    candidateName: string,
    candidateEmail: string,
  ): Promise<void> {
    this.logger.log(
      `Notifying HR for new application: resumeId=${resumeId}, companyId=${companyId}, jobName=${jobName}`,
    );

    const hrUsers = await this.resumeRepository.findHrUsersByCompany(companyId);

    if (hrUsers.length === 0) {
      this.logger.warn(`No HR users found for company ${companyId} — no notifications sent`);
      return;
    }

    await Promise.all(
      hrUsers.map(async hr => {
        await this.notificationsService
          .create({
            userId: hr._id.toString(),
            type: ENotificationType.NEW_APPLICATION,
            title: 'New Application Received',
            message: `${candidateName} (${candidateEmail}) has applied for "${jobName}".`,
            data: { resumeId, jobName, companyName, candidateName, candidateEmail },
          })
          .catch(err =>
            this.logger.error(`Failed to notify HR ${hr.email} in-app: ${err.message}`),
          );

        await this.applicationNotificationQueueService
          .addNewApplicationEmail({
            hrEmail: hr.email,
            hrName: hr.name || hr.email,
            candidateName,
            candidateEmail,
            jobName,
            companyName,
            resumeId,
          })
          .catch(err =>
            this.logger.error(`Failed to queue email for HR ${hr.email}: ${err.message}`),
          );
      }),
    );
  }

  // Notify the candidate when an HR user changes their application status
  async sendStatusChangeNotification(
    resumeId: string,
    newStatus: string,
    updatedBy: Pick<IUser, '_id' | 'email'>,
  ): Promise<void> {
    const resume = await this.resumeRepository.findByIdWithPopulate(resumeId);
    if (!resume) return;

    const jobName = (resume.jobId as any)?.name || 'Unknown Job';
    const companyName = (resume.companyId as any)?.name || 'Unknown Company';

    await this.notificationsService.create(
      {
        userId: resume.userId.toString(),
        type: ENotificationType.APPLICATION_STATUS_CHANGE,
        title: 'Application Status Updated',
        message: `Your application for "${jobName}" at ${companyName} has been updated to ${newStatus}.`,
        data: {
          resumeId,
          jobId: resume.jobId?.toString(),
          companyId: resume.companyId?.toString(),
          newStatus,
          jobName,
          companyName,
        },
      },
      { _id: updatedBy._id, email: updatedBy.email },
    );

    // Non-blocking: email is best-effort
    this.applicationNotificationQueueService
      .addStatusUpdateEmail({
        userName: resume.email,
        userEmail: resume.email,
        jobName,
        companyName,
        newStatus,
        resumeId,
      })
      .catch(err =>
        this.logger.error(
          `Failed to queue status-change email for resumeId=${resumeId}: ${err.message}`,
        ),
      );
  }
}
