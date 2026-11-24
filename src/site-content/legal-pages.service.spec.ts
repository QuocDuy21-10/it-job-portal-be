import { NotFoundException } from '@nestjs/common';
import { LegalPagesService } from './legal-pages.service';

const KEY = { page: 'terms', locale: 'vi' } as const;
const DTO = {
  title: 'Điều khoản',
  description: 'Mô tả',
  contentHtml: '<p>Nội dung</p>',
  isPublished: true,
};
const chain = (value: unknown) => {
  const query = { select: jest.fn(), lean: jest.fn().mockResolvedValue(value) };
  query.select.mockReturnValue(query);
  return query;
};

describe('LegalPagesService', () => {
  it('reads one page without the editor identity', async () => {
    const query = chain({ ...KEY, ...DTO });
    const model = { findOne: jest.fn().mockReturnValue(query) };

    await new LegalPagesService(model as any).findOne(KEY);

    expect(model.findOne).toHaveBeenCalledWith(KEY);
    expect(query.select).toHaveBeenCalledWith(
      '-_id page locale title description contentHtml isPublished updatedAt',
    );
  });

  it('throws 404 for a page that was never written', async () => {
    const model = { findOne: jest.fn().mockReturnValue(chain(null)) };

    await expect(new LegalPagesService(model as any).findOne(KEY)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('upserts and records who saved it', async () => {
    const model = { findOneAndUpdate: jest.fn().mockReturnValue(chain({ ...KEY, ...DTO })) };

    await new LegalPagesService(model as any).update(KEY, DTO, {
      _id: 'u1',
      email: 'admin@example.com',
    } as any);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      KEY,
      { $set: { ...DTO, updatedBy: { _id: 'u1', email: 'admin@example.com' } } },
      { upsert: true, new: true },
    );
  });
});
