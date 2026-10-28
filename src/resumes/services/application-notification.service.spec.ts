import { Test, TestingModule } from '@nestjs/testing';
import mongoose from 'mongoose';
import { ApplicationNotificationService } from './application-notification.service';
import { ResumeRepository } from '../repositories/resume.repository';
import { NotificationsService } from 'src/notifications/notifications.service';
import { ENotificationType } from 'src/notifications/enums/notification-type.enum';
import { ApplicationNotificationQueueService } from 'src/queues/services/application-notification-queue.service';

describe('ApplicationNotificationService', () => {
  let service: ApplicationNotificationService;
  let mockResumeRepository: { findHrUsersByCompany: jest.Mock };
  let mockNotificationsService: { create: jest.Mock };
  let mockQueueService: { addNewApplicationEmail: jest.Mock };

  beforeEach(async () => {
    mockResumeRepository = { findHrUsersByCompany: jest.fn() };
    mockNotificationsService = { create: jest.fn().mockResolvedValue({}) };
    mockQueueService = { addNewApplicationEmail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationNotificationService,
        { provide: ResumeRepository, useValue: mockResumeRepository },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: ApplicationNotificationQueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get(ApplicationNotificationService);
  });

  describe('notifyHrNewApplication', () => {
    const params = {
      resumeId: new mongoose.Types.ObjectId().toString(),
      jobName: 'Senior Developer',
      companyName: 'Test Corp',
      companyId: new mongoose.Types.ObjectId().toString(),
      candidateName: 'John Doe',
      candidateEmail: 'john@example.com',
    };
    const hrUsers = [
      { _id: new mongoose.Types.ObjectId(), email: 'hr1@test.com', name: 'HR One' },
      { _id: new mongoose.Types.ObjectId(), email: 'hr2@test.com', name: 'HR Two' },
    ];

    const notify = () =>
      service.notifyHrNewApplication(
        params.resumeId,
        params.jobName,
        params.companyName,
        params.companyId,
        params.candidateName,
        params.candidateEmail,
      );

    it('looks up HR users by companyId and creates an in-app notification for each', async () => {
      mockResumeRepository.findHrUsersByCompany.mockResolvedValue(hrUsers);

      await notify();

      expect(mockResumeRepository.findHrUsersByCompany).toHaveBeenCalledWith(params.companyId);
      expect(mockNotificationsService.create).toHaveBeenCalledTimes(2);
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: hrUsers[0]._id.toString(),
          type: ENotificationType.NEW_APPLICATION,
          title: 'New Application Received',
        }),
      );
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: hrUsers[1]._id.toString() }),
      );
    });

    it('queues an email for each HR user', async () => {
      mockResumeRepository.findHrUsersByCompany.mockResolvedValue(hrUsers);

      await notify();

      expect(mockQueueService.addNewApplicationEmail).toHaveBeenCalledTimes(2);
      expect(mockQueueService.addNewApplicationEmail).toHaveBeenCalledWith({
        hrEmail: 'hr1@test.com',
        hrName: 'HR One',
        candidateName: params.candidateName,
        candidateEmail: params.candidateEmail,
        jobName: params.jobName,
        companyName: params.companyName,
        resumeId: params.resumeId,
      });
    });

    it('sends nothing when the company has no HR users', async () => {
      mockResumeRepository.findHrUsersByCompany.mockResolvedValue([]);

      await notify();

      expect(mockNotificationsService.create).not.toHaveBeenCalled();
      expect(mockQueueService.addNewApplicationEmail).not.toHaveBeenCalled();
    });

    it('still queues emails when the in-app notification fails', async () => {
      mockResumeRepository.findHrUsersByCompany.mockResolvedValue(hrUsers);
      mockNotificationsService.create.mockRejectedValue(new Error('DB error'));

      await expect(notify()).resolves.toBeUndefined();
      expect(mockQueueService.addNewApplicationEmail).toHaveBeenCalledTimes(2);
    });

    it('falls back to the email when the HR user has no name', async () => {
      mockResumeRepository.findHrUsersByCompany.mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(), email: 'hr@test.com', name: '' },
      ]);

      await notify();

      expect(mockQueueService.addNewApplicationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ hrName: 'hr@test.com' }),
      );
    });
  });
});
