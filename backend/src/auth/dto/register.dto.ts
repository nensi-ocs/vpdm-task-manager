import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(120)
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MaxLength(120)
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(8, { message: "password must be at least 8 characters" })
  @MaxLength(128)
  password!: string;
}
