export interface IJwtAccessPayload {
  sub: string;
  type: 'access';
  /** Session `_id`; the token dies with its session (logout, lock, password change). */
  sid?: string;
  iss?: string;
  iat?: number;
  exp?: number;
}
export interface IJwtRefreshPayload {
  sub: string;
  type: 'refresh';
  iss?: string;
  iat?: number;
  exp?: number;
}
export type JwtPayload = IJwtAccessPayload | IJwtRefreshPayload;

// Type guard để kiểm tra payload type
export function isAccessTokenPayload(payload: JwtPayload): payload is IJwtAccessPayload {
  return payload.type === 'access';
}

export function isRefreshTokenPayload(payload: JwtPayload): payload is IJwtRefreshPayload {
  return payload.type === 'refresh';
}

// Tokens are only ever signed with HS256; verifiers pin it so no other HMAC variant is accepted.
export const JWT_ALGORITHM = 'HS256';
