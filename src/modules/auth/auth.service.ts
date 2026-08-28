import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';

import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Repository } from 'typeorm';
import { generateUniqueId } from 'src/common/utils/uniqueId.util';
import { authMessage } from 'src/common/enums/messages.enum';

interface SsoUserInfo {
  id: number;
  phone_number?: string | null;
  username?: string;
}

interface SsoTokenResponse {
  access_token?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  getFrontendCallbackUrl() {
    return this.configService.getOrThrow<string>('sso.frontendCallbackUrl');
  }

  getAuthorizationUrl(next = '/') {
    const baseUrl = this.configService.getOrThrow<string>('sso.baseUrl');
    const clientId = this.configService.get<string>('sso.clientId');
    const redirectUri =
      this.configService.getOrThrow<string>('sso.redirectUri');

    if (!clientId) {
      throw new InternalServerErrorException('SSO client is not configured');
    }

    const safeNext =
      next.startsWith('/') && !next.startsWith('//') ? next : '/';
    const state = this.jwtService.sign(
      { nonce: randomUUID(), next: safeNext },
      { expiresIn: '10m' },
    );
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: this.configService.get<string>('sso.scope') || 'read',
      state,
    });

    return `${baseUrl}/oauth/authorize/?${params.toString()}`;
  }

  async loginWithCode(code: string, state?: string) {
    if (!code) {
      throw new BadRequestException('کد احراز هویت SSO دریافت نشد');
    }

    let next = '/';
    if (state) {
      try {
        const statePayload = this.jwtService.verify<{ next?: string }>(state);
        next = statePayload.next || '/';
      } catch {
        throw new UnauthorizedException(
          'state احراز هویت SSO نامعتبر یا منقضی است',
        );
      }
    }

    const tokenData = await this.exchangeCode(code);
    const ssoUser = await this.fetchUserInfo(tokenData.access_token);
    const user = await this.syncUser(ssoUser);
    const accessToken = this.jwtService.sign({
      sub: user.id,
      ssoId: user.ssoId,
    });

    return {
      message: authMessage.LOGIN_SUCCESS,
      accessToken,
      user: {
        id: user.id,
        ssoId: user.ssoId,
        phone: user.phone,
        isAdmin: user.isAdmin,
      },
      next,
    };
  }

  private async exchangeCode(
    code: string,
  ): Promise<Required<SsoTokenResponse>> {
    const baseUrl = this.configService.getOrThrow<string>('sso.baseUrl');
    const clientId = this.configService.get<string>('sso.clientId');
    const clientSecret = this.configService.get<string>('sso.clientSecret');
    const redirectUri =
      this.configService.getOrThrow<string>('sso.redirectUri');

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException('SSO client is not configured');
    }

    try {
      const response = await axios.post<SsoTokenResponse>(
        `${baseUrl}/oauth/token/`,
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        },
        { timeout: 10000 },
      );

      if (!response.data.access_token) {
        throw new UnauthorizedException('SSO access token دریافت نشد');
      }
      return response.data as Required<SsoTokenResponse>;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.throwSsoError(error, 'تبادل کد احراز هویت SSO ناموفق بود');
    }
  }

  private async fetchUserInfo(accessToken: string): Promise<SsoUserInfo> {
    const baseUrl = this.configService.getOrThrow<string>('sso.baseUrl');

    try {
      const response = await axios.get<SsoUserInfo>(
        `${baseUrl}/oauth/userinfo/`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10000,
        },
      );
      if (!Number.isInteger(response.data.id)) {
        throw new UnauthorizedException('اطلاعات کاربر SSO نامعتبر است');
      }
      return response.data;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.throwSsoError(error, 'دریافت اطلاعات کاربر از SSO ناموفق بود');
    }
  }

  private async syncUser(ssoUser: SsoUserInfo) {
    let user = await this.userRepository.findOneBy({ ssoId: ssoUser.id });

    if (!user && ssoUser.phone_number) {
      user = await this.userRepository.findOneBy({
        phone: ssoUser.phone_number,
      });
    }

    if (!user) {
      const uniqueId = await generateUniqueId(this.userRepository);

      const usersCount = await this.userRepository.count();

      user = this.userRepository.create({
        id: uniqueId,
        ssoId: ssoUser.id,
        phone: ssoUser.phone_number || null,
        isAdmin: usersCount === 0,
      });
    } else {
      if (user.ssoId !== null && user.ssoId !== ssoUser.id) {
        throw new UnauthorizedException(
          'حساب محلی با کاربر SSO دیگری مرتبط است',
        );
      }
      user.ssoId = ssoUser.id;
      user.phone = ssoUser.phone_number || user.phone;
    }

    return this.userRepository.save(user);
  }

  private throwSsoError(error: unknown, message: string): never {
    const status =
      error instanceof AxiosError ? error.response?.status : undefined;
    if (status === 400 || status === 401) {
      throw new UnauthorizedException(message);
    }
    throw new InternalServerErrorException(message);
  }
}
