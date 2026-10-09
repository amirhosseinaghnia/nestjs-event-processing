import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RankingCacheService } from '../../infrastructure/redis/ranking-cache.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RuleDocument, RuleEntity } from './rule.schema';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

@Injectable()
export class RulesService {
  private cache: RuleDocument[] | null = null;
  private cacheExpiresAt = 0;
  private readonly cacheTtlMs = 5_000;

  constructor(
    @InjectModel(RuleEntity.name)
    private readonly ruleModel: Model<RuleDocument>,
    private readonly rankingCache: RankingCacheService,
  ) {}

  invalidateCache(): void {
    this.cache = null;
    this.cacheExpiresAt = 0;
  }

  async create(dto: CreateRuleDto): Promise<RuleDocument> {
    try {
      const rule = await this.ruleModel.create(dto);
      this.invalidateCache();
      return rule;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'An active rule with the same eventName, operator, and threshold already exists',
        );
      }
      throw error;
    }
  }

  async findAll(
    page: number,
    limit: number,
  ): Promise<{
    data: RuleDocument[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.ruleModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.ruleModel.countDocuments().exec(),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async findById(id: string): Promise<RuleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Rule ${id} not found`);
    }
    const rule = await this.ruleModel.findById(id).exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${id} not found`);
    }
    return rule;
  }

  async update(id: string, dto: UpdateRuleDto): Promise<RuleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Rule ${id} not found`);
    }
    try {
      const rule = await this.ruleModel
        .findByIdAndUpdate(id, { $set: dto }, { new: true })
        .exec();
      if (!rule) {
        throw new NotFoundException(`Rule ${id} not found`);
      }
      this.invalidateCache();
      return rule;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'An active rule with the same eventName, operator, and threshold already exists',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Rule ${id} not found`);
    }
    const result = await this.ruleModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Rule ${id} not found`);
    }
    this.invalidateCache();
    await this.rankingCache.deleteRuleRankings(id);
  }

  async getActiveRules(): Promise<RuleDocument[]> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiresAt) {
      return this.cache;
    }
    this.cache = await this.ruleModel.find().exec();
    this.cacheExpiresAt = now + this.cacheTtlMs;
    return this.cache;
  }

  async exists(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }
    const count = await this.ruleModel.countDocuments({ _id: id }).exec();
    return count > 0;
  }
}
