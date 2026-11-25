// Where a job is in its life, as admins and HR see it. Every job is in exactly one state.
export enum EJobListState {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}
