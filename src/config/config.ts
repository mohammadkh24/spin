import { registerAs } from '@nestjs/config';

export enum configKeys {
  App = 'app',
  Db = 'db',
  Jwt = 'jwt',
  Sso = 'sso',
}

export const appConfig = registerAs(configKeys.App, () => ({
  port: Number(process.env.PORT) || 3000,
}));

export const dbConfig = registerAs(configKeys.Db, () => ({
  port: Number(process.env.DB_PORT) || 5432,
  host: process.env.DB_HOST,
  username: process.env.DB_USER,
  password: process.env.DB_PASS as string,
  database: process.env.DB_NAME,
}));

export const JwtConfig = registerAs(configKeys.Jwt, () => ({
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
}));

export const ssoConfig = registerAs(configKeys.Sso, () => ({
  baseUrl: (process.env.SSO_BASE_URL || 'https://account.web-block.ir').replace(
    /\/$/,
    '',
  ),
  clientId: process.env.SSO_CLIENT_ID,
  clientSecret: process.env.SSO_CLIENT_SECRET,
  redirectUri:
    process.env.SSO_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  frontendCallbackUrl:
    process.env.SSO_FRONTEND_CALLBACK_URL ||
    'http://localhost:5173/auth/callback',
  scope: process.env.SSO_SCOPE || 'read',
}));

export const configurations = [appConfig, dbConfig, JwtConfig, ssoConfig];
