import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MulterModule.register({
      // Sử dụng memory storage - file sẽ được lưu tạm trong RAM
      // Sau đó chúng ta sẽ upload lên Cloudinary từ buffer
      storage: require('multer').memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowedFileTypes = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx'];
        const fileExtension = file.originalname.split('.').pop().toLowerCase();
        const isValidFileType = allowedFileTypes.includes(fileExtension);

        if (!isValidFileType) {
          cb(new Error('Invalid file type'), false);
        } else {
          cb(null, true);
        }
      },
      limits: {
        fileSize: 1024 * 1024 * 5, // 5 MB
      },
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}