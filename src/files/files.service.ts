import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class FilesService {
  constructor(private configService: ConfigService) {
    // Cấu hình cloudinary khi service được khởi tạo
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Upload file lên Cloudinary từ buffer (memory storage)
   * @param file File object từ Multer (với buffer)
   * @param folder Thư mục lưu file trên Cloudinary
   * @returns Promise với thông tin file đã upload
   */
  async uploadToCloudinary(
    file: Express.Multer.File,
    folder: string = 'default',
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // Xác định resource_type dựa trên mimetype
      let resourceType: 'image' | 'video' | 'raw' = 'raw';
      
      if (file.mimetype.startsWith('image/')) {
        resourceType = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        resourceType = 'video';
      }

      // Tạo upload stream
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        },
      );

      // Stream file buffer lên Cloudinary
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  /**
   * Xóa file khỏi Cloudinary bằng public_id
   * @param publicId Public ID của file trên Cloudinary
   * @param resourceType 'image', 'video', hoặc 'raw'
   */
  async deleteFile(
    publicId: string,
    resourceType: 'image' | 'video' | 'raw' = 'raw',
  ) {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      return result;
    } catch (error) {
      throw new Error(`Could not delete file: ${error.message}`);
    }
  }
}