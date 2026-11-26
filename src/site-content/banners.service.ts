import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, Types } from 'mongoose';
import { UploadFolderType } from 'src/files/constants/upload-policy';
import { FilesService } from 'src/files/files.service';
import { IUser } from 'src/users/user.interface';
import { buildVisibleSlidesFilter, getSlideStatus } from './banner-visibility';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { Banner, BannerDocument, SlideText } from './schemas/banner.schema';
import { MAX_ACTIVE_SLIDES } from './site-content.constants';

const FOLDER = UploadFolderType.BANNER;

type StoredBanner = Banner & { _id: Types.ObjectId };
type CtaFields = { ctaLabel?: string | null; ctaUrl?: string | null };
type SlideRules = {
  content?: { vi: CtaFields; en: CtaFields } | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
};

// The global soft-delete plugin adds its fields to nested schemas too; the public gets slide text only.
const toPublicText = ({ title, description, ctaLabel, ctaUrl }: SlideText): SlideText => ({
  title,
  description,
  ctaLabel,
  ctaUrl,
});

@Injectable()
export class BannersService {
  private readonly logger = new Logger(BannersService.name);

  constructor(
    @InjectModel(Banner.name) private readonly bannerModel: Model<BannerDocument>,
    private readonly filesService: FilesService,
  ) {}

  async findPublic() {
    const slides = await this.bannerModel
      .find(buildVisibleSlidesFilter(new Date()))
      .sort({ order: 1, createdAt: 1 })
      .lean<StoredBanner[]>();

    return slides.map(slide => ({
      id: slide._id.toString(),
      imageUrl: this.url(slide.fileName),
      mobileImageUrl: slide.mobileFileName ? this.url(slide.mobileFileName) : null,
      content: slide.content
        ? { vi: toPublicText(slide.content.vi), en: toPublicText(slide.content.en) }
        : null,
    }));
  }

  async findAll() {
    const now = new Date();
    const banners = await this.bannerModel
      .find()
      .sort({ order: 1, createdAt: 1 })
      .lean<StoredBanner[]>();

    return banners.map(banner => ({
      ...this.withUrls(banner),
      status: getSlideStatus(banner, now),
    }));
  }

  async create(dto: CreateBannerDto, user: IUser) {
    this.assertRules(dto);
    await this.assertUploaded([dto.fileName, dto.mobileFileName]);

    const last = await this.bannerModel
      .findOne()
      .sort({ order: -1 })
      .select('order')
      .lean<StoredBanner>();
    const banner = await this.bannerModel.create({
      ...dto,
      isActive: false,
      order: (last?.order ?? -1) + 1,
      createdBy: { _id: user._id, email: user.email },
    });

    return this.withUrls(banner.toObject());
  }

  async update(id: string, dto: UpdateBannerDto, user: IUser) {
    this.assertObjectId(id);
    const existing = await this.bannerModel.findById(id).lean<StoredBanner>();
    if (!existing) {
      throw this.notFound(id);
    }

    this.assertRules({
      content: dto.content !== undefined ? dto.content : existing.content,
      startAt: dto.startAt !== undefined ? dto.startAt : existing.startAt,
      endAt: dto.endAt !== undefined ? dto.endAt : existing.endAt,
    });

    const changedDesktop = dto.fileName !== undefined && dto.fileName !== existing.fileName;
    const changedMobile =
      dto.mobileFileName !== undefined && dto.mobileFileName !== existing.mobileFileName;
    await this.assertUploaded([
      changedDesktop ? dto.fileName : null,
      changedMobile ? dto.mobileFileName : null,
    ]);

    const banner = await this.bannerModel
      .findByIdAndUpdate(
        id,
        { ...dto, updatedBy: { _id: user._id, email: user.email } },
        { new: true, runValidators: true },
      )
      .lean<StoredBanner>();
    if (!banner) {
      throw this.notFound(id);
    }

    // Only after the save: a failed update must not lose the image still in use.
    const replaced = [
      changedDesktop ? existing.fileName : null,
      changedMobile ? existing.mobileFileName : null,
    ].filter(
      // A swapped image moves to the other slot, so the slide still uses it.
      (name): name is string =>
        !!name && name !== banner.fileName && name !== banner.mobileFileName,
    );
    await Promise.all(replaced.map(name => this.deleteFileQuietly(name)));

    return { ...this.withUrls(banner), status: getSlideStatus(banner, new Date()) };
  }

