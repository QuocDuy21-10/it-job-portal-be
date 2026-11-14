import { NotificationsGateway } from './notifications.gateway';

const ALLOWED_ORIGIN = 'http://localhost:3000';
const activeUser = { isActive: true, isLocked: false, isDeleted: false };

function setup(options: { payload?: unknown; user?: unknown } = {}) {
  const payload = 'payload' in options ? options.payload : { sub: 'user-1', type: 'access' };
  const user = 'user' in options ? options.user : activeUser;
  const env: Record<string, string> = {
    CORS_ORIGINS: ALLOWED_ORIGIN,
    JWT_ACCESS_TOKEN_SECRET: 'secret',
  };
  const jwtService = { verifyAsync: jest.fn().mockResolvedValue(payload) };
  const configService = { get: jest.fn((key: string) => env[key]) };
  const exec = jest.fn().mockResolvedValue(user);
  const userModel = {
    findById: jest.fn(() => ({ select: () => ({ lean: () => ({ exec }) }) })),
  };
  const gateway = new NotificationsGateway(
    jwtService as any,
    configService as any,
    userModel as any,
  );
  return { gateway, jwtService, userModel };
}

function createClient(origin?: string) {
  return {
    id: 'socket-1',
    handshake: { auth: { token: 'token' }, headers: origin ? { origin } : {} },
    data: {} as Record<string, unknown>,
    join: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe('NotificationsGateway.handleConnection', () => {
  it('joins the user room for an active account from an allowed origin', async () => {
    const { gateway } = setup();
    const client = createClient(ALLOWED_ORIGIN);

    await gateway.handleConnection(client as any);

    expect(client.join).toHaveBeenCalledWith('user_user-1');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('accepts a client that sends no Origin header', async () => {
    const { gateway } = setup();
    const client = createClient();

    await gateway.handleConnection(client as any);

    expect(client.join).toHaveBeenCalledWith('user_user-1');
  });

  it('disconnects an origin outside the allowlist before reading the token', async () => {
    const { gateway, jwtService } = setup();
    const client = createClient('https://evil.example');

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('disconnects a token that is not an access token', async () => {
    const { gateway, userModel } = setup({ payload: { sub: 'user-1', type: 'refresh' } });
    const client = createClient(ALLOWED_ORIGIN);

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(userModel.findById).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('disconnects when the user no longer exists', async () => {
    const { gateway } = setup({ user: null });
    const client = createClient(ALLOWED_ORIGIN);

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('disconnects a locked account', async () => {
    const { gateway } = setup({ user: { ...activeUser, isLocked: true } });
    const client = createClient(ALLOWED_ORIGIN);

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });
});
