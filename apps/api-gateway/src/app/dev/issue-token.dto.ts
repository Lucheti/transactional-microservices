import { IsArray, IsEmail, IsOptional, IsString } from 'class-validator';

export class IssueTokenRequest {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}
