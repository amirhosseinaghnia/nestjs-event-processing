import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ComparisonOperator } from '@app/shared';
import { AgentRank } from '../../infrastructure/redis/ranking-cache.service';
import { RuleMatchDocument, RuleMatchEntity } from './rule-match.schema';

export interface CreateMatchInput {
  eventId: string;
  agentId: string;
  ruleId: string;
  eventName: string;
  eventValue: number;
  occurredAt: Date;
  ruleSnapshot: {
    eventName: string;
    operator: ComparisonOperator;
    threshold: number;
  };
}

@Injectable()
export class RuleMatchesService {
  constructor(
    @InjectModel(RuleMatchEntity.name)
    private readonly matchModel: Model<RuleMatchDocument>,
  ) {}

  /**
   * Inserts a match if not already present.
   * @returns true when a new match document was created
   */
  async tryCreate(input: CreateMatchInput): Promise<boolean> {
    try {
      await this.matchModel.create({
        eventId: input.eventId,
        agentId: input.agentId,
        ruleId: new Types.ObjectId(input.ruleId),
        eventName: input.eventName,
        eventValue: input.eventValue,
        occurredAt: input.occurredAt,
        matchedAt: new Date(),
        ruleSnapshot: input.ruleSnapshot,
      });
      return true;
    } catch (error) {
      const err = error as { code?: number };
      if (err.code === 11000) {
        return false;
      }
      throw error;
    }
  }

  async findOccurrences(
    ruleId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ agentId: string; occurredAt: Date }>> {
    return this.matchModel
      .find(
        {
          ruleId: new Types.ObjectId(ruleId),
          occurredAt: { $gte: from, $lte: to },
        },
        { agentId: 1, occurredAt: 1, _id: 0 },
      )
      .sort({ agentId: 1, occurredAt: 1 })
      .lean()
      .exec();
  }

  async aggregateAgentCounts(ruleId: string): Promise<AgentRank[]> {
    const rows = await this.matchModel
      .aggregate<{ _id: string; count: number }>([
        { $match: { ruleId: new Types.ObjectId(ruleId) } },
        { $group: { _id: '$agentId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .exec();

    return rows.map((row) => ({
      agentId: row._id,
      count: row.count,
    }));
  }

  async hasAnyMatches(ruleId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(ruleId)) {
      return false;
    }
    const found = await this.matchModel
      .exists({ ruleId: new Types.ObjectId(ruleId) })
      .exec();
    return found !== null;
  }
}
