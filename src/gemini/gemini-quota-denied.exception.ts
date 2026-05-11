import { GeminiQuotaScope, GeminiQuotaWorkload } from './gemini-quota.constants';

export class GeminiQuotaDeniedException extends Error {
  public readonly code = 'GEMINI_QUOTA_DENIED';
  public readonly retryAt: Date;

  constructor(
    public readonly workload: GeminiQuotaWorkload,
    public readonly scope: GeminiQuotaScope,
    public readonly retryAfterMs: number,
    public readonly remainingMinuteQuota: number,
    public readonly remainingDayQuota: number,
  ) {
    super(
      `Gemini quota denied for ${workload}. ${scope} quota is exhausted. Retry in ${retryAfterMs}ms.`,
    );
    this.name = GeminiQuotaDeniedException.name;
    this.retryAt = new Date(Date.now() + retryAfterMs);
  }
}
