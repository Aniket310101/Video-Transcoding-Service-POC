import mongoose, { Schema } from 'mongoose';
import ErrorHandler from '../errors/error-handler';
import { ErrorCodeEnums } from '../errors/error-enums';
import documentSchema from './schemas/document.schema';
import { injectable } from 'inversify';

@injectable()
export default class BaseDatastore {
  static documentsDB: mongoose.Model<typeof documentSchema>;
  async initializeDB(): Promise<void> {
    const dbUrl: string = process.env.DB_CONNECTION_STRING as string;
    try {
      await mongoose.connect(dbUrl);
      console.log('Connected to DB!');
    } catch (err) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        'Could Not Connect to DB!',
      );
    }
    try {
      await this.initializeDBModels();
    } catch (err) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        'Error in intializing DB models!',
      );
    }
  }

  private async initializeDBModels(): Promise<void> {
    BaseDatastore.documentsDB = mongoose.model<typeof documentSchema>(
      'documents',
      new Schema(documentSchema, { timestamps: true, _id: true, id: true }),
    );
  }
}
