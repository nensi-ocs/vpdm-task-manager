import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import type { ChangePasswordDto } from "./dto/change-password.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import type { UpdateProfileDto } from "./dto/update-profile.dto";

const BCRYPT_ROUNDS = 12;

export type SafeUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async register(dto: RegisterDto): Promise<{ user: SafeUser; token: string }> {
    const email = this.normalizeEmail(dto.email);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    try {
      const user = await this.prisma.user.create({
        data: { email, passwordHash, firstName, lastName },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      const token = this.signToken(user.id, user.email);
      return { user, token };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException("Email already registered");
      }
      throw e;
    }
  }

  async login(dto: LoginDto): Promise<{ user: SafeUser; token: string }> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const token = this.signToken(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      token,
    };
  }

  async findUserById(id: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<SafeUser> {
    return this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { passwordHash: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException("Current password is incorrect");
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        "New password must be different from the current password"
      );
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  private signToken(sub: string, email: string): string {
    return this.jwt.sign({ sub, email });
  }
}
