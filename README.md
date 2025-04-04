# Video Transcoding Service (POC)

A proof-of-concept video transcoding service built with Node.js, TypeScript, and Express. This service is designed to handle video processing and transcoding operations for a video platform.

## Features

- Video upload and processing
- AWS S3 integration for storage
- CloudFront CDN integration
- RabbitMQ for message queuing
- Express.js REST API
- Dependency injection using InversifyJS
- FFmpeg integration for video transcoding
- MongoDB database integration
- Status monitoring

## Prerequisites

- Node.js (v16 or higher)
- FFmpeg installed on your system
- MongoDB instance
- RabbitMQ server
- AWS account with S3 and CloudFront access
- TypeScript knowledge

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/Video-Transcoding-Service-POC.git
cd Video-Transcoding-Service-POC
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
Create a `.env` file in the root directory with the following variables:
```env
# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000

# MongoDB Configuration
DB_CONNECTION_STRING=your_mongodb_connection_string

# AWS Configuration
S3_BUCKET_NAME=your_bucket_name
S3_BUCKET_REGION=ap-south-1
AWS_ACCESS_KEY=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_CLOUDFRONT_DOMAIN=your_cloudfront_domain
CLOUDFRONT_DISTRIBUTION_ID=your_distribution_id

# RabbitMQ Configuration
RABBITMQ_URL=your_rabbitmq_url
```

> ⚠️ **Security Note**: Never commit your actual `.env` file or expose sensitive credentials in your repository. The above values are placeholders - replace them with your actual credentials when deploying.

## Scripts

- `npm start` - Start the production server
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the TypeScript code
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Project Structure

```
src/
├── common/         # Shared utilities and interfaces
├── modules/        # Feature modules
├── container.ts    # Dependency injection container
├── index.ts        # Application entry point
└── rabbitMQ.config.ts  # RabbitMQ configuration

```

## Development

The project uses several development tools:
- TypeScript for type-safe code
- ESLint for code linting
- Prettier for code formatting
- Husky for git hooks
- Nodemon for development server
- Express Status Monitor for real-time monitoring

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.