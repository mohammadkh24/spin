import { Controller, Get, Post, Query, Req, Res, Body } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('login')
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: 'Redirect to SSO login',
  })
  login(
    @Req() request: Request,
    @Res() response: Response,
    @Query('next') next?: string,
  ) {
    const url = this.authService.getAuthorizationUrl(next || '/');
    if (request.headers.accept?.includes('application/json')) {
      return response.json({ authorize_url: url });
    }
    return response.redirect(302, url);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Get SSO authorization URL',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        next: {
          type: 'string',
          example: '/',
          description: 'مسیر بعد از ورود موفق',
        },
      },
    },
  })
  loginApi(@Body('next') next?: string) {
    return {
      authorize_url: this.authService.getAuthorizationUrl(next || '/'),
    };
  }

  @Get('callback')
  @ApiOperation({ summary: 'Handle SSO callback' })
  async callback(
    @Req() request: Request,
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    if (error) {
      if (request?.headers.accept?.includes('application/json')) {
        return response.json({ error });
      }
      const callbackUrl = new URL(this.authService.getFrontendCallbackUrl());
      callbackUrl.searchParams.set('error', error);
      return response.redirect(302, callbackUrl.toString());
    }

    const result = await this.authService.loginWithCode(code || '', state);
    if (request?.headers.accept?.includes('application/json')) {
      return response.json(result);
    }

    const callbackUrl = new URL(this.authService.getFrontendCallbackUrl());
    callbackUrl.searchParams.set('access_token', result.accessToken);
    callbackUrl.searchParams.set('next', result.next);
    return response.redirect(302, callbackUrl.toString());
  }

  @Post('callback')
  @ApiOperation({ summary: 'Exchange SSO authorization code for app token' })
  async callbackApi(
    @Body('code') code?: string,
    @Body('state') state?: string,
  ) {
    return this.authService.loginWithCode(code || '', state);
  }
}
