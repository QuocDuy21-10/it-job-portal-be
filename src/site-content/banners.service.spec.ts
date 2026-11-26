import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UploadFolderType } from 'src/files/constants/upload-policy';
import { BannersService } from './banners.service';

const ID = '6720a1b2c3d4e5f6a7b8c9d0';
const ID2 = '6720a1b2c3d4e5f6a7b8c9d1';
const FILE = '3f2b8c1e-0000-4000-8000-000000000000.png';
const MOBILE = '3f2b8c1e-0000-4000-8000-000000000001.webp';
const NEW_FILE = '3f2b8c1e-0000-4000-8000-000000000002.png';
const USER = { _id: 'u1', email: 'admin@example.com' } as any;
const TEXT = { title: 'Tết', ctaLabel: 'Xem', ctaUrl: '/viec-lam' };
const url = (name: string) => `https://api/images/banner/${name}`;

// A Mongoose query stub: chainable sort/select, resolved by lean().
const query = (value: unknown) => {
  const q: any = { sort: jest.fn(() => q), select: jest.fn(() => q) };
  q.lean = jest.fn().mockResolvedValue(value);
  return q;
};

const setup = () => {
  const model = {
    find: jest.fn().mockReturnValue(query([])),
    findOne: jest.fn().mockReturnValue(query(null)),
    findById: jest
      .fn()
      .mockReturnValue(query({ _id: ID, fileName: FILE, mobileFileName: null, content: null })),
    create: jest.fn(async (doc: object) => ({ toObject: () => ({ _id: ID, ...doc }) })),
    countDocuments: jest.fn().mockResolvedValue(0),
    findByIdAndUpdate: jest
      .fn()
      .mockReturnValue(query({ _id: ID, fileName: NEW_FILE, isActive: true })),
    findByIdAndDelete: jest
      .fn()
      .mockReturnValue(query({ _id: ID, fileName: FILE, mobileFileName: MOBILE })),
    bulkWrite: jest.fn().mockResolvedValue({}),
  };
  const files = {
    buildFileUrl: jest.fn((folder: string, name: string) => `https://api/images/${folder}/${name}`),
    listFilesWithAge: jest
      .fn()
      .mockResolvedValue([FILE, MOBILE, NEW_FILE].map(fileName => ({ fileName, ageInMs: 1 }))),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new BannersService(model as any, files as any), model, files };
};

