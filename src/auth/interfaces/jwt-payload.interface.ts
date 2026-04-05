export interface IJwtAccessPayload {
  sub: string;
  type: 'access';
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
