import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import ErrorHandler from '../errors/error-handler';
import { ErrorCodeEnums } from '../errors/error-enums';
import { v4 as uuidv4 } from 'uuid';
import { injectable } from 'inversify';
import { IAwsS3Provider } from '../common.interfaces';
import { PassThrough, Readable } from 'stream';
import { FileInfo } from 'busboy';
import { createReadStream, readdir, readdirSync, statSync } from 'fs';
import { extname, join } from 'path';

@injectable()
export default class AwsS3Provider implements IAwsS3Provider {
  static s3: S3Client;

  static cloufront: CloudFrontClient;

  async initialize() {
    await this.initializeS3();
    await this.initializeCloudfront();
  }

  async initializeS3() {
    try {
      AwsS3Provider.s3 = new S3Client({
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
        region: process.env.S3_BUCKET_REGION,
      });
    } catch (e) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        'Could Not Connect to AWS S3!',
      );
    }
    console.log('Connected to AWS S3!');
  }

  async initializeCloudfront() {
    try {
      AwsS3Provider.cloufront = new CloudFrontClient({
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
        region: 'Global',
      });
    } catch (e) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        'Could Not Connect to AWS CDN!',
      );
    }
    console.log('Connected to AWS CDN!');
  }

  async getSignedS3Url(fileKey: string): Promise<string> {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileKey,
    };
    let url: string;
    try {
      const command = new GetObjectCommand(params);
      // Expires in 3600 secs
      url = await getSignedUrl(AwsS3Provider.s3, command, { expiresIn: 3600 });
    } catch (e) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        `Error while fetching signed URL from S3! ${e}`,
      );
    }
    return url;
  }

  async deleteFile(fileKey: string): Promise<void> {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileKey,
    };
    try {
      const command = new DeleteObjectCommand(params);
      await AwsS3Provider.s3.send(command);
      await this.invalidateCloufrontCache(fileKey); // Invalidate Cloudfront cache
    } catch (e) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        `Error while deleting file from S3! ${e}`,
      );
    }
  }

  // Invalidate Cloudfront Cache upon deleting file from S3
  async invalidateCloufrontCache(fileKey: string): Promise<void> {
    const invalidationParams = {
      DistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: fileKey,
        Paths: {
          Quantity: 1,
          Items: [`/${fileKey}`],
        },
      },
    };
    try {
      const command = new CreateInvalidationCommand(invalidationParams);
      await AwsS3Provider.cloufront.send(command);
    } catch (error) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        `Error while invalidating CDN cache! ${error}`,
      );
    }
  }

  private generateCloudfrontUrl(fileKey: string): string {
    const url = `${process.env.AWS_CLOUDFRONT_DOMAIN}/${fileKey}`;
    return url;
  }

  async uploadFileMultipart(
    fileStream: Readable,
    fileInfo: FileInfo,
    fileKey?: string,
    folderKey?: string,
  ): Promise<{ url: string; fileKey: string }> {
    const newFileKey: string = folderKey
      ? fileKey
        ? `${folderKey}/${fileKey}`
        : `${folderKey}/${uuidv4()}`
      : fileKey
        ? fileKey
        : uuidv4();
    try {
      const upload = new Upload({
        client: AwsS3Provider.s3,
        params: {
          Bucket: process.env.S3_BUCKET_NAME,
          Key: newFileKey,
          Body: fileStream,
          ContentType: fileInfo.mimeType,
          // ContentDisposition: `inline; filename="${fileInfo.filename}"`,
        },
        leavePartsOnError: false,
        partSize: 5 * 1024 * 1024, // 5MB chunks
        queueSize: 10, // 4 concurrent uploads
      });
      await upload.done();
    } catch (e) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        `Error while uploading file to S3! ${e}`,
      );
    }

    const cfUrl = this.generateCloudfrontUrl(newFileKey);
    return { url: cfUrl, fileKey: newFileKey };
  }

  async uploadFolder(
    folderPath: string,
    s3FolderKey: string,
  ): Promise<{ url: string; fileKey: string; fileName: string }[]> {
    try {
      const uploadResults: {
        url: string;
        fileKey: string;
        fileName: string;
      }[] = [];
      const files = this.getAllFiles(folderPath);
      for (const file of files) {
        const fileName = `${file}`;
        const extension = extname(file);
        const contentType = this.getContentType(extension);
        const fileStream = createReadStream(join(`${folderPath}/`, file));

        try {
          const { url, fileKey } = await this.uploadFileMultipart(
            fileStream,
            {
              filename: fileName,
              mimeType: contentType,
              encoding: '7bit',
            },
            fileName,
            s3FolderKey,
          );
          const cfUrl = this.generateCloudfrontUrl(fileKey);
          uploadResults.push({ url: cfUrl, fileKey, fileName });
        } catch (error) {
          console.error(`Error uploading file ${file}:`, error);
          throw error;
        }
      }
      return uploadResults;
    } catch (error: any) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        `Error uploading folder: ${error.message}`,
      );
    }
  }

  private getAllFiles(dirPath: string): string[] {
    try {
      return readdirSync(dirPath);
    } catch (err: any) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        `Error reading directory: ${err.message}`,
      );
    }
  }

  private getContentType(extension: string): string {
    const contentTypeMap: { [key: string]: string } = {
      '.m3u8': 'application/x-mpegURL',
      '.ts': 'video/MP2T',
      '.mp4': 'video/mp4',
      '.mpd': 'application/dash+xml',
      '.vtt': 'text/vtt',
      '.srt': 'application/x-subrip',
    };

    return (
      contentTypeMap[extension.toLowerCase()] || 'application/octet-stream'
    );
  }
}