describe('BannersService', () => {
  describe('public reads', () => {
    it('lists visible slides without admin fields', async () => {
      const { service, model } = setup();
      model.find.mockReturnValue(
        query([
          {
            _id: ID,
            name: 'Tết',
            fileName: FILE,
            mobileFileName: MOBILE,
            content: { vi: TEXT, en: TEXT },
            createdBy: USER,
          },
        ]),
      );

      await expect(service.findPublic()).resolves.toEqual([
        {
          id: ID,
          imageUrl: url(FILE),
          mobileImageUrl: url(MOBILE),
          content: { vi: TEXT, en: TEXT },
        },
      ]);
      expect(model.find.mock.calls[0][0]).toMatchObject({ isActive: true });
    });

    it('adds a status to every slide in the admin list', async () => {
      const { service, model } = setup();
      model.find.mockReturnValue(query([{ _id: ID, fileName: FILE, isActive: false }]));

      const [banner] = await service.findAll();

      expect(banner).toMatchObject({ status: 'hidden', imageUrl: url(FILE), mobileImageUrl: null });
    });
  });

  describe('create', () => {
    it('adds a slide hidden and last', async () => {
      const { service, model } = setup();
      model.findOne.mockReturnValue(query({ order: 4 }));

      await service.create({ name: 'Tết', fileName: FILE }, USER);

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, order: 5, createdBy: USER }),
      );
    });

    it('starts the order at 0 in an empty list', async () => {
      const { service, model } = setup();

      await service.create({ name: 'Tết', fileName: FILE }, USER);

      expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ order: 0 }));
    });

    it('refuses a mobile file that was never uploaded', async () => {
      const { service, model, files } = setup();
      files.listFilesWithAge.mockResolvedValue([{ fileName: FILE, ageInMs: 1 }]);

      await expect(
        service.create({ name: 'Tết', fileName: FILE, mobileFileName: MOBILE }, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(model.create).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a CTA label without a link',
        { content: { vi: { title: 'a', ctaLabel: 'Xem' }, en: TEXT } },
      ],
      [
        'a CTA link without a label',
        { content: { vi: TEXT, en: { title: 'b', ctaUrl: '/jobs' } } },
      ],
      [
        'an end before the start',
        { startAt: '2027-02-01T00:00:00+07:00', endAt: '2027-01-01T00:00:00+07:00' },
      ],
      [
        'an end equal to the start',
        { startAt: '2027-02-01T00:00:00+07:00', endAt: '2027-02-01T00:00:00+07:00' },
      ],
    ])('refuses %s', async (_case, extra) => {
      const { service, model } = setup();

      await expect(
        service.create({ name: 'Tết', fileName: FILE, ...extra } as any, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(model.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('deletes the replaced image after saving', async () => {
      const { service, model, files } = setup();

      await service.update(ID, { fileName: NEW_FILE }, USER);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        ID,
        expect.objectContaining({ fileName: NEW_FILE, updatedBy: USER }),
        { new: true, runValidators: true },
      );
      expect(files.deleteFile).toHaveBeenCalledWith(UploadFolderType.BANNER, FILE);
    });

    it('keeps the old image when saving fails', async () => {
      const { service, model, files } = setup();
      model.findByIdAndUpdate.mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('db')),
      });

      await expect(service.update(ID, { fileName: NEW_FILE }, USER)).rejects.toThrow('db');
      expect(files.deleteFile).not.toHaveBeenCalled();
    });

    it('deletes the mobile image when it is cleared', async () => {
      const { service, model, files } = setup();
      model.findById.mockReturnValue(query({ _id: ID, fileName: FILE, mobileFileName: MOBILE }));

      await service.update(ID, { mobileFileName: null }, USER);

      expect(files.deleteFile).toHaveBeenCalledWith(UploadFolderType.BANNER, MOBILE);
    });

    it('keeps files the slide still uses when its images are swapped', async () => {
      const { service, model, files } = setup();
      model.findById.mockReturnValue(query({ _id: ID, fileName: FILE, mobileFileName: MOBILE }));
      model.findByIdAndUpdate.mockReturnValue(
        query({ _id: ID, fileName: MOBILE, mobileFileName: FILE }),
      );

      await service.update(ID, { fileName: MOBILE, mobileFileName: FILE }, USER);

      expect(files.deleteFile).not.toHaveBeenCalled();
    });

    it('checks the schedule against the stored dates', async () => {
      const { service, model } = setup();
      model.findById.mockReturnValue(
        query({ _id: ID, fileName: FILE, startAt: new Date('2027-02-01T00:00:00+07:00') }),
      );

      await expect(
        service.update(ID, { endAt: '2027-01-01T00:00:00+07:00' }, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports a missing slide as 404', async () => {
      const { service, model } = setup();
      model.findById.mockReturnValue(query(null));

      await expect(service.update(ID, { name: 'x' }, USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('visibility', () => {
    it('refuses a sixth active slide', async () => {
      const { service, model } = setup();
      model.countDocuments.mockResolvedValue(5);

      await expect(service.setVisibility(ID, true, USER)).rejects.toBeInstanceOf(ConflictException);
      expect(model.countDocuments).toHaveBeenCalledWith({ isActive: true, _id: { $ne: ID } });
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('hides a slide without counting', async () => {
      const { service, model } = setup();
      model.countDocuments.mockResolvedValue(5);

      await service.setVisibility(ID, false, USER);

      expect(model.countDocuments).not.toHaveBeenCalled();
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        ID,
        { isActive: false, updatedBy: USER },
        { new: true },
      );
    });
  });

  describe('reorder', () => {
    it.each([
      ['a missing slide', [ID]],
      ['a duplicate', [ID, ID]],
      ['an unknown slide', [ID, '6720a1b2c3d4e5f6a7b8c9d9']],
    ])('refuses %s', async (_case, ids) => {
      const { service, model } = setup();
      model.find.mockReturnValue(query([{ _id: ID }, { _id: ID2 }]));

      await expect(service.reorder(ids)).rejects.toBeInstanceOf(BadRequestException);
      expect(model.bulkWrite).not.toHaveBeenCalled();
    });

    it('writes the position of every slide', async () => {
      const { service, model } = setup();
      model.find.mockReturnValue(query([{ _id: ID }, { _id: ID2 }]));

      await service.reorder([ID2, ID]);

      expect(model.bulkWrite).toHaveBeenCalledWith([
        { updateOne: { filter: { _id: ID2 }, update: { $set: { order: 0 } } } },
        { updateOne: { filter: { _id: ID }, update: { $set: { order: 1 } } } },
      ]);
    });
  });

  describe('remove', () => {
    it('deletes the slide and both files, even when it is shown', async () => {
      const { service, model, files } = setup();

      await expect(service.remove(ID)).resolves.toEqual({ deleted: true });

      expect(model.findByIdAndDelete).toHaveBeenCalledWith(ID);
      expect(files.deleteFile).toHaveBeenCalledWith(UploadFolderType.BANNER, FILE);
      expect(files.deleteFile).toHaveBeenCalledWith(UploadFolderType.BANNER, MOBILE);
    });

    it('reports a missing slide as 404', async () => {
      const { service, model } = setup();
      model.findByIdAndDelete.mockReturnValue(query(null));

      await expect(service.remove(ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects malformed ids', async () => {
      await expect(setup().service.remove('nope')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
