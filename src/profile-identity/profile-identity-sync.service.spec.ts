import mongoose from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { ProfileIdentitySyncService } from './profile-identity-sync.service';

describe('ProfileIdentitySyncService', () => {
  let service: ProfileIdentitySyncService;
  let userModel: any;
  let cvProfileModel: any;
  let resumeModel: any;

  const userId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    userModel = {
      findOne: jest.fn(),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    cvProfileModel = {
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };

    resumeModel = {};

    service = new ProfileIdentitySyncService(userModel, cvProfileModel, resumeModel);
  });

  it('collects avatar file names from users, CV profiles and submitted CV snapshots, deleted ones included', async () => {
    userModel.collection = {
      distinct: jest
        .fn()
        .mockResolvedValue(['https://api.example.test/images/avatar/a.jpg', null, '']),
    };
    cvProfileModel.collection = {
      distinct: jest
        .fn()
        .mockResolvedValue(['http://localhost:8081/images/avatar/b.png?v=2', 'c.webp']),
    };

    // An application keeps the avatar it was sent with after the candidate picks a new one.
    resumeModel.collection = {
      distinct: jest.fn().mockResolvedValue(['https://api.example.test/images/avatar/sent.jpg']),
    };

    await expect(service.findReferencedAvatarFileNames()).resolves.toEqual(
      new Set(['a.jpg', 'b.png', 'c.webp', 'sent.jpg']),
    );
    expect(resumeModel.collection.distinct).toHaveBeenCalledWith(
      'cvStructuredData.personalInfo.avatar',
    );
    expect(userModel.collection.distinct).toHaveBeenCalledWith('avatar');
    expect(cvProfileModel.collection.distinct).toHaveBeenCalledWith('personalInfo.avatar');
  });

  it('should reject CV emails that do not match the account email', () => {
    expect(() => service.assertCvEmailMatchesUser('other@example.com', 'user@example.com')).toThrow(
      BadRequestException,
    );
  });

  it('should accept matching CV emails using case-insensitive trimmed comparison', () => {
    expect(() =>
      service.assertCvEmailMatchesUser(' USER@example.com ', 'user@example.com'),
    ).not.toThrow();
  });

  it('should update user name and avatar from CV personal info without touching email', async () => {
    await service.syncUserIdentityFromCv(userId, {
      fullName: 'CV Name',
      email: 'other@example.com',
      avatar: 'https://example.com/avatar.jpg',
    });

    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: expect.any(mongoose.Types.ObjectId), isDeleted: { $ne: true } },
      {
        $set: {
          name: 'CV Name',
          avatar: 'https://example.com/avatar.jpg',
        },
      },
    );
  });

  it('should update CV identity fields from user and not fail when no CV profile exists', async () => {
    await expect(
      service.syncCvIdentityFromUser(userId, {
        name: 'User Name',
        email: 'user@example.com',
        avatar: 'https://example.com/avatar.jpg',
      }),
    ).resolves.toBeUndefined();

    expect(cvProfileModel.updateOne).toHaveBeenCalledWith(
      { userId: expect.any(mongoose.Types.ObjectId) },
      {
        $set: expect.objectContaining({
          'personalInfo.fullName': 'User Name',
          'personalInfo.email': 'user@example.com',
          'personalInfo.avatar': 'https://example.com/avatar.jpg',
          lastUpdated: expect.any(Date),
        }),
      },
    );
  });
});
