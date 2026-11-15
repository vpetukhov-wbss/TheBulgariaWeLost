import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Connection } from 'mongoose';

@ApiTags('Health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      if (!this.connection.db) throw new Error('MongoDB is not connected.');
      await this.connection.db.admin().ping({ timeoutMS: 1_000 });
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('MongoDB is unavailable.');
    }
  }
}