  async setVisibility(id: string, isActive: boolean, user: IUser) {
    this.assertObjectId(id);

    if (isActive) {
      // shortcut: two admins turning on different slides at once can both pass; the cap only limits page weight.
      const active = await this.bannerModel.countDocuments({ isActive: true, _id: { $ne: id } });
      if (active >= MAX_ACTIVE_SLIDES) {
        throw new ConflictException(`Chỉ được bật tối đa ${MAX_ACTIVE_SLIDES} banner`);
      }
    }

    const banner = await this.bannerModel
      .findByIdAndUpdate(
        id,
        { isActive, updatedBy: { _id: user._id, email: user.email } },
        { new: true },
      )
      .lean<StoredBanner>();
    if (!banner) {
      throw this.notFound(id);
    }

    return { ...this.withUrls(banner), status: getSlideStatus(banner, new Date()) };
  }

  async reorder(ids: string[]) {
    const existing = await this.bannerModel.find().select('_id').lean<StoredBanner[]>();
    const known = new Set(existing.map(banner => banner._id.toString()));

    if (
      new Set(ids).size !== ids.length ||
      ids.length !== known.size ||
      ids.some(id => !known.has(id))
    ) {
      throw new BadRequestException('Danh sách phải chứa mỗi banner đúng một lần');
    }

    await this.bannerModel.bulkWrite(
      ids.map((id, order) => ({
        updateOne: { filter: { _id: id }, update: { $set: { order } } },
      })),
    );

    return this.findAll();
  }

  async remove(id: string): Promise<{ deleted: true }> {
    this.assertObjectId(id);
    const banner = await this.bannerModel.findByIdAndDelete(id).lean<StoredBanner>();
    if (!banner) {
      throw this.notFound(id);
    }

    await this.filesService.deleteFile(FOLDER, banner.fileName);
    if (banner.mobileFileName) {
      await this.filesService.deleteFile(FOLDER, banner.mobileFileName);
    }
    return { deleted: true };
  }

  private assertRules({ content, startAt, endAt }: SlideRules): void {
    for (const text of content ? [content.vi, content.en] : []) {
      if (!text.ctaLabel !== !text.ctaUrl) {
        throw new BadRequestException('Nhãn và liên kết của nút phải nhập cùng nhau');
      }
    }
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    }
  }

  private async assertUploaded(names: Array<string | null | undefined>): Promise<void> {
    const wanted = names.filter((name): name is string => !!name);
    if (wanted.length === 0) return;

    const files = new Set((await this.filesService.listFilesWithAge(FOLDER)).map(f => f.fileName));
    if (wanted.some(name => !files.has(name))) {
      throw new BadRequestException('Không tìm thấy tệp banner đã tải lên');
    }
  }

  private async deleteFileQuietly(name: string): Promise<void> {
    try {
      await this.filesService.deleteFile(FOLDER, name);
    } catch (error) {
      this.logger.warn(`Could not delete replaced banner file ${name}: ${String(error)}`);
    }
  }

  private withUrls<T extends Pick<Banner, 'fileName' | 'mobileFileName'>>(banner: T) {
    return {
      ...banner,
      imageUrl: this.url(banner.fileName),
      mobileImageUrl: banner.mobileFileName ? this.url(banner.mobileFileName) : null,
    };
  }

  private url(fileName: string): string {
    return this.filesService.buildFileUrl(FOLDER, fileName);
  }

  private assertObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID không đúng định dạng');
    }
  }

  private notFound(id: string) {
    return new NotFoundException(`Không tìm thấy banner có id ${id}`);
  }
}
