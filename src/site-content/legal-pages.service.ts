import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IUser } from 'src/users/user.interface';
import { LegalPageParamsDto } from './dto/legal-page-params.dto';
import { UpdateLegalPageDto } from './dto/update-legal-page.dto';
import { LegalPage, LegalPageDocument } from './schemas/legal-page.schema';

const PUBLIC_FIELDS = '-_id page locale title description contentHtml isPublished updatedAt';

@Injectable()
export class LegalPagesService {
  constructor(
    @InjectModel(LegalPage.name) private readonly legalPageModel: Model<LegalPageDocument>,
  ) {}

  async findOne({ page, locale }: LegalPageParamsDto): Promise<LegalPage> {
    const legalPage = await this.legalPageModel
      .findOne({ page, locale })
      .select(PUBLIC_FIELDS)
      .lean<LegalPage>();

    if (!legalPage) {
      throw new NotFoundException(`Chưa có nội dung cho trang ${page} (${locale})`);
    }

    return legalPage;
  }

  async update(
    { page, locale }: LegalPageParamsDto,
    { title, description, contentHtml, isPublished }: UpdateLegalPageDto,
    user: IUser,
  ): Promise<LegalPage | null> {
    return this.legalPageModel
      .findOneAndUpdate(
        { page, locale },
        {
          $set: {
            title,
            description,
            contentHtml,
            isPublished,
            updatedBy: { _id: user._id, email: user.email },
          },
        },
        { upsert: true, new: true },
      )
      .select(PUBLIC_FIELDS)
      .lean<LegalPage>();
  }
}
