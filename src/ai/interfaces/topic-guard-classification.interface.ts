export type TopicGuardCategory = 'on_topic' | 'code_generation' | 'off_topic' | 'harmful';

export interface TopicGuardClassification {
  onTopic: boolean;
  reason: string;
  category: TopicGuardCategory;
}
