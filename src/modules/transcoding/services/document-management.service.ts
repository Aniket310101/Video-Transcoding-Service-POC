import { injectable, inject } from 'inversify';
import { Response, Request } from 'express';
import { Readable } from 'stream';
import Busboy, { FileInfo } from 'busboy';
import DocumentModel from '../../../common/models/document.model';
import { ProcessingStatusEnums } from '../../../common/enums/processing-status.enums';
import {
  IDocumentManagementRepository,
  IDocumentManagementService,
} from '../transcoding.interfaces';
import {
  IAwsS3Provider,
  IQueueProvider,
} from '../../../common/common.interfaces';
import { CommonTypes } from '../../../common/common.types';
import ErrorHandler from '../../../common/errors/error-handler';
import { ErrorCodeEnums } from '../../../common/errors/error-enums';
import { TranscodingTypes } from '../transcoding.types';
import { rabbitMQConfig } from '../../../rabbitMQ.config';

@injectable()
export default class DocumentManagementService
  implements IDocumentManagementService
{
  constructor(
    @inject(CommonTypes.AwsS3Provider)
    private awsS3Provider: IAwsS3Provider,
    @inject(TranscodingTypes.TranscodingRepository)
    private transcodingRepository: IDocumentManagementRepository,
    @inject(CommonTypes.QueueProvider)
    private queueProvider: IQueueProvider,
  ) {}

  public async getDocument(id: string): Promise<DocumentModel> {
    try {
      const document = await this.transcodingRepository.getDocumentById(id);
      return document;
    } catch (error) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        'Error getting document! Error: ' + error,
      );
    }
  }

  async uploadFile(req: Request): Promise<DocumentModel> {
    let document: DocumentModel;
    try {
      document = await this.transcodingRepository.createDocument({
        status: ProcessingStatusEnums.UPLOADING,
      } as DocumentModel);
    } catch (error) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        'Error uploading file! Error: ' + error,
      );
    }
    try {
      document = await this.handleAsyncFileUpload(req, document);
    } catch (error: any) {
      document = await this.transcodingRepository.updateDocument(document.id, {
        status: ProcessingStatusEnums.FAILED,
        errorInfo: error.message,
      } as DocumentModel);
      document = {
        ...document,
        status: ProcessingStatusEnums.FAILED,
        errorInfo: error.message,
      };
    }
    return document;
  }

  private async handleAsyncFileUpload(
    req: Request,
    document: DocumentModel,
  ): Promise<DocumentModel> {
    let sizeInBytes = 0;
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

    return new Promise((resolve, reject) => {
      try {
        const busboy = Busboy({
          headers: req.headers,
          limits: {
            fileSize: MAX_FILE_SIZE,
            files: 1,
          },
        });

        // Handle file upload
        busboy.on(
          'file',
          async (
            fieldname: string,
            fileStream: Readable,
            fileInfo: FileInfo,
          ) => {
            try {
              // Validate file type
              if (
                fileInfo.mimeType !== 'video/mp4' &&
                fileInfo.mimeType !== 'video/mpeg' &&
                fileInfo.mimeType !== 'video/quicktime' && // .mov
                fileInfo.mimeType !== 'video/x-msvideo' && // .avi
                fileInfo.mimeType !== 'video/x-matroska' && // .mkv
                fileInfo.mimeType !== 'video/webm' && // .webm
                fileInfo.mimeType !== 'video/x-flv' && // .flv
                fileInfo.mimeType !== 'video/3gpp' && // .3gp
                fileInfo.mimeType !== 'video/x-ms-wmv' // .wmv
              ) {
                fileStream.resume(); // Drain the stream
                reject(
                  new ErrorHandler(
                    ErrorCodeEnums.BAD_REQUEST,
                    'Invalid file type! Only video files are supported.',
                  ),
                );
                return;
              }

              // Handle file stream errors
              fileStream.on('error', async (error) => {
                reject(
                  new ErrorHandler(
                    ErrorCodeEnums.INTERNAL_SERVER_ERROR,
                    `File stream error: ${error.message}`,
                  ),
                );
              });

              // Track file size
              fileStream.on('data', (data) => {
                sizeInBytes += data.length;
              });

              try {
                const { url, fileKey } =
                  await this.awsS3Provider.uploadFileMultipart(
                    fileStream,
                    fileInfo,
                  );

                const updatedDocument: DocumentModel = {
                  fileName: fileInfo.filename,
                  mimeType: fileInfo.mimeType,
                  status: ProcessingStatusEnums.PROCESSING,
                  url: url,
                  fileKey: fileKey,
                  size: sizeInBytes,
                };
                await this.transcodingRepository.updateDocument(
                  document.id,
                  updatedDocument,
                );

                await this.queueProvider.publishMessage(
                  JSON.stringify({
                    ...updatedDocument,
                    id: document.id,
                  }),
                  rabbitMQConfig.routingKeys.transcode,
                );

                resolve({ ...document, ...updatedDocument });
              } catch (uploadError: any) {
                reject(
                  new ErrorHandler(
                    ErrorCodeEnums.INTERNAL_SERVER_ERROR,
                    `Upload failed: ${uploadError.message}`,
                  ),
                );
              }
            } catch (fileHandlingError: any) {
              await this.transcodingRepository.updateDocument(document.id, {
                status: ProcessingStatusEnums.FAILED,
                errorInfo: `File handling error: ${fileHandlingError.message}`,
              } as DocumentModel);
              reject(
                new ErrorHandler(
                  ErrorCodeEnums.INTERNAL_SERVER_ERROR,
                  `File handling error: ${fileHandlingError.message}`,
                ),
              );
            }
          },
        );

        // Handle busboy errors
        busboy.on('error', async (error: any) => {
          reject(
            new ErrorHandler(
              ErrorCodeEnums.BAD_REQUEST,
              `Upload processing error: ${error.message}`,
            ),
          );
        });

        // Handle file size limit exceeded
        busboy.on('filesLimit', async () => {
          reject(
            new ErrorHandler(
              ErrorCodeEnums.BAD_REQUEST,
              'File size limit exceeded',
            ),
          );
        });

        // Handle request errors
        req.on('error', async (error) => {
          reject(
            new ErrorHandler(
              ErrorCodeEnums.INTERNAL_SERVER_ERROR,
              `Request error: ${error.message}`,
            ),
          );
        });

        // Start processing the request
        req.pipe(busboy);
      } catch (initError: any) {
        reject(
          new ErrorHandler(
            ErrorCodeEnums.INTERNAL_SERVER_ERROR,
            `Initialization error: ${initError.message}`,
          ),
        );
      }
    });
  }
}
