import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { ChatMessage, ChatMessageSchema } from 'src/chat/schemas/chat-message.schema';
import { ChatSession, ChatSessionSchema } from 'src/chat/schemas/chat-session.schema';

const SEQUENCE_INDEX = 'sessionId_1_sequence_1';

export interface SequencedMessage {
  _id: Types.ObjectId;
  sequence: number;
  createdAt: Date;
}

// Narrow views of the raw driver collections so the migration can run against fakes in tests.
export interface MessageCollection {
  aggregate<T>(pipeline: object[]): { toArray(): Promise<T[]> };
  find(
    filter: { sessionId: Types.ObjectId },
    options?: object,
  ): { toArray(): Promise<SequencedMessage[]> };
  bulkWrite(operations: any[]): Promise<unknown>;
  indexes(): Promise<Array<{ name?: string; unique?: boolean }>>;
  dropIndex(name: string): Promise<unknown>;
}

export interface SessionCollection {
  updateOne(filter: object, update: object): Promise<unknown>;
}

export function planSequenceRenumber(
  messages: SequencedMessage[],
): Array<{ _id: Types.ObjectId; sequence: number }> {
  // The old code assigned sequence at persist time, so createdAt is the intended order; the duplicated
  // sequence itself is not. One turn shares createdAt and its user ObjectId is generated before the
  // assistant's (same process counter), so _id breaks ties and keeps pairs together.
  const ordered = [...messages].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a._id.toHexString().localeCompare(b._id.toHexString()),
  );

  return ordered
    .map((message, index) => ({
      _id: message._id,
      sequence: index + 1,
      previous: message.sequence,
    }))
    .filter(message => message.sequence !== message.previous)
    .map(({ _id, sequence }) => ({ _id, sequence }));
}

export async function runChatMessageSequenceMigration(
  messages: MessageCollection,
  sessions: SessionCollection,
  createMessageIndexes: () => Promise<unknown>,
) {
  const duplicatedSessions = await messages
    .aggregate<{
      _id: Types.ObjectId;
    }>([
      { $group: { _id: { sessionId: '$sessionId', sequence: '$sequence' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $group: { _id: '$_id.sessionId' } },
    ])
    .toArray();

  let messagesRenumbered = 0;
  for (const { _id: sessionId } of duplicatedSessions) {
    const sessionMessages = await messages
      .find({ sessionId }, { projection: { sequence: 1, createdAt: 1 } })
      .toArray();
    const updates = planSequenceRenumber(sessionMessages);

    if (updates.length > 0) {
      await messages.bulkWrite(
        updates.map(({ _id, sequence }) => ({
          updateOne: { filter: { _id }, update: { $set: { sequence } } },
        })),
      );
      messagesRenumbered += updates.length;
    }

    // $max keeps a higher messageSeq the new code may already have reserved.
    await sessions.updateOne({ _id: sessionId }, { $max: { messageSeq: sessionMessages.length } });
  }

  // Same name, different options: Mongo refuses createIndexes until the old non-unique index is gone.
  const legacyIndex = (await messages.indexes()).find(
    index => index.name === SEQUENCE_INDEX && !index.unique,
  );
  if (legacyIndex) await messages.dropIndex(SEQUENCE_INDEX);
  await createMessageIndexes();

  return {
    sessionsRenumbered: duplicatedSessions.length,
    messagesRenumbered,
    uniqueIndexCreated: Boolean(legacyIndex),
  };
}

if (require.main === module) {
  (async () => {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) throw new Error('Missing MONGO_URL environment variable');

    await mongoose.connect(mongoUrl, { autoIndex: false });
    try {
      const messageModel = mongoose.model(ChatMessage.name, ChatMessageSchema);
      const sessionModel = mongoose.model(ChatSession.name, ChatSessionSchema);
      const report = await runChatMessageSequenceMigration(
        messageModel.collection as unknown as MessageCollection,
        sessionModel.collection as unknown as SessionCollection,
        () => messageModel.createIndexes(),
      );
      console.log(JSON.stringify(report, null, 2));
    } finally {
      await mongoose.disconnect();
    }
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
