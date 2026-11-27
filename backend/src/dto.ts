import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength, Matches } from 'class-validator';

export class CollaboratorDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(12) @MaxLength(200) password!: string;
  @IsOptional() @IsIn(['COLLABORATOR', 'ORGANIZER']) role?: string;
}

export class HallDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(180) venue!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(30) seatRows!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(40) seatColumns!: number;
  @IsOptional() @IsArray() seatLayout?: unknown[];
  @IsOptional() @IsString() @MaxLength(7_000_000) photoDataUrl?: string;
}

export class ConfigureHallDto {
  @IsString() @MinLength(1) @MaxLength(120) hallName!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(30) seatRows!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(40) seatColumns!: number;
}

export class EventDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(120) slug?: string;
  @IsString() @MinLength(1) @MaxLength(5000) description!: string;
  @IsString() @MinLength(1) @MaxLength(240) venue!: string;
  @IsOptional() @IsString() @MaxLength(120) hallName?: string;
  @IsOptional() @IsString() hallId?: string | null;
  @IsOptional() @IsString() @MaxLength(2048) @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) whatsappGroupUrl?: string | null;
  @IsOptional() @IsString() @IsDateString() startsAt?: string;
  @IsOptional() @IsString() @IsDateString() endsAt?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) seatRows?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(40) seatColumns?: number;
  @IsOptional() @IsArray() formFields?: unknown[];
  @IsOptional() @IsArray() seatLayout?: unknown[];
}

export class RegistrationDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @IsString() @MinLength(1) @MaxLength(40) phone!: string;
  @IsString() @MinLength(1) @MaxLength(160) occupation!: string;
  @IsOptional() @IsString() @MaxLength(180) institution?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120) age?: number;
  @IsOptional() @IsString() @MaxLength(120) seatId?: string;
  @IsOptional() @IsString() @MaxLength(1000) referralSource?: string;
  @IsOptional() @IsString() @MaxLength(4000) expectations?: string;
  @IsOptional() @IsString() @MaxLength(4000) interests?: string;
  @IsOptional() @IsString() @MaxLength(4000) perspective?: string;
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
  @IsOptional() @IsObject() customAnswers?: Record<string, unknown>;
}

export class SatisfactionDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(10) recommendation!: number;
  @IsOptional() @IsString() @MaxLength(4000) highlights?: string;
  @IsOptional() @IsString() @MaxLength(4000) improvements?: string;
}

export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(200) password!: string;
}
