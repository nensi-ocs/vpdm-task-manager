import { IsString, MaxLength, MinLength } from "class-validator";

export class UpdateProfileDto {
  @IsString()
  @MaxLength(120)
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MaxLength(120)
  @MinLength(1)
  lastName!: string;
}
