import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

export interface AgentRank {
  agentId: string;
  count: number;
}

@Injectable()
export class RankingCacheService {
  private readonly logger = new Logger(RankingCacheService.name);

  constructor(private readonly redis: RedisService) {}

  keyForRule(ruleId: string): string {
    return `rule:${ruleId}:agent-counts`;
  }

  async increment(ruleId: string, agentId: string): Promise<void> {
    try {
      await this.redis.getClient().zincrby(this.keyForRule(ruleId), 1, agentId);
    } catch (error) {
      const err = error as Error;
      this.logger.warn(
        `Failed to ZINCRBY ranking for rule=${ruleId} agent=${agentId}: ${err.message}`,
      );
    }
  }

  async getRankings(ruleId: string): Promise<AgentRank[] | null> {
    try {
      const client = this.redis.getClient();
      const exists = await client.exists(this.keyForRule(ruleId));
      if (!exists) {
        return null;
      }

      const rows = await client.zrevrange(
        this.keyForRule(ruleId),
        0,
        -1,
        'WITHSCORES',
      );

      const result: AgentRank[] = [];
      for (let i = 0; i < rows.length; i += 2) {
        result.push({
          agentId: rows[i],
          count: Number(rows[i + 1]),
        });
      }
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.warn(
        `Failed to read rankings for rule=${ruleId}: ${err.message}`,
      );
      return null;
    }
  }

  async rebuild(ruleId: string, rankings: AgentRank[]): Promise<void> {
    const key = this.keyForRule(ruleId);
    const client = this.redis.getClient();

    try {
      const pipeline = client.pipeline();
      pipeline.del(key);
      for (const row of rankings) {
        pipeline.zadd(key, row.count, row.agentId);
      }
      await pipeline.exec();
      this.logger.log(
        `Rebuilt Redis rankings for rule=${ruleId} agents=${rankings.length}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.warn(
        `Failed to rebuild rankings for rule=${ruleId}: ${err.message}`,
      );
    }
  }

  async deleteRuleRankings(ruleId: string): Promise<void> {
    try {
      await this.redis.getClient().del(this.keyForRule(ruleId));
    } catch (error) {
      const err = error as Error;
      this.logger.warn(
        `Failed to delete rankings for rule=${ruleId}: ${err.message}`,
      );
    }
  }
}
