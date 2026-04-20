import { Request, Response } from 'express';
import { EAuthProvider } from '../enums/auth-provider.enum';
import { IUser } from 'src/users/user.interface';
import { jest } from '@jest/globals';

export function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'user-id-123' },
    name: 'Test User',
    email: 'test@example.com',
    password: 'hashed-password',
    authProvider: EAuthProvider.LOCAL,
    isActive: true,
    isLocked: false,
    isDeleted: false,
    scheduledDeletionAt: null,
    role: { _id: { toString: () => 'role-id-1' }, name: 'NORMAL_USER' },
    company: null,
    savedJobs: [],
    companyFollowed: [],
    toObject: jest.fn().mockReturnThis(),
    ...overrides,
  } as any;
}

export function makeIUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: 'user-id-123',
    name: 'Test User',
    email: 'test@example.com',
    authProvider: EAuthProvider.LOCAL,
    hasPassword: true,
    role: { _id: 'role-id-1', name: 'NORMAL_USER' },
    savedJobs: [],
    companyFollowed: [],
    ...overrides,
  };
}

export function makeGoogleUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'google-user-id-1' },
    name: 'Google User',
    email: 'google@example.com',
    password: null,
    authProvider: EAuthProvider.GOOGLE,
    isActive: true,
    isLocked: false,
    isDeleted: false,
    role: { _id: { toString: () => 'role-id-1' }, name: 'NORMAL_USER' },
    company: null,
    savedJobs: [],
    companyFollowed: [],
    ...overrides,
  } as any;
}

export function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    user: makeIUser(),
    headers: { 'user-agent': 'TestAgent/1.0' },
    cookies: { refresh_token: 'mock-refresh-token' },
    ip: '127.0.0.1',
    ...overrides,
  } as any;
}

export function makeResponse(): Response {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as any;
}

export const registerDto = {
  name: 'New User',
  email: 'new@example.com',
  password: 'StrongP@ss1',
  age: 25,
  gender: 'male',
  address: 'Hanoi',
} as any;

export const verifyAuthDto = {
  email: 'test@example.com',
  code: '123456',
};

export const changePasswordDto = {
  currentPassword: 'OldP@ss1',
  newPassword: 'NewP@ss2',
};

export const setPasswordDto = {
  newPassword: 'NewP@ss1',
};

export const forgotPasswordDto = {
  email: 'test@example.com',
};

export const resetPasswordDto = {
  token: 'valid-token',
  email: 'test@example.com',
  newPassword: 'NewP@ss1',
};

export const mockGoogleProfile = {
  googleId: 'google-id-abc',
  email: 'google@example.com',
  name: 'Google User',
  avatar: 'https://example.com/avatar.jpg',
};

export const mockGoogleLoginResult = {
  access_token: 'mock-access-token',
  user: { _id: 'google-user-id-1', name: 'Google User', email: 'google@example.com' },
};
