import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { parseAndValidateDateRange } from '@app/shared';
import { RankingCacheService } from '../../infrastructure/redis/ranking-cache.service';
import { RuleMatchesService } from '../rule-matches/rule-matches.service';
import { RulesService } from '../rules/rules.service';

export interface AgentOccurrences {
  agentId: string;
  timestamps: string[];
}

@Injectable()
export class ReportingService {
  constructor(
    private readonly ruleMatchesService: RuleMatchesService,
    private readonly rulesService: RulesService,
    private readonly rankingCache: RankingCacheService,
  ) {}

  async getOccurrencesByAgent(
    ruleId: string,
    fromRaw: string,
    toRaw: string,
  ): Promise<AgentOccurrences[]> {
    await this.assertRuleKnown(ruleId);
    const { from, to } = parseAndValidateDateRange(fromRaw, toRaw);

    const rows = await this.ruleMatchesService.findOccurrences(
      ruleId,
      from,
      to,
    );

    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      const list = grouped.get(row.agentId) ?? [];
      list.push(row.occurredAt.toISOString());
      grouped.set(row.agentId, list);
    }

    return Array.from(grouped.entries()).map(([agentId, timestamps]) => ({
      agentId,
      timestamps,
    }));
  }

  async getAgentRankings(
    ruleId: string,
  ): Promise<Array<{ agentId: string; count: number }>> {
    await this.assertRuleKnown(ruleId);

    const cached = await this.rankingCache.getRankings(ruleId);
    if (cached !== null) {
      return cached;
    }

    const fromMongo =
      await this.ruleMatchesService.aggregateAgentCounts(ruleId);
    if (fromMongo.length > 0) {
      await this.rankingCache.rebuild(ruleId, fromMongo);
    }
    return fromMongo;
  }

  private async assertRuleKnown(ruleId: string): Promise<void> {
    if (!Types.ObjectId.isValid(ruleId)) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    const exists = await this.rulesService.exists(ruleId);
    if (exists) {
      return;
    }

    const hasMatches = await this.ruleMatchesService.hasAnyMatches(ruleId);
    if (!hasMatches) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }
  }
}
