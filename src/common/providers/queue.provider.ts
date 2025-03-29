import { injectable } from 'inversify';
import amqplib, { Channel } from 'amqplib';
import { rabbitMQConfig } from '../../rabbitMQ.config';
import { IQueueProvider } from '../common.interfaces';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';

@injectable()
export default class QueueProvider implements IQueueProvider {
  private static connection: amqplib.ChannelModel;
  private static channel: Channel;
  private static isChannelInitialized = false;

  async initialize(): Promise<void> {
    try {
      // 1. Connect to RabbitMQ
      QueueProvider.connection = await amqplib.connect(rabbitMQConfig.url);
      console.log('Connected to RabbitMQ');

      // 2. Create a channel
      QueueProvider.channel = await QueueProvider.connection.createChannel();

      // 3. Setup exchange
      await QueueProvider.channel.assertExchange(
        rabbitMQConfig.exchange,
        'direct',
        { durable: true },
      );

      // 4. Setup queues
      await QueueProvider.channel.assertQueue(rabbitMQConfig.queues.tasks, {
        durable: true,
      });

      // 5. Bind queues to exchange
      await QueueProvider.channel.bindQueue(
        rabbitMQConfig.queues.tasks,
        rabbitMQConfig.exchange,
        rabbitMQConfig.routingKeys.transcode,
      );

      QueueProvider.isChannelInitialized = true;

      // 6. Handle connection closure and reconnection
      QueueProvider.connection.on('close', () => {
        console.log('RabbitMQ connection closed');
        QueueProvider.connection = null;
        QueueProvider.channel = null;
        QueueProvider.isChannelInitialized = false;
      });
    } catch (error) {
      console.error('Error connecting to RabbitMQ:', error);
      setTimeout(() => this.initialize(), 5000);
    }
  }

  isChannelInitialized(): boolean {
    return QueueProvider.isChannelInitialized;
  }

  async publishMessage(
    message: string,
    routingKey: string,
    retryCount?: number,
  ): Promise<void> {
    if (!QueueProvider.channel) {
      throw new Error('Channel not initialized');
    }
    await QueueProvider.channel.publish(
      rabbitMQConfig.exchange,
      routingKey,
      Buffer.from(message),
      {
        persistent: true,
        contentType: 'application/json',
        headers: {
          'x-retry-count': retryCount || 0,
        },
        messageId: uuidv4(),
      },
    );
  }

  async consumeMessage(queueName: string): Promise<any> {
    if (!QueueProvider.channel) {
      throw new Error('Channel not initialized');
    }
    const message = await QueueProvider.channel.get(queueName);
    return message;
  }

  async publishStream(
    stream: Readable,
    routingKey: string,
    metadata: {
      fileSize?: number;
      fileName?: string;
      mimeType?: string;
      chunkSize?: number;
    },
  ): Promise<void> {
    if (!QueueProvider.channel) {
      throw new Error('Channel not initialized');
    }

    const messageId = uuidv4();
    const chunkSize = metadata.chunkSize || 1024 * 1024; // 1MB default chunk size
    let sequence = 0;
    let bytesProcessed = 0;

    return new Promise((resolve, reject) => {
      // Handle stream errors
      stream.on('error', (error) => {
        reject(new Error(`Stream error: ${error.message}`));
      });

      // Process the stream
      stream.on('data', async (chunk: Buffer) => {
        try {
          // Pause the stream to handle backpressure
          stream.pause();

          // Split chunk if larger than chunkSize
          for (let i = 0; i < chunk.length; i += chunkSize) {
            const chunkPart = chunk.slice(i, i + chunkSize);
            bytesProcessed += chunkPart.length;

            // Publish chunk
            await QueueProvider.channel.publish(
              rabbitMQConfig.exchange,
              routingKey,
              chunkPart,
              {
                persistent: true,
                messageId: messageId,
                contentType: metadata.mimeType || 'application/octet-stream',
                headers: {
                  'x-message-type': 'stream',
                  'x-sequence': sequence++,
                  'x-file-name': metadata.fileName,
                  'x-total-size': metadata.fileSize,
                  'x-chunk-size': chunkPart.length,
                  'x-bytes-processed': bytesProcessed,
                  'x-is-last': bytesProcessed === metadata.fileSize,
                },
                timestamp: Date.now(),
                appId: 'video-transcoding-service',
              },
            );
          }

          // Resume the stream
          stream.resume();
        } catch (error: any) {
          reject(new Error(`Failed to publish chunk: ${error.message}`));
        }
      });

      // Handle stream end
      stream.on('end', async () => {
        try {
          // Send end marker message
          await QueueProvider.channel.publish(
            rabbitMQConfig.exchange,
            routingKey,
            Buffer.from(''),
            {
              persistent: true,
              messageId: messageId,
              headers: {
                'x-message-type': 'stream',
                'x-sequence': sequence,
                'x-is-end': true,
                'x-total-size': metadata.fileSize,
                'x-total-chunks': sequence,
              },
            },
          );
          resolve();
        } catch (error: any) {
          reject(new Error(`Failed to send end marker: ${error.message}`));
        }
      });
    });
  }

