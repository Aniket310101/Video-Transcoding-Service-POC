import { FileInfo } from 'busboy';
import { Readable } from 'stream';
import amqplib from 'amqplib';
export interface IAwsS3Provider {
  initialize(): Promise<void>;
  getSignedS3Url(fileKey: string): Promise<string>;
  deleteFile(fileKey: string): Promise<void>;
  invalidateCloufrontCache(fileKey: string): Promise<void>;
  uploadFileMultipart(
    fileStream: Readable,
    fileInfo: FileInfo,
    fileKey?: string,
    folderKey?: string,
  ): Promise<{ url: string; fileKey: string }>;
  uploadFolder(
    folderPath: string,
    s3Key: string,
  ): Promise<{ url: string; fileKey: string; fileName: string }[]>;
}

export interface IQueueProvider {
  isChannelInitialized(): boolean;
  initialize(): Promise<void>;
  publishMessage(
    message: string,
    routingKey: string,
    retryCount?: number,
  ): Promise<void>;
  consumeMessage(queueName: string): Promise<any>;
  publishStream(
    stream: Readable,
    routingKey: string,
    metadata: {
      fileSize?: number;
      fileName?: string;
      mimeType?: string;
      chunkSize?: number;
    },
  ): Promise<void>;
  consumeStream(
    queueName: string,
    onChunk: (chunk: Buffer, metadata: any) => Promise<void>,
  ): Promise<void>;
  consume(
    queueName: string,
    onMessage: (msg: amqplib.ConsumeMessage) => Promise<void>,
    options?: amqplib.Options.Consume,
  ): Promise<void>;
  ack(message: amqplib.ConsumeMessage): void;
  nack(
    message: amqplib.ConsumeMessage,
    allUpTo: boolean,
    requeue: boolean,
  ): void;
  initiateMessageRetry(
    message: amqplib.ConsumeMessage,
    routingKey: string,
  ): Promise<boolean>;
}
