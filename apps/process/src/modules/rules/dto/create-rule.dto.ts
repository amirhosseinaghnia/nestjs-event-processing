import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { COMPARISON_OPERATORS, ComparisonOperator } from '@app/shared';

export class CreateRuleDto {
  @ApiProperty({ example: 'temperature' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  eventName!: string;

  @ApiProperty({ enum: COMPARISON_OPERATORS, example: '>' })
  @IsIn(COMPARISON_OPERATORS)
  operator!: ComparisonOperator;

  @ApiProperty({ example: 80 })
  @IsNumber()
  threshold!: number;
}
