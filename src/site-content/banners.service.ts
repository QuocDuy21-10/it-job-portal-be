import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { UploadFolderType } from 'src/files/constants/upload-policy';
import { FilesService } from 'src/files/files.service';
import { IUser } from 'src/users/user.interface';
import { CreateBannerDto } from './dto/create-banner.dto';
import { Banner, BannerDocument } from './schemas/banner.schema';

const FOLDER = UploadFolderType.BANNER;

@Injectable()
export class BannersService {
  constructor(
    @InjectModel(Banner.name) private readonly bannerModel: Model<BannerDocument>,
    private readonly filesService: FilesService,
  ) {}

  async findActive(): Promise<{ imageUrl: string } | null> {
    const banner = await this.bannerModel.findOne({ isActive: true }).lean<Banner>();
    return banner ? { imageUrl: this.filesService.buildFileUrl(FOLDER, banner.fileName) } : null;
  }

  async findAll() {
    const banners = await this.bannerModel.find().sort({ createdAt: -1 }).lean<Banner[]>();
    return banners.map(banner => this.withImageUrl(banner));
  }

  async create({ name, fileName }: CreateBannerDto, user: IUser) {
    const files = await this.filesService.listFilesWithAge(FOLDER);

    if (!files.some(file => file.fileName === fileName)) {
      throw new BadRequestException('Không tìm thấy tệp banner đã tải lên');
    }

    const banner = await this.bannerModel.create({
      name,
      fileName,
      createdBy: { _id: user._id, email: user.email },
    });
    return this.withImageUrl(banner.toObject());
  }

  async activate(id: string) {
    this.assertObjectId(id);

    if (!(await this.bannerModel.exists({ _id: id }))) {
      throw this.notFound(id);
    }

    await this.bannerModel.updateMany({ isActive: true, _id: { $ne: id } }, { isActive: false });
    const banner = await this.bannerModel
      .findByIdAndUpdate(id, { isActive: true }, { new: true })
      .lean<Banner>();

    if (!banner) {
      throw this.notFound(id);
    }

    return this.withImageUrl(banner);
  }

  async clearActive(): Promise<null> {
    await this.bannerModel.updateMany({ isActive: true }, { isActive: false });
    return null;
  }

  async remove(id: string): Promise<{ deleted: true }> {
    this.assertObjectId(id);
    const banner = await this.bannerModel
      .findOneAndDelete({ _id: id, isActive: false })
      .lean<Banner>();

    if (!banner) {
      throw (await this.bannerModel.exists({ _id: id }))
        ? new ConflictException('Không thể xoá banner đang hiển thị')
        : this.notFound(id);
    }

    await this.filesService.deleteFile(FOLDER, banner.fileName);
    return { deleted: true };
  }

  private withImageUrl(banner: Banner) {
    return { ...banner, imageUrl: this.filesService.buildFileUrl(FOLDER, banner.fileName) };
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
