import mongoose from 'mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { IUser } from 'src/users/user.interface';
import { IBulkDeleteResult } from '../interfaces/bulk-delete-result.interface';

export async function bulkSoftDelete(
  model: SoftDeleteModel<any>,
  ids: string[],
  user: IUser,
): Promise<IBulkDeleteResult> {
  const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));

  const result = await model.updateMany(
    { _id: { $in: objectIds }, isDeleted: { $ne: true } },
    {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: { _id: user._id, email: user.email },
    },
  );

  return {
    deletedCount: result.modifiedCount,
    requestedCount: ids.length,
  };
}
