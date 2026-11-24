import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UploadFolderType } from 'src/files/constants/upload-policy';
import { BannersService } from './banners.service';

const ID = '6720a1b2c3d4e5f6a7b8c9d0';
const FILE = '3f2b8c1e-0000-4000-8000-000000000000.png';
const USER = { _id: 'u1', email: 'admin@example.com' } as any;

const lean = (value: unknown) => ({ lean: jest.fn().mockResolvedValue(value) });

const setup = () => {
  const model = {
    findOne: jest.fn().mockReturnValue(lean(null)),
    find: jest.fn(),
    create: jest.fn(),
    exists: jest.fn().mockResolvedValue({ _id: ID }),
    updateMany: jest.fn().mockResolvedValue({}),
    findByIdAndUpdate: jest.fn().mockReturnValue(lean({ _id: ID, fileName: FILE, isActive: true })),
    findOneAndDelete: jest.fn().mockReturnValue(lean({ _id: ID, fileName: FILE })),
  };
  const files = {
    buildFileUrl: jest.fn((folder: string, name: string) => `https://api/images/${folder}/${name}`),
    listFilesWithAge: jest.fn().mockResolvedValue([{ fileName: FILE, ageInMs: 1 }]),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new BannersService(model as any, files as any), model, files };
};

describe('BannersService', () => {
  it('returns null when no banner is active', async () => {
    await expect(setup().service.findActive()).resolves.toBeNull();
  });

  it('returns the URL of the active banner', async () => {
    const { service, model } = setup();
    model.findOne.mockReturnValue(lean({ fileName: FILE }));

    await expect(service.findActive()).resolves.toEqual({
      imageUrl: `https://api/images/banner/${FILE}`,
    });
  });

  it('refuses a file that was never uploaded', async () => {
    const { service, model, files } = setup();
    files.listFilesWithAge.mockResolvedValue([]);

    await expect(service.create({ name: 'Tết', fileName: FILE }, USER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(model.create).not.toHaveBeenCalled();
  });

  it('replaces the active banner', async () => {
    const { service, model } = setup();

    await service.activate(ID);

    expect(model.updateMany).toHaveBeenCalledWith(
      { isActive: true, _id: { $ne: ID } },
      { isActive: false },
    );
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(ID, { isActive: true }, { new: true });
  });

  it('keeps the current banner when the requested one does not exist', async () => {
    const { service, model } = setup();
    model.exists.mockResolvedValue(null);

    await expect(service.activate(ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(model.updateMany).not.toHaveBeenCalled();
  });

  it('rejects malformed ids', async () => {
    await expect(setup().service.activate('nope')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes the record, then its file', async () => {
    const { service, model, files } = setup();

    await service.remove(ID);

    expect(model.findOneAndDelete).toHaveBeenCalledWith({ _id: ID, isActive: false });
    expect(files.deleteFile).toHaveBeenCalledWith(UploadFolderType.BANNER, FILE);
  });

  it('refuses to delete the active banner', async () => {
    const { service, model, files } = setup();
    model.findOneAndDelete.mockReturnValue(lean(null));

    await expect(service.remove(ID)).rejects.toBeInstanceOf(ConflictException);
    expect(files.deleteFile).not.toHaveBeenCalled();
  });

  it('reports a missing banner as 404', async () => {
    const { service, model } = setup();
    model.findOneAndDelete.mockReturnValue(lean(null));
    model.exists.mockResolvedValue(null);

    await expect(service.remove(ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
