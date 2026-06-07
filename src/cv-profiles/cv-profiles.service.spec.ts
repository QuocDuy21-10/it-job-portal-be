import mongoose from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { CvProfilesService } from './cv-profiles.service';
import { ProfileIdentitySyncService } from 'src/profile-identity/profile-identity-sync.service';

describe('CvProfilesService', () => {
  let service: CvProfilesService;
  let saveMock: jest.Mock;
  let model: any;
  let cacheManager: { del: jest.Mock };
  let profileIdentitySyncService: jest.Mocked<ProfileIdentitySyncService>;

  const userId = new mongoose.Types.ObjectId().toString();
  const userIdentity = {
    _id: userId,
    name: 'Account Name',
    email: 'user@example.com',
    avatar: 'https://example.com/account-avatar.jpg',
  };

  const makeDto = (overrides: Record<string, any> = {}) =>
    ({
      personalInfo: {
        fullName: 'CV Name',
        phone: '0123456789',
        gender: 'Nam',
        ...overrides,
      },
      skills: [],
      experience: [],
    }) as any;

  beforeEach(() => {
    saveMock = jest.fn(function (this: any) {
      return Promise.resolve(this);
    });

    const MockModel = jest.fn(function (this: any, data: Record<string, any>) {
      Object.assign(this, data);
      this.save = saveMock;
    });

    model = MockModel;
    model.findOne = jest.fn();
    model.findOneAndUpdate = jest.fn();

    cacheManager = {
      del: jest.fn(),
    };

    profileIdentitySyncService = {
      getUserIdentity: jest.fn().mockResolvedValue(userIdentity),
      assertCvEmailMatchesUser: jest.fn((incomingEmail?: string, userEmail?: string) => {
        if (incomingEmail && incomingEmail.trim().toLowerCase() !== userEmail) {
          throw new BadRequestException('CV profile email must match the account email');
        }
      }),
      syncUserIdentityFromCv: jest.fn(),
    } as any;

    service = new CvProfilesService(
      model,
      cacheManager as any,
      {
        buildFileUrl: jest.fn(
          (folderType: string, fileName: string) => `/${folderType}/${fileName}`,
        ),
      } as any,
      profileIdentitySyncService,
    );
  });

  describe('getCurrentUserCv', () => {
    it('should return an existing saved CV profile without a draft flag', async () => {
      const savedCv = {
        userId,
        personalInfo: {
          fullName: 'Saved Name',
          email: 'user@example.com',
          avatar: 'avatar.jpg',
        },
        toObject: jest.fn().mockReturnValue({
          userId,
          personalInfo: {
            fullName: 'Saved Name',
            email: 'user@example.com',
            avatar: 'avatar.jpg',
          },
        }),
      };
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedCv) });

      const result = await service.getCurrentUserCv(userId, { includeDraft: true });

      expect((result as any).isDraft).toBeUndefined();
      expect((result as any).personalInfo).toMatchObject({
        fullName: 'Saved Name',
        email: 'user@example.com',
        avatar: '/avatar/avatar.jpg',
      });
      expect(profileIdentitySyncService.getUserIdentity).not.toHaveBeenCalled();
    });

    it('should return null when no CV exists and draft is not requested', async () => {
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.getCurrentUserCv(userId)).resolves.toBeNull();

      expect(profileIdentitySyncService.getUserIdentity).not.toHaveBeenCalled();
    });

    it('should return a user-derived draft when no CV exists and draft is requested', async () => {
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.getCurrentUserCv(userId, { includeDraft: true });

      expect(result).toEqual({
        isDraft: true,
        userId,
        personalInfo: {
          fullName: 'Account Name',
          title: '',
          avatar: 'https://example.com/account-avatar.jpg',
          phone: '',
          email: 'user@example.com',
          birthday: '',
          gender: '',
          address: '',
          personalLink: '',
          bio: '',
        },
        education: [],
        experience: [],
        skills: [],
        languages: [],
        projects: [],
        certificates: [],
        awards: [],
        isActive: true,
      });
    });

    it('should omit draft avatar when the account has no avatar', async () => {
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      profileIdentitySyncService.getUserIdentity.mockResolvedValueOnce({
        ...userIdentity,
        avatar: undefined,
      });

      const result = await service.getCurrentUserCv(userId, { includeDraft: true });

      expect((result as any).personalInfo.avatar).toBeUndefined();
    });
  });

  it('should save the canonical account email when CV email is missing', async () => {
    model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    const result = await service.upsertCvProfile(userId, makeDto());

    expect(result.personalInfo).toMatchObject({
      fullName: 'CV Name',
      email: 'user@example.com',
      gender: 'Nam',
    });
    expect(profileIdentitySyncService.assertCvEmailMatchesUser).toHaveBeenCalledWith(
      undefined,
      'user@example.com',
    );
    expect(profileIdentitySyncService.syncUserIdentityFromCv).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        fullName: 'CV Name',
        email: 'user@example.com',
      }),
    );
    expect(cacheManager.del).toHaveBeenCalledWith(`chat_ctx:${userId}`);
  });

  it('should accept matching CV email and still persist the canonical email', async () => {
    model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    const result = await service.upsertCvProfile(userId, makeDto({ email: ' USER@example.com ' }));

    expect(result.personalInfo.email).toBe('user@example.com');
  });

  it('should reject mismatched CV email before writing profile data', async () => {
    model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(
      service.upsertCvProfile(userId, makeDto({ email: 'other@example.com' })),
    ).rejects.toThrow(BadRequestException);

    expect(saveMock).not.toHaveBeenCalled();
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(profileIdentitySyncService.syncUserIdentityFromCv).not.toHaveBeenCalled();
  });

  it('should update an existing CV profile and sync uploaded avatar to the user', async () => {
    const existingCv = {
      personalInfo: {
        fullName: 'Old Name',
        email: 'user@example.com',
        avatar: 'https://example.com/old-avatar.jpg',
      },
    };
    const updatedCv = { _id: new mongoose.Types.ObjectId() };
    model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existingCv) });
    model.findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(updatedCv) });

    const dto = makeDto({
      fullName: 'New CV Name',
      avatar: 'https://example.com/new-avatar.jpg',
    });

    await service.upsertCvProfile(userId, dto);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: expect.any(mongoose.Types.ObjectId) },
      expect.objectContaining({
        personalInfo: expect.objectContaining({
          fullName: 'New CV Name',
          avatar: 'https://example.com/new-avatar.jpg',
          email: 'user@example.com',
          gender: 'Nam',
        }),
      }),
      { new: true, runValidators: true },
    );
    expect(profileIdentitySyncService.syncUserIdentityFromCv).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        fullName: 'New CV Name',
        avatar: 'https://example.com/new-avatar.jpg',
      }),
    );
  });

  it('should preserve the existing CV avatar when no new avatar is supplied', async () => {
    const existingCv = {
      personalInfo: {
        fullName: 'Old Name',
        email: 'user@example.com',
        avatar: 'https://example.com/old-avatar.jpg',
      },
    };
    model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existingCv) });
    model.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId() }),
    });

    await service.upsertCvProfile(userId, makeDto({ fullName: 'New CV Name' }));

    expect(model.findOneAndUpdate.mock.calls[0][1].personalInfo.avatar).toBe(
      'https://example.com/old-avatar.jpg',
    );
  });
});
