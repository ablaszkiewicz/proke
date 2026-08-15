import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { NotificationType } from '../../notifications/core/entities/notification-type.enum';
import { RepositoryScope } from '../../subscriptions/core/entities/subscription.interface';

export class RepositoryPreferenceBody {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  repositoryId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  repositoryFullName?: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ enum: NotificationType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationType, { each: true })
  notificationTypes?: NotificationType[];
}

/**
 * A full replacement, not a patch: the whole point of the nested repository list is that it is
 * edited as a set, and merging two half-updates is where lost-update bugs live.
 */
export class UpdateNotificationPreferencesBody {
  @ApiProperty({ enum: RepositoryScope })
  @IsEnum(RepositoryScope)
  repositoryScope: RepositoryScope;

  @ApiProperty({ enum: NotificationType, isArray: true })
  @IsArray()
  @IsEnum(NotificationType, { each: true })
  notificationTypes: NotificationType[];

  // Bounded because this list lives inside the subscription document. A thousand overrides is
  // already far more than any real account needs.
  @ApiPropertyOptional({ type: [RepositoryPreferenceBody] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => RepositoryPreferenceBody)
  repositories?: RepositoryPreferenceBody[];
}
