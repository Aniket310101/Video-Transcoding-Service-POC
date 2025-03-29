import { v4 as uuidv4 } from 'uuid';

const documentSchema = {
  _id: { type: String, default: uuidv4 },
  status: { type: String, required: true },
  fileKey: { type: String },
  url: { type: String },
  hlsIndexUrl: { type: String },
  hlsSegmentUrls: [
    {
      url: { type: String },
      bandwidth: { type: Number },
      resolution: { type: String },
    },
  ],
  fileName: { type: String },
  size: { type: Number },
  mimeType: { type: String },
  errorInfo: { type: String },
};

export default documentSchema;
