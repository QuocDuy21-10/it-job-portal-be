import mongoose, { Schema, Types } from 'mongoose';
import { CvProfileSchema } from 'src/cv-profiles/schemas/cv-profile.schema';
import { ChatSessionSchema } from 'src/chat/schemas/chat-session.schema';
import { ChatMessageSchema } from 'src/chat/schemas/chat-message.schema';
import { ChatToolActionSchema } from 'src/chat/schemas/chat-tool-action.schema';
import { AiUsageLogSchema } from 'src/chat/schemas/ai-usage-log.schema';

// The account-deletion processor filters these collections by a string userId. With `type: Types.ObjectId`
// @nestjs/mongoose produced Mixed paths, so the string was never cast and the deletes matched nothing.
const cases: Array<[string, Schema, string[]]> = [
  ['CvProfile', CvProfileSchema, ['userId']],
  ['ChatSession', ChatSessionSchema, ['userId', 'legacyConversationId']],
  ['ChatMessage', ChatMessageSchema, ['userId', 'sessionId']],
  ['ChatToolAction', ChatToolActionSchema, ['userId', 'sessionId']],
  ['AiUsageLog', AiUsageLogSchema, ['userId', 'conversationId', 'sessionId']],
];

describe('id paths used to delete a user’s data', () => {
  const odm = new mongoose.Mongoose();
  const userId = new Types.ObjectId().toHexString();

  it.each(cases)('%s declares its id paths as ObjectId', (_name, schema, paths) => {
    for (const path of paths) {
      expect(schema.path(path).instance).toBe('ObjectId');
    }
  });

  it.each(cases)('%s casts a string userId filter to ObjectId', (name, schema) => {
    const model = odm.model(name, schema);
    const query = model.find({ userId });
    query.cast(model);

    expect(query.getFilter().userId).toBeInstanceOf(Types.ObjectId);
    expect(String(query.getFilter().userId)).toBe(userId);
  });
});