  async consumeStream(
    queueName: string,
    onChunk: (chunk: Buffer, metadata: any) => Promise<void>,
  ): Promise<void> {
    if (!QueueProvider.channel) {
      throw new Error('Channel not initialized');
    }

    const streamBuffers = new Map<
      string,
      {
        chunks: Buffer[];
        metadata: any;
      }
    >();

    await QueueProvider.channel.consume(queueName, async (msg) => {
      if (!msg) return;

      const messageId = msg.properties.messageId;
      const headers = msg.properties.headers;

      if (!streamBuffers.has(messageId)) {
        streamBuffers.set(messageId, {
          chunks: [],
          metadata: headers,
        });
      }

      const streamData = streamBuffers.get(messageId);

      if (headers['x-is-end']) {
        // Process complete stream
        const completeBuffer = Buffer.concat(streamData.chunks);
        await onChunk(completeBuffer, streamData.metadata);
        streamBuffers.delete(messageId);
      } else {
        // Store chunk
        streamData.chunks.push(msg.content);
      }

      QueueProvider.channel.ack(msg);
    });
  }

  async consume(
    queueName: string,
    onMessage: (msg: amqplib.ConsumeMessage) => Promise<void>,
    options: amqplib.Options.Consume = {},
  ): Promise<void> {
    if (!QueueProvider.channel) {
      throw new Error('Channel not initialized');
    }

    // Set prefetch to 1 to ensure fair distribution of messages
    await QueueProvider.channel.prefetch(1);

    await QueueProvider.channel.consume(
      queueName,
      async (msg) => {
        if (msg) {
          await onMessage(msg);
        }
      },
      { ...options, noAck: false },
    );
  }

  ack(message: amqplib.ConsumeMessage): void {
    if (!QueueProvider.channel) {
      throw new Error('Channel not initialized');
    }
    QueueProvider.channel.ack(message);
  }

  nack(
    message: amqplib.ConsumeMessage,
    allUpTo: boolean,
    requeue: boolean,
  ): void {
    if (!QueueProvider.channel) {
      throw new Error('Channel not initialized');
    }
    QueueProvider.channel.nack(message, allUpTo, requeue);
  }

  async initiateMessageRetry(
    message: amqplib.ConsumeMessage,
    routingKey: string,
  ): Promise<boolean> {
    const retryCount = (message.properties.headers['x-retry-count'] || 0) + 1;
    if (retryCount <= rabbitMQConfig.maxRetryCount) {
      console.log(
        `Retrying message ${message.properties.messageId} (attempt ${retryCount}/${rabbitMQConfig.maxRetryCount})`,
      );
      this.nack(message, false, false);
      await new Promise((resolve) =>
        setTimeout(resolve, rabbitMQConfig.retryDelay),
      );
      await this.publishMessage(
        message.content.toString(),
        routingKey,
        retryCount,
      );
      return true;
    } else {
      this.nack(message, false, false);
      return false;
    }
  }
}
