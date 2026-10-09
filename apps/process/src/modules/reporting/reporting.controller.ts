import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OccurrencesQueryDto } from './dto/occurrences-query.dto';
import { ReportingService } from './reporting.service';

@ApiTags('reports')
@Controller('reports/rules')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get(':ruleId/occurrences')
  @ApiOperation({
    summary:
      'Report #1 — match timestamps for a rule within a time range (max 1 day), grouped by agent',
  })
  getOccurrences(
    @Param('ruleId') ruleId: string,
    @Query() query: OccurrencesQueryDto,
  ) {
    return this.reportingService.getOccurrencesByAgent(
      ruleId,
      query.from,
      query.to,
    );
  }

  @Get(':ruleId/agent-rankings')
  @ApiOperation({
    summary:
      'Report #2 — agents ranked by total historical match count for a rule',
  })
  getAgentRankings(@Param('ruleId') ruleId: string) {
    return this.reportingService.getAgentRankings(ruleId);
  }
}
