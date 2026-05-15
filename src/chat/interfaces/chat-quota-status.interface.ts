export interface IChatQuotaStatus {
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: Date;
  unlimited: boolean;
  unavailable?: boolean;
}

export interface IChatQuotaPublicStatus {
  remainingQuota: number | null;
  nextResetTime: number;
}

export interface IChatQuotaReservation {
  key?: string;
  consumed: boolean;
  status: IChatQuotaStatus;
}
