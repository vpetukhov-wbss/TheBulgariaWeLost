import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Post,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { AdministratorGuard } from '../back-office/administrator.guard';
import { BackOfficeGuard } from '../back-office/back-office.guard';
import {
  Material,
  MaterialRevision,
  MaterialRevisionSchema,
  MaterialSchema,
} from '../publishing/persistence/material.schema';
import {
  PublishingOutboxEvent,
  PublishingOutboxEventSchema,
} from '../publishing/persistence/publishing-event.schema';
import { PublishingModule } from '../publishing/publishing.module';
import {
  ArchiveSearchPage,
  ArchiveSearchQuery,
  RebuildSearchPage,
  RebuildSearchResult,
  SearchMetrics,
} from './discovery.dto';
import { DiscoveryService } from './discovery.service';
import { SearchIndex } from './search-index';

@ApiTags('Archive search')
@Controller({ path: 'archive/search', version: '1' })
@UseGuards(ThrottlerGuard)
class ArchiveSearchController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get()
  @ApiOkResponse({ type: ArchiveSearchPage })
  search(@Query() query: ArchiveSearchQuery): Promise<ArchiveSearchPage> {
    return this.discovery.search(query);
  }
}

@ApiTags('Admin search')
@ApiBearerAuth()
@Controller({ path: 'admin/v1/search', version: VERSION_NEUTRAL })
@UseGuards(
  AuthGuard('jwt'),
  BackOfficeGuard,
  AdministratorGuard,
  ThrottlerGuard,
)
class AdminSearchController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('metrics')
  @ApiOkResponse({ type: SearchMetrics })
  metrics(): Promise<SearchMetrics> {
    return this.discovery.metrics();
  }

  @Post('rebuild')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: RebuildSearchResult })
  rebuild(@Body() body: RebuildSearchPage): Promise<RebuildSearchResult> {
    return this.discovery.rebuild(body?.after);
  }
}

@Module({
  imports: [
    AuthModule,
    PublishingModule,
    MongooseModule.forFeature([
      { name: Material.name, schema: MaterialSchema },
      { name: MaterialRevision.name, schema: MaterialRevisionSchema },
      { name: PublishingOutboxEvent.name, schema: PublishingOutboxEventSchema },
    ]),
  ],
  controllers: [ArchiveSearchController, AdminSearchController],
  providers: [
    DiscoveryService,
    SearchIndex,
    AdministratorGuard,
    BackOfficeGuard,
  ],
})
export class DiscoveryModule {}
