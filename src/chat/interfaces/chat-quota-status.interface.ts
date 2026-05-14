export interface IChatQuotaStatus {
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: Date;
  unlimited: boolean;
  unavailable?: boolean;
}
