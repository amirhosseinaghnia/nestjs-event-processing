import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class OccurrencesQueryDto {
  @ApiProperty({
    description: 'Range start (ISO-8601). Max range length is 1 day.',
    example: '2026-10-08T00:00:00.000Z',
  })
  @IsISO8601()
  from!: string;

  @ApiProperty({
    description: 'Range end (ISO-8601). Max range length is 1 day.',
    example: '2026-10-08T23:59:59.999Z',
  })
  @IsISO8601()
  to!: string;
}
