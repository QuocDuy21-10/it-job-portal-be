import * as crypto from 'crypto';

export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashOtp(code: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

export function verifyOtp(submittedCode: string, storedHash: string, secret: string): boolean {
  const submittedHash = hashOtp(submittedCode, secret);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(submittedHash, 'hex'),
      Buffer.from(storedHash, 'hex'),
    );
  } catch {
    return false;
  }
}
