import { Schema } from 'mongoose';
import { AiUsageLogSchema } from 'src/chat/schemas/ai-usage-log.schema';
import { ChatMessageSchema } from 'src/chat/schemas/chat-message.schema';
import { ChatQuotaPolicySchema } from 'src/chat/schemas/chat-quota-policy.schema';
import { ChatSessionSchema } from 'src/chat/schemas/chat-session.schema';
import { ChatToolActionSchema } from 'src/chat/schemas/chat-tool-action.schema';
import { JobSchema } from 'src/jobs/schemas/job.schema';
import { NotificationSchema } from 'src/notifications/schemas/notification.schema';
import { SessionSchema } from 'src/sessions/schemas/session.schema';
import { INDEX_AUDIT_DROPS } from './index-audit';

const SCHEMAS_BY_COLLECTION: Record<string, Schema> = {
  jobs: JobSchema,
  ai_usage_logs: AiUsageLogSchema,
  chat_messages: ChatMessageSchema,
  chat_sessions: ChatSessionSchema,
  chat_tool_actions: ChatToolActionSchema,
  chat_quota_policies: ChatQuotaPolicySchema,
  notifications: NotificationSchema,
  sessions: SessionSchema,
};

// Same naming rule MongoDB uses for unnamed indexes; key order is preserved.
const declaredIndexNames = (schema: Schema): string[] =>
  schema.indexes().map(([fields, options]) =>
    typeof options?.name === 'string'
      ? options.name
      : Object.entries(fields)
          .map(([field, direction]) => `${field}_${direction}`)
          .join('_'),
  );

describe('index audit schemas', () => {
  it.each(INDEX_AUDIT_DROPS.map(drop => [drop.collection, drop.indexName]))(
    '%s schema no longer declares %s',
    (collection, indexName) => {
      expect(SCHEMAS_BY_COLLECTION[collection]).toBeDefined();
      expect(declaredIndexNames(SCHEMAS_BY_COLLECTION[collection])).not.toContain(indexName);
    },
  );

  it('JobSchema declares the home page compound index in ESR order', () => {
    expect(declaredIndexNames(JobSchema)).toContain(
      'approvalStatus_1_isActive_1_createdAt_-1_isDeleted_1_endDate_1',
    );
  });

  it('keeps the compound indexes that cover the dropped prefixes', () => {
    expect(declaredIndexNames(SessionSchema)).toContain('userId_1_isActive_1');
    expect(declaredIndexNames(ChatMessageSchema)).toEqual(
      expect.arrayContaining(['sessionId_1_sequence_1', 'userId_1_createdAt_-1']),
    );
  });
});
