import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RankingCacheService } from './ranking-cache.service';

@Global()
@Module({
  providers: [RedisService, RankingCacheService],
  exports: [RedisService, RankingCacheService],
})
export class RedisInfrastructureModule {}
