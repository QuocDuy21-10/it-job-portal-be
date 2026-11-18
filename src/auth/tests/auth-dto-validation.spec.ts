import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthRegisterDto } from '../dto/auth-register.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { SetPasswordDto } from '../dto/set-password.dto';

const failedProperties = async (cls: any, body: object) =>
  (await validate(plainToInstance(cls, body) as object)).map(error => error.property);

describe('auth DTO validation', () => {
  const validRegister = {
    name: 'Nguyễn Văn A',
    email: 'User@Example.com',
    password: 'StrongP@ss1',
    acceptTerms: true,
  };

  it('accepts a valid registration with a Vietnamese name', async () => {
    expect(await failedProperties(AuthRegisterDto, validRegister)).toEqual([]);
  });

  it('rejects HTML in the name, a weak password and unaccepted terms on register', async () => {
    const failed = await failedProperties(AuthRegisterDto, {
      ...validRegister,
      name: '<img src=x onerror=alert(1)>',
      password: 'abcdef',
      acceptTerms: false,
    });

    expect(failed.sort()).toEqual(['acceptTerms', 'name', 'password']);
  });

  it('rejects a missing acceptTerms on register', async () => {
    expect(
      await failedProperties(AuthRegisterDto, { ...validRegister, acceptTerms: undefined }),
    ).toEqual(['acceptTerms']);
  });

  it.each([
    [ResetPasswordDto, { token: 't', email: 'a@b.co', newPassword: 'abcdef' }],
    [ChangePasswordDto, { currentPassword: 'old', newPassword: 'abcdef' }],
    [SetPasswordDto, { newPassword: 'abcdef' }],
  ])('%p applies the same strong-password policy', async (cls, body) => {
    expect(await failedProperties(cls, body)).toEqual(['newPassword']);
    expect(await failedProperties(cls, { ...body, newPassword: 'NewP@ss123' })).toEqual([]);
  });

  it('lowercases emails on forgot and reset so one account maps to one reset key', () => {
    expect(plainToInstance(ForgotPasswordDto, { email: 'User@Example.com' }).email).toBe(
      'user@example.com',
    );
    expect(plainToInstance(ResetPasswordDto, { token: 't', email: 'User@Example.com' }).email).toBe(
      'user@example.com',
    );
  });
});
