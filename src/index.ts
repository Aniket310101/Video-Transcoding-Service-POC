import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { InversifyExpressServer } from 'inversify-express-utils';
import './modules/transcoding/controllers/transcoding.controller';
import bodyParser from 'body-parser';
import { ErrorMiddleware } from './common/errors/error.middleware';
import GlobalContainer from './container';
import expressStatusMonitor from 'express-status-monitor';
import { IVideoTranscodingService } from './modules/transcoding/transcoding.interfaces';
import { TranscodingTypes } from './modules/transcoding/transcoding.types';

async function bootstrap() {
  dotenv.config();
  
  // Initialize container
  GlobalContainer.initializeContainers();
  
  // Get video transcoding service and start processing
  const videoTranscodingService = GlobalContainer.getInstance().get<IVideoTranscodingService>(
    TranscodingTypes.VideoTranscodingService
  );

  // Start the Express server
  const server = new InversifyExpressServer(GlobalContainer.getInstance());
  server.setConfig((app) => {
    app.use(expressStatusMonitor());
    app.use(
      bodyParser.urlencoded({
        extended: true,
      }),
    );
    app.use(bodyParser.json({ limit: '50MB' }));
  });
  server.setErrorConfig((appForErrorConfig) => {
    appForErrorConfig.use(ErrorMiddleware);
  });

  const app = server.build();

  app.listen(process.env.PORT, () => {
    console.log(`Server is running at ${process.env.BASE_URL}`);
  });

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Performing graceful shutdown...');
    await videoTranscodingService.stopProcessing();
    process.exit(0);
  });
}

bootstrap().catch(console.error);
