import * as ffmpeg from 'fluent-ffmpeg';
import {
  createWriteStream,
  mkdirSync,
  createReadStream,
  writeFileSync,
  existsSync,
  rmSync,
} from 'fs';
import path, { join } from 'path';
import { Readable } from 'stream';
import { inject, injectable } from 'inversify';
import {
  IQueueProvider,
  IAwsS3Provider,
} from '../../../common/common.interfaces';
import { CommonTypes } from '../../../common/common.types';
import DocumentModel from '../../../common/models/document.model';
import { rabbitMQConfig } from '../../../rabbitMQ.config';
import {
  IDocumentManagementRepository,
  IVideoTranscodingService,
} from '../transcoding.interfaces';
import { ProcessingStatusEnums } from '../../../common/enums/processing-status.enums';
import axios from 'axios';
import { getFileExtension } from '../../../common/utils/mime-type.util';
import { exec } from 'child_process';
import ErrorHandler from '../../../common/errors/error-handler';
import { ErrorCodeEnums } from '../../../common/errors/error-enums';
import { TranscodingTypes } from '../transcoding.types';

@injectable()
export default class VideoTranscodingService
  implements IVideoTranscodingService
{
  private isConsuming: boolean = false;
  private readonly BITRATES = [
    { resolution: '1920x1080', bitrate: '5000k' }, // 1080p
    { resolution: '1280x720', bitrate: '3000k' }, // 720p
    { resolution: '854x480', bitrate: '1500k' }, // 480p
    { resolution: '640x360', bitrate: '800k' }, // 360p
  ];

  constructor(
    @inject(CommonTypes.QueueProvider)
    private queueProvider: IQueueProvider,
    @inject(CommonTypes.AwsS3Provider)
    private s3Provider: IAwsS3Provider,
    @inject(TranscodingTypes.TranscodingRepository)
    private transcodingRepository: IDocumentManagementRepository,
  ) {
    this.startConsumer();
  }

  // Implement the interface method
  async transcodeVideo(): Promise<void> {
    if (!this.isConsuming) {
      await this.startConsumer();
    }
  }

  private async startConsumer(): Promise<void> {
    if (this.isConsuming) return;

    try {
      this.isConsuming = true;
      await this.consumeMessages();
    } catch (error) {
      console.error('Consumer error:', error);
      this.isConsuming = false;
      // Retry after delay
      setTimeout(() => this.startConsumer(), 5000);
    }
  }

  private async consumeMessages(): Promise<void> {
    if (!this.isConsuming) return;

    try {
      await this.queueProvider.consume(
        rabbitMQConfig.queues.tasks,
        async (msg) => {
          const documentMetadata: DocumentModel = JSON.parse(
            msg.content.toString(),
          );
          try {
            await this.processVideo(documentMetadata);
            this.queueProvider.ack(msg);
          } catch (error: any) {
            console.error('Error processing message!');
            const isRetried = await this.queueProvider.initiateMessageRetry(
              msg,
              rabbitMQConfig.routingKeys.transcode,
            );
            if (!isRetried) {
              this.transcodingRepository.updateDocument(documentMetadata.id, {
                status: ProcessingStatusEnums.FAILED,
                errorInfo: error.message,
              });
            }
          }
        },
      );

      console.log(
        'Started consuming messages from queue:',
        rabbitMQConfig.queues.tasks,
      );
    } catch (error) {
      console.error('Error in message consumer:', error);
      this.isConsuming = false;
      // Retry after delay
      setTimeout(() => this.startConsumer(), 2000);
    }
  }

  private async processVideo(document: DocumentModel): Promise<void> {
    const docId = document.id;
    const sourceUrl = document.url;
    const sourceFileKey = document.fileKey;
    const mimeType = document.mimeType;
    const fileExtension = getFileExtension(mimeType);
    const directoryPath = join(process.cwd(), 'outputs', docId);
    const hlsOutputDir = join(directoryPath, 'hls-files');
    try {
      console.log('Processing video:', document);
      mkdirSync(directoryPath, { recursive: true });
      mkdirSync(hlsOutputDir, { recursive: true });

      // 1. Download video from source URL
      const inputPath = join(directoryPath, `${docId}-input${fileExtension}`);
      await this.downloadVideo(sourceUrl, inputPath);

      // 3. Generate HLS streams
      await this.generateHLSStreams(inputPath, hlsOutputDir);

      // 4. Upload HLS files to S3
      const hlsUploadedFiles = await this.uploadHLSFiles(hlsOutputDir, docId);
      const masterPlaylistInfo = hlsUploadedFiles.find(
        (file) => file.fileName === 'master.m3u8',
      );
      const updatedDocument: DocumentModel = {
        ...document,
        status: ProcessingStatusEnums.COMPLETED,
        url: masterPlaylistInfo?.url,
        fileKey: masterPlaylistInfo?.fileKey,
      };
      await this.transcodingRepository.updateDocument(
        document.id,
        updatedDocument,
      );
      console.log('Video processing completed for document:', docId);
    } catch (error: any) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        `Error processing video. ${error.message}`,
      );
    } finally {
      this.cleanupFiles(directoryPath);
      this.s3Provider.deleteFile(sourceFileKey);
      this.s3Provider.invalidateCloufrontCache(sourceFileKey);
    }
  }

  private async downloadVideo(url: string, outputPath: string): Promise<void> {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
    });

    const writer = createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  private async generateHLSStreams(
    originalVideoPath: string,
    outputPath: string,
  ): Promise<void> {
    try {
      // Create an array to store all transcoding promises
      const transcodingPromises = this.BITRATES.map(
        ({ resolution, bitrate }) => {
          const [width, height] = resolution.split('x');

          // Calculate max bitrate and buffer size
          const numericBitrate = parseInt(bitrate.replace('k', ''));
          const maxrate = `${Math.round(numericBitrate * 1.1)}k`;
          const bufsize = `${Math.round(numericBitrate * 1.5)}k`;

          console.log(`Transcoding ${resolution} @ ${bitrate}...`);

          const command = `ffmpeg -i "${originalVideoPath}" \
          -vf "scale=${width}:${height},format=yuv420p" \
          -c:v libx264 -b:v ${bitrate} -maxrate ${maxrate} -bufsize ${bufsize} \
          -preset fast -profile:v main \
          -c:a aac -ar 48000 -b:a 128k \
          -hls_time 10 \
          -hls_list_size 0 \
          -hls_playlist_type vod \
          -hls_segment_filename "${outputPath}/segment_${resolution}_%03d.ts" \
          "${outputPath}/index_${resolution}.m3u8"`;

          return new Promise<void>((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
              if (error) {
                console.log(error);
                reject(`Transcoding error for ${resolution}: ${stderr}`);
              } else {
                resolve();
              }
            });
          });
        },
      );

      // Wait for all transcoding processes to complete
      await Promise.all(transcodingPromises);

      // Generate master playlist after all variants are created
      let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n';
      for (const { resolution, bitrate } of this.BITRATES) {
        const bandwidthInBits = parseInt(bitrate.replace('k', '')) * 1000;
        masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidthInBits},RESOLUTION=${resolution}\n`;
        masterContent += `index_${resolution}.m3u8\n`;
      }

      writeFileSync(path.join(outputPath, 'master.m3u8'), masterContent);
    } catch (error: any) {
      console.log(error);
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        `Transcoding error: ${error.message}`,
      );
    }
  }

  private async uploadHLSFiles(
    hlsDirectoryPath: string,
    docId: string,
  ): Promise<
    {
      url: string;
      fileKey: string;
      fileName: string;
    }[]
  > {
    const hlsUploadedFiles = await this.s3Provider.uploadFolder(
      hlsDirectoryPath,
      `${docId}-hls-outputs`,
    );
    return hlsUploadedFiles;
  }

  private async cleanupFiles(directoryPath: string): Promise<void> {
    if (existsSync(directoryPath)) {
      rmSync(directoryPath, { recursive: true, force: true });
    }
  }

  public async stopProcessing(): Promise<void> {
    this.isConsuming = false;
  }
}
