import { Types } from 'mongoose';
import {
  MessageCollection,
  SequencedMessage,
  SessionCollection,
  planSequenceRenumber,
  runChatMessageSequenceMigration,
} from './chat-message-sequence';

const at = (second: number) => new Date(Date.UTC(2026, 10, 20, 8, 0, second));
const id = (hex: string) => new Types.ObjectId(hex.padStart(24, '0'));

describe('planSequenceRenumber', () => {
  it('renumbers duplicated sequences by persist time and keeps each user/assistant pair together', () => {
    const messages: SequencedMessage[] = [
      { _id: id('1'), sequence: 1, createdAt: at(0) },
      { _id: id('2'), sequence: 2, createdAt: at(0) },
      { _id: id('a'), sequence: 3, createdAt: at(5) },
      { _id: id('b'), sequence: 4, createdAt: at(5) },
      { _id: id('c'), sequence: 3, createdAt: at(6) },
      { _id: id('d'), sequence: 4, createdAt: at(6) },
    ];

    // Sorting by the old sequence first would give a, c, b, d (user, user, assistant, assistant).
    expect(planSequenceRenumber(messages)).toEqual([
      { _id: id('c'), sequence: 5 },
      { _id: id('d'), sequence: 6 },
    ]);
  });

  it('returns no updates for an already contiguous session', () => {
    expect(
      planSequenceRenumber([
        { _id: id('1'), sequence: 1, createdAt: at(0) },
        { _id: id('2'), sequence: 2, createdAt: at(0) },
      ]),
    ).toEqual([]);
  });
});

describe('runChatMessageSequenceMigration', () => {
  type Doc = SequencedMessage & { sessionId: Types.ObjectId };

  function fakeCollections(docs: Doc[], uniqueIndex: boolean) {
    const indexes = [{ name: '_id_' }, { name: 'sessionId_1_sequence_1', unique: uniqueIndex }];
    const messages: MessageCollection = {
      aggregate: <T>() => ({
        toArray: async () => {
          const counts = new Map<string, { sessionId: Types.ObjectId; n: number }>();
          for (const doc of docs) {
            const key = `${doc.sessionId}:${doc.sequence}`;
            const entry = counts.get(key) ?? { sessionId: doc.sessionId, n: 0 };
            entry.n += 1;
            counts.set(key, entry);
          }
          const sessions = new Map<string, Types.ObjectId>();
          for (const { sessionId, n } of counts.values()) {
            if (n > 1) sessions.set(`${sessionId}`, sessionId);
          }
          return [...sessions.values()].map(sessionId => ({ _id: sessionId })) as T[];
        },
      }),
      find: (filter: { sessionId: Types.ObjectId }) => ({
        toArray: async () => docs.filter(doc => doc.sessionId.equals(filter.sessionId)),
      }),
      bulkWrite: jest.fn(async (ops: any[]) => {
        for (const op of ops) {
          const doc = docs.find(d => d._id.equals(op.updateOne.filter._id));
          if (doc) doc.sequence = op.updateOne.update.$set.sequence;
        }
      }),
      indexes: async () => indexes,
      dropIndex: jest.fn(async () => undefined),
    };
    const sessions: SessionCollection = { updateOne: jest.fn(async () => undefined) };
    const createMessageIndexes = jest.fn(async () => undefined);
    return { messages, sessions, createMessageIndexes };
  }

  it('renumbers only duplicated sessions, raises messageSeq, and replaces the non-unique index', async () => {
    const dupSession = id('5001');
    const cleanSession = id('5002');
    const docs: Doc[] = [
      { sessionId: dupSession, _id: id('a'), sequence: 1, createdAt: at(1) },
      { sessionId: dupSession, _id: id('b'), sequence: 2, createdAt: at(1) },
      { sessionId: dupSession, _id: id('c'), sequence: 1, createdAt: at(2) },
      { sessionId: dupSession, _id: id('d'), sequence: 2, createdAt: at(2) },
      { sessionId: cleanSession, _id: id('e'), sequence: 1, createdAt: at(3) },
    ];
    const { messages, sessions, createMessageIndexes } = fakeCollections(docs, false);

    const report = await runChatMessageSequenceMigration(messages, sessions, createMessageIndexes);

    expect(report).toEqual({
      sessionsRenumbered: 1,
      messagesRenumbered: 2,
      uniqueIndexCreated: true,
    });
    expect(docs.filter(d => d.sessionId === dupSession).map(d => d.sequence)).toEqual([1, 2, 3, 4]);
    expect(sessions.updateOne).toHaveBeenCalledTimes(1);
    expect(sessions.updateOne).toHaveBeenCalledWith(
      { _id: dupSession },
      { $max: { messageSeq: 4 } },
    );
    expect(messages.dropIndex).toHaveBeenCalledWith('sessionId_1_sequence_1');
    expect(createMessageIndexes).toHaveBeenCalled();
  });

  it('is a no-op on a second run', async () => {
    const { messages, sessions, createMessageIndexes } = fakeCollections(
      [{ sessionId: id('5001'), _id: id('a'), sequence: 1, createdAt: at(1) }],
      true,
    );

    const report = await runChatMessageSequenceMigration(messages, sessions, createMessageIndexes);

    expect(report).toEqual({
      sessionsRenumbered: 0,
      messagesRenumbered: 0,
      uniqueIndexCreated: false,
    });
    expect(messages.bulkWrite).not.toHaveBeenCalled();
    expect(messages.dropIndex).not.toHaveBeenCalled();
    expect(createMessageIndexes).toHaveBeenCalled();
  });
});
