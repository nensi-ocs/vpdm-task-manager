import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import type { RequestUser } from "./jwt.strategy";
import { CurrentUser } from "./current-user.decorator";

const COOKIE_NAME = "access_token";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { user, token } = await this.auth.register(dto);
    setAuthCookie(res, token);
    return { user };
  }

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { user, token } = await this.auth.login(dto);
    setAuthCookie(res, token);
    return { user };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookie(res);
    return { ok: true };
  }

  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  async me(@CurrentUser() user: RequestUser) {
    const fresh = await this.auth.findUserById(user.userId);
    if (!fresh) {
      throw new UnauthorizedException();
    }
    return { user: fresh };
  }

  @Patch("profile")
  @UseGuards(AuthGuard("jwt"))
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto
  ) {
    const updated = await this.auth.updateProfile(user.userId, dto);
    return { user: updated };
  }

  @Post("change-password")
  @UseGuards(AuthGuard("jwt"))
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto
  ) {
    await this.auth.changePassword(user.userId, dto);
    return { ok: true };
  }
}
