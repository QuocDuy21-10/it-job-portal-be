import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ChatService } from './chat.service';
import { Conversation } from './schemas/conversation.schema';
import { AIService } from '../ai/ai.service';
import { ChatContextService } from './chat-context.service';
import { ChatPromptBuilder } from './chat-prompt.builder';
import { JobsService } from '../jobs/jobs.service';

describe('ChatService', () => {
  let service: ChatService;
  let mockConversationModel: { findOne: jest.Mock };
  let mockJobsService: { findPublicChatCardJobsByIds: jest.Mock };
  let conversationQuery: { lean: jest.Mock; exec: jest.Mock };

  beforeEach(async () => {
    conversationQuery = {
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    mockConversationModel = {
      findOne: jest.fn().mockReturnValue(conversationQuery),
    };

    mockJobsService = {
      findPublicChatCardJobsByIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: getModelToken(Conversation.name),
          useValue: mockConversationModel,
        },
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
        {
          provide: AIService,
          useValue: {},
        },
        {
          provide: ChatContextService,
          useValue: {},
        },
        {
          provide: ChatPromptBuilder,
          useValue: {},
        },
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('getConversationHistory', () => {
    it('hydrates assistant messages with available recommended jobs', async () => {
      conversationQuery.exec.mockResolvedValue({
        title: 'Chat title',
        messages: [
          {
            role: 'assistant',
            content: 'Try these roles',
            timestamp: new Date('2024-12-01T10:01:00.000Z'),
            recommendedJobIds: ['job-2', 'job-1'],
          },
          {
            role: 'user',
            content: 'Show me jobs',
            timestamp: new Date('2024-12-01T10:00:00.000Z'),
          },
        ],
      });
      mockJobsService.findPublicChatCardJobsByIds.mockResolvedValue([
        {
          _id: 'job-1',
          name: 'Backend Developer',
          company: { _id: 'company-1', name: 'Acme', logo: 'logo-1.png' },
          location: 'Ho Chi Minh City',
          locationCode: 'ho-chi-minh',
          skills: ['NodeJS'],
          level: 'MID',
          salary: 2000,
        },
        {
          _id: 'job-2',
          name: 'Senior NestJS Developer',
          company: { _id: 'company-2', name: 'Beta' },
          location: 'Da Nang',
          locationCode: 'da-nang',
          skills: ['NestJS'],
          level: 'SENIOR',
          salary: 3000,
        },
      ]);

      const result = await service.getConversationHistory('507f1f77bcf86cd799439011', 1, 50);

      expect(mockJobsService.findPublicChatCardJobsByIds).toHaveBeenCalledWith(['job-2', 'job-1']);
      expect(result.messages).toEqual([
        {
          role: 'user',
          content: 'Show me jobs',
          timestamp: new Date('2024-12-01T10:00:00.000Z'),
        },
        {
          role: 'assistant',
          content: 'Try these roles',
          timestamp: new Date('2024-12-01T10:01:00.000Z'),
          recommendedJobIds: ['job-2', 'job-1'],
          recommendedJobs: [
            {
              _id: 'job-2',
              name: 'Senior NestJS Developer',
              company: { _id: 'company-2', name: 'Beta' },
              location: 'Da Nang',
              locationCode: 'da-nang',
              skills: ['NestJS'],
              level: 'SENIOR',
              salary: 3000,
            },
            {
              _id: 'job-1',
              name: 'Backend Developer',
              company: { _id: 'company-1', name: 'Acme', logo: 'logo-1.png' },
              location: 'Ho Chi Minh City',
              locationCode: 'ho-chi-minh',
              skills: ['NodeJS'],
              level: 'MID',
              salary: 2000,
            },
          ],
        },
      ]);
    });

    it('deduplicates fetch IDs while preserving message order for rendered cards', async () => {
      conversationQuery.exec.mockResolvedValue({
        messages: [
          {
            role: 'assistant',
            content: 'Message one',
            timestamp: new Date('2024-12-01T10:00:00.000Z'),
            recommendedJobIds: ['job-2', 'job-1', 'job-2'],
          },
          {
            role: 'assistant',
            content: 'Message two',
            timestamp: new Date('2024-12-01T10:01:00.000Z'),
            recommendedJobIds: ['job-1'],
          },
        ],
      });
      mockJobsService.findPublicChatCardJobsByIds.mockResolvedValue([
        {
          _id: 'job-1',
          name: 'Backend Developer',
          company: { _id: 'company-1', name: 'Acme' },
          location: 'Ho Chi Minh City',
          skills: ['NodeJS'],
          level: 'MID',
        },
        {
          _id: 'job-2',
          name: 'Senior NestJS Developer',
          company: { _id: 'company-2', name: 'Beta' },
          location: 'Da Nang',
          skills: ['NestJS'],
          level: 'SENIOR',
        },
      ]);

      const result = await service.getConversationHistory('507f1f77bcf86cd799439011', 1, 50);

      expect(mockJobsService.findPublicChatCardJobsByIds).toHaveBeenCalledWith(['job-2', 'job-1']);
      expect((result.messages[0] as any).recommendedJobs).toEqual([
        {
          _id: 'job-2',
          name: 'Senior NestJS Developer',
          company: { _id: 'company-2', name: 'Beta' },
          location: 'Da Nang',
          skills: ['NestJS'],
          level: 'SENIOR',
        },
        {
          _id: 'job-1',
          name: 'Backend Developer',
          company: { _id: 'company-1', name: 'Acme' },
          location: 'Ho Chi Minh City',
          skills: ['NodeJS'],
          level: 'MID',
        },
      ]);
    });

    it('omits unavailable jobs while keeping the original recommended IDs', async () => {
      conversationQuery.exec.mockResolvedValue({
        messages: [
          {
            role: 'assistant',
            content: 'Try this job',
            timestamp: new Date('2024-12-01T10:00:00.000Z'),
            recommendedJobIds: ['job-1', 'job-hidden'],
          },
        ],
      });
      mockJobsService.findPublicChatCardJobsByIds.mockResolvedValue([
        {
          _id: 'job-1',
          name: 'Backend Developer',
          company: { _id: 'company-1', name: 'Acme' },
          location: 'Ho Chi Minh City',
          skills: ['NodeJS'],
          level: 'MID',
        },
      ]);

      const result = await service.getConversationHistory('507f1f77bcf86cd799439011', 1, 50);

      expect(result.messages[0]).toEqual({
        role: 'assistant',
        content: 'Try this job',
        timestamp: new Date('2024-12-01T10:00:00.000Z'),
        recommendedJobIds: ['job-1', 'job-hidden'],
        recommendedJobs: [
          {
            _id: 'job-1',
            name: 'Backend Developer',
            company: { _id: 'company-1', name: 'Acme' },
            location: 'Ho Chi Minh City',
            skills: ['NodeJS'],
            level: 'MID',
          },
        ],
      });
    });

    it('leaves messages unchanged when the page has no recommendations', async () => {
      conversationQuery.exec.mockResolvedValue({
        messages: [
          {
            role: 'user',
            content: 'Hello',
            timestamp: new Date('2024-12-01T10:00:00.000Z'),
          },
          {
            role: 'assistant',
            content: 'Hi there',
            timestamp: new Date('2024-12-01T10:01:00.000Z'),
          },
        ],
      });

      const result = await service.getConversationHistory('507f1f77bcf86cd799439011', 1, 50);

      expect(mockJobsService.findPublicChatCardJobsByIds).not.toHaveBeenCalled();
      expect(result.messages).toEqual([
        {
          role: 'user',
          content: 'Hello',
          timestamp: new Date('2024-12-01T10:00:00.000Z'),
        },
        {
          role: 'assistant',
          content: 'Hi there',
          timestamp: new Date('2024-12-01T10:01:00.000Z'),
        },
      ]);
    });
  });
});
