import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IUser } from 'src/users/user.interface';
import {
  buildPaginationMeta,
  escapeRegex,
  resolvePagination,
} from 'src/utils/helpers/list-query.helper';
import { ListCrawledJobsQueryDto } from './dto/list-crawled-jobs-query.dto';
import { RemoveCrawledJobsDto } from './dto/remove-crawled-jobs.dto';
import { ECrawledJobState } from './enums/crawled-job-state.enum';
import { ExternalJob, ExternalJobDocument } from './schemas/external-job.schema';

export const buildCrawledJobFilter = ({
  sourceKey,
  state,
  keyword,
}: ListCrawledJobsQueryDto): Record<string, any> => {
  const filter: Record<string, any> = {};
  const trimmed = keyword?.trim();

  if (sourceKey) {
    filter.sourceKey = sourceKey;
  }

  if (state === ECrawledJobState.REMOVED) {
    filter.removedAt = { $ne: null };
  } else if (state) {
    filter.status = state;
    filter.removedAt = null;
  }

  if (trimmed) {
    const regex = new RegExp(escapeRegex(trimmed), 'i');
    filter.$or = [{ title: regex }, { companyName: regex }];
  }

  return filter;
};

@Injectable()
export class CrawledJobsService {
  constructor(
    @InjectModel(ExternalJob.name)
    private readonly externalJobModel: Model<ExternalJobDocument>,
  ) {}

  async findAll(query: ListCrawledJobsQueryDto) {
    const { page, limit, offset } = resolvePagination(query.page, query.limit);
    const filter = buildCrawledJobFilter(query);
    const [result, total] = await Promise.all([
      this.externalJobModel
        .find(filter)
        .select('-descriptionHtml -contentHash')
        .sort({ _id: -1 })
        .skip(offset)
        .limit(limit)
        .lean<ExternalJob[]>(),
      this.externalJobModel.countDocuments(filter),
    ]);

    return { result, meta: buildPaginationMeta(page, limit, total) };
  }

  async remove({ ids, reason }: RemoveCrawledJobsDto, user: IUser): Promise<{ modified: number }> {
    const { modifiedCount } = await this.externalJobModel.updateMany(
      { _id: { $in: ids }, removedAt: null },
      {
        $set: {
          removedAt: new Date(),
          removedBy: { _id: user._id, email: user.email },
          removeReason: reason,
        },
      },
    );
    return { modified: modifiedCount };
  }

  async restore(ids: string[]): Promise<{ modified: number }> {
    const { modifiedCount } = await this.externalJobModel.updateMany(
      { _id: { $in: ids }, removedAt: { $ne: null } },
      { $unset: { removedAt: 1, removedBy: 1, removeReason: 1 } },
    );
    return { modified: modifiedCount };
  }
}
