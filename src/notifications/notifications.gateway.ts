import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { assertAuthenticatedAccountState } from 'src/auth/utils/assert-authenticated-account-state.util';
import { parseCorsOrigins } from 'src/config/cors-origins';
import { User, UserDocument } from 'src/users/schemas/user.schema';

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    // Evaluated per handshake: process.env is not loaded yet when this decorator runs.
    origin: (_origin, callback) =>
      callback(null, parseCorsOrigins(process.env.CORS_ORIGINS || process.env.FE_URL)),
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  afterInit() {
    this.logger.log('NotificationsGateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // Browsers do not apply CORS to the WebSocket transport, so the allowlist is enforced here too.
      const origin = client.handshake.headers?.origin;
      const allowedOrigins = parseCorsOrigins(
        this.configService.get<string>('CORS_ORIGINS') || this.configService.get<string>('FE_URL'),
      );
      if (origin && !allowedOrigins.includes(origin)) {
        this.logger.warn(`Client ${client.id} disconnected: origin not allowed`);
        client.disconnect();
        return;
      }

      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} disconnected: no token provided`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
      });

      if (!payload?.sub || payload.type !== 'access') {
        this.logger.warn(`Client ${client.id} disconnected: invalid token payload`);
        client.disconnect();
        return;
      }

      const user = await this.userModel
        .findById(payload.sub)
        .select('isActive isLocked isDeleted scheduledDeletionAt')
        .lean()
        .exec();
      if (!user) {
        this.logger.warn(`Client ${client.id} disconnected: user not found`);
        client.disconnect();
        return;
      }
      // Throws for inactive, locked, deleted or pending-deletion accounts; the catch below disconnects.
      assertAuthenticatedAccountState(user, 'access');

      const userId = payload.sub;

      // Store user info on the socket for later use
      client.data.userId = userId;

      // Join user-specific room (supports multi-device)
      client.join(`user_${userId}`);

      // Track socket mapping
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(client.id);

      this.logger.log(
        `Client ${client.id} connected for user ${userId} (${this.userSockets.get(userId).size} connections)`,
      );
    } catch (error) {
      this.logger.warn(`Client ${client.id} disconnected: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(client.id);
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
      }
      this.logger.log(`Client ${client.id} disconnected for user ${userId}`);
    }
  }

  /**
   * Send an event to a specific user (all their connected devices)
   */
  sendToUser(userId: string, event: string, payload: any) {
    this.server.to(`user_${userId}`).emit(event, payload);
  }

  /**
   * Check if a user is currently connected
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }

  /**
   * Get count of online users
   */
  getOnlineUsersCount(): number {
    return this.userSockets.size;
  }
}
