import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { assertSameOrigin, cookieToken } from './admin.guard';
import { LoginDto } from './dto';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Req() request: any, @Body() body: LoginDto, @Res({ passthrough: true }) response: any) {
    assertSameOrigin(request);
    const result = await this.auth.login(body.email, body.password);
    response.setHeader('Set-Cookie', `${AuthService.cookieName}=${encodeURIComponent(result.token)}; ${AuthService.cookieOptions()}`);
    return { authenticated: true, user: result.user, expiresAt: result.expiresAt };
  }

  @Get('session')
  async session(@Req() request: any) {
    const user = await this.auth.authenticate(cookieToken(request));
    return { authenticated: true, user };
  }

  @Post('logout')
  async logout(@Req() request: any, @Res({ passthrough: true }) response: any) {
    assertSameOrigin(request);
    await this.auth.logout(cookieToken(request));
    response.setHeader('Set-Cookie', `${AuthService.cookieName}=; ${AuthService.clearCookieOptions()}`);
    return { authenticated: false };
  }
}
