import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { COMPARISON_OPERATORS, ComparisonOperator } from '@app/shared';

export class UpdateRuleDto {
  @ApiPropertyOptional({ example: 'temperature' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  eventName?: string;

  @ApiPropertyOptional({ enum: COMPARISON_OPERATORS, example: '>=' })
  @IsOptional()
  @IsIn(COMPARISON_OPERATORS)
  operator?: ComparisonOperator;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  threshold?: number;
}
