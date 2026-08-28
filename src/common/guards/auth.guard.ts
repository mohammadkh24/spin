import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';

interface AccessTokenPayload {
  sub: number;
  ssoId?: number;
  iat?: number;
  exp?: number;
}

export type AuthenticatedRequest = Request & { user?: AccessTokenPayload };

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(configService: ConfigService) {
    this.jwtSecret = configService.getOrThrow<string>('jwt.accessTokenSecret');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('توکن خالی یا نامعتبر است');
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        typeof decoded.sub !== 'number' ||
        typeof decoded.ssoId !== 'number'
      ) {
        throw new UnauthorizedException('توکن ناقص است');
      }
      request.user = {
        sub: decoded.sub,
        ssoId: decoded.ssoId,
        iat: decoded.iat,
        exp: decoded.exp,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('توکن نامعتبر یا منقضی شده');
    }
  }

  private extractToken(request: Request): string | null {
    const parts = request.headers.authorization?.split(' ') || [];
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return null;
    }
    return parts[1];
  }
}
