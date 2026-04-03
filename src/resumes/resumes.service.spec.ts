import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ResumesService } from './resumes.service';
import { Resume } from './schemas/resume.schema';
import { User } from 'src/users/schemas/user.schema';
import { CvProfilesService } from 'src/cv-profiles/cv-profiles.service';
import { JobsService } from 'src/jobs/jobs.service';
import { MatchingService } from 'src/matching/matching.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { NotificationType } from 'src/notifications/enums/notification-type.enum';
import { ApplicationNotificationQueueService } from 'src/queues/services/application-notification-queue.service';
import mongoose from 'mongoose';

describe('ResumesService', () => {
  let service: ResumesService;
  let mockUserModel: any;
  let mockResumeModel: any;
  let mockNotificationsService: any;
  let mockApplicationNotificationQueueService: any;
  let mockJobsService: any;
  let mockCvProfilesService: any;
  let mockMatchingService: any;

  beforeEach(async () => {
    mockUserModel = {
      find: jest.fn(),
    };
    mockResumeModel = {
      create: jest.fn(),
      findOne: jest.fn(),
    };
    mockNotificationsService = {
      create: jest.fn().mockResolvedValue({}),
    };
    mockApplicationNotificationQueueService = {
      addNewApplicationEmail: jest.fn().mockResolvedValue(undefined),
    };
    mockJobsService = {
      findOne: jest.fn(),
    };
    mockCvProfilesService = {
      getCurrentUserCv: jest.fn(),
    };
    mockMatchingService = {
      calculateMatch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumesService,
        { provide: getModelToken(Resume.name), useValue: mockResumeModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: CvProfilesService, useValue: mockCvProfilesService },
        { provide: JobsService, useValue: mockJobsService },
        { provide: MatchingService, useValue: mockMatchingService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        {
          provide: ApplicationNotificationQueueService,
          useValue: mockApplicationNotificationQueueService,
        },
      ],
    }).compile();

    service = module.get<ResumesService>(ResumesService);
  });

  describe('notifyHrNewApplication', () => {
    const companyId = new mongoose.Types.ObjectId().toString();
    const baseParams = {
      resumeId: new mongoose.Types.ObjectId().toString(),
      jobName: 'Senior Developer',
      companyName: 'Test Corp',
      companyId,
      candidateName: 'John Doe',
      candidateEmail: 'john@example.com',
    };

    const mockHrUsers = [
      { _id: new mongoose.Types.ObjectId(), email: 'hr1@test.com', name: 'HR One' },
      { _id: new mongoose.Types.ObjectId(), email: 'hr2@test.com', name: 'HR Two' },
    ];

    function setupUserModelFind(result: any[]) {
      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(result),
        }),
      });
    }

    it('should find HR users by companyId and create in-app notifications', async () => {
      setupUserModelFind(mockHrUsers);

      await service.notifyHrNewApplication(
        baseParams.resumeId,
        baseParams.jobName,
        baseParams.companyName,
        baseParams.companyId,
        baseParams.candidateName,
        baseParams.candidateEmail,
      );

      // Verify user query uses correct companyId (as string, not ObjectId)
      expect(mockUserModel.find).toHaveBeenCalledWith({
        'company._id': companyId,
        isDeleted: { $ne: true },
        isActive: true,
      });

      // Verify in-app notification created for each HR user
      expect(mockNotificationsService.create).toHaveBeenCalledTimes(2);
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockHrUsers[0]._id.toString(),
          type: NotificationType.NEW_APPLICATION,
          title: 'New Application Received',
        }),
      );
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockHrUsers[1]._id.toString(),
          type: NotificationType.NEW_APPLICATION,
        }),
      );
    });

    it('should queue email notifications for each HR user', async () => {
      setupUserModelFind(mockHrUsers);

      await service.notifyHrNewApplication(
        baseParams.resumeId,
        baseParams.jobName,
        baseParams.companyName,
        baseParams.companyId,
        baseParams.candidateName,
        baseParams.candidateEmail,
      );

      expect(mockApplicationNotificationQueueService.addNewApplicationEmail).toHaveBeenCalledTimes(
        2,
      );
      expect(mockApplicationNotificationQueueService.addNewApplicationEmail).toHaveBeenCalledWith({
        hrEmail: 'hr1@test.com',
        hrName: 'HR One',
        candidateName: baseParams.candidateName,
        candidateEmail: baseParams.candidateEmail,
        jobName: baseParams.jobName,
        companyName: baseParams.companyName,
        resumeId: baseParams.resumeId,
      });
      expect(mockApplicationNotificationQueueService.addNewApplicationEmail).toHaveBeenCalledWith({
        hrEmail: 'hr2@test.com',
        hrName: 'HR Two',
        candidateName: baseParams.candidateName,
        candidateEmail: baseParams.candidateEmail,
        jobName: baseParams.jobName,
        companyName: baseParams.companyName,
        resumeId: baseParams.resumeId,
      });
    });

    it('should not create notifications when no HR users found', async () => {
      setupUserModelFind([]);

      await service.notifyHrNewApplication(
        baseParams.resumeId,
        baseParams.jobName,
        baseParams.companyName,
        baseParams.companyId,
        baseParams.candidateName,
        baseParams.candidateEmail,
      );

      expect(mockNotificationsService.create).not.toHaveBeenCalled();
      expect(mockApplicationNotificationQueueService.addNewApplicationEmail).not.toHaveBeenCalled();
    });

    it('should not throw when individual notification fails', async () => {
      setupUserModelFind(mockHrUsers);
      mockNotificationsService.create.mockRejectedValue(new Error('DB error'));

      await expect(
        service.notifyHrNewApplication(
          baseParams.resumeId,
          baseParams.jobName,
          baseParams.companyName,
          baseParams.companyId,
          baseParams.candidateName,
          baseParams.candidateEmail,
        ),
      ).resolves.not.toThrow();

      // Email queue should still be called even though in-app notification failed
      expect(mockApplicationNotificationQueueService.addNewApplicationEmail).toHaveBeenCalledTimes(
        2,
      );
    });

    it('should use hr.email as fallback when hr.name is missing', async () => {
      const hrNoName = [{ _id: new mongoose.Types.ObjectId(), email: 'hr@test.com', name: '' }];
      setupUserModelFind(hrNoName);

      await service.notifyHrNewApplication(
        baseParams.resumeId,
        baseParams.jobName,
        baseParams.companyName,
        baseParams.companyId,
        baseParams.candidateName,
        baseParams.candidateEmail,
      );

      expect(mockApplicationNotificationQueueService.addNewApplicationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          hrName: 'hr@test.com',
        }),
      );
    });
  });

  describe('submitCvOnline', () => {
    it('should return companyId in result', async () => {
      const companyObjectId = new mongoose.Types.ObjectId();
      const jobId = new mongoose.Types.ObjectId().toString();
      const mockJob = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Developer',
        isActive: true,
        endDate: new Date(Date.now() + 86400000),
        company: { _id: companyObjectId, name: 'Test Corp' },
        skills: ['Node.js'],
        salary: 1000,
        level: 'Junior',
        location: 'HCMC',
      };
      const mockUser = {
        _id: new mongoose.Types.ObjectId().toString(),
        email: 'user@test.com',
        name: 'Test User',
      } as any;
      const mockCvProfile = {
        isActive: true,
        personalInfo: { fullName: 'Test User', email: 'user@test.com', phone: '0123456789' },
        skills: [{ name: 'Node.js', level: 'Intermediate' }],
        workExperience: [],
        education: [],
        summary: 'A developer',
      };
      const mockMatchResult = {
        matchingScore: 75,
        skillsMatch: [],
        strengths: [],
        weaknesses: [],
        summary: 'Good match',
        recommendation: 'Recommended',
        analyzedAt: new Date(),
        priority: 'HIGH',
      };
      const mockCreatedResume = {
        _id: new mongoose.Types.ObjectId(),
        status: 'PENDING',
        priority: 'HIGH',
        createdAt: new Date(),
      };

      mockJobsService.findOne.mockResolvedValue(mockJob);
      mockCvProfilesService.getCurrentUserCv.mockResolvedValue(mockCvProfile);
      mockResumeModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockMatchingService.calculateMatch.mockResolvedValue(mockMatchResult);
      mockResumeModel.create.mockResolvedValue(mockCreatedResume);

      const result = await service.submitCvOnline({ jobId }, mockUser);

      expect(result).toHaveProperty('companyId');
      expect(result.companyId).toEqual(companyObjectId);
      expect(result.jobId).toEqual(mockJob._id);
    });
  });
});
