import * as dotenv from 'dotenv';
dotenv.config();

export const rabbitMQConfig = {
  url: process.env.RABBITMQ_URL,
  exchange: 'video_processing',
  queues: {
    tasks: 'video_transcoding_tasks',
  },
  routingKeys: {
    transcode: 'transcode',
  },
  maxRetryCount: 3,
  retryDelay: 3000,
};
