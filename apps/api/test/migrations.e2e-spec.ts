import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import { mongo } from 'mongoose';
import {
  runMigrations,
  type Migration,
} from '../scripts/migrations/runner.mjs';

const execFileAsync = promisify(execFile);
const baseDatabaseUrl =
  process.env.API_TEST_DATABASE_URL ??
  'mongodb://127.0.0.1:27017/archive_test?replicaSet=rs0&directConnection=true';

interface UserRecord {
  _id: string;
  email: string;
  role?: string;
  status?: string;
  schemaVersion?: number;
  syntheticSeed?: { source: string; profile: string; target: string };
}

interface SessionRecord {
  _id: string;
  accountId: string;
  authVersion: number;
  expiresAt: Date;
  schemaVersion?: number;
}

interface ProbeRecord {
  _id: string;
  state: string;
}

interface MediaMigrationRecord {
  _id: string;
  accountId: string;
  status: string;
  fileKey: string;
  schemaVersion?: number;
  processingStatus?: string;
  accessStatus?: string;
  accessVersion?: number;
  correlationId?: string;
}

function databaseUrl(purpose: string): string {
  const url = new URL(baseDatabaseUrl);
  const suffix = randomUUID().replaceAll('-', '');
  url.pathname = `/archive_${purpose}_${suffix}`;
  return url.toString();
}

async function dropDatabase(url: string): Promise<void> {
  const client = new mongo.MongoClient(url);
  await client.connect();
  try {
    await client.db().dropDatabase();
  } finally {
    await client.close();
  }
}

void describe('versioned MongoDB migrations', { timeout: 30_000 }, () => {
  void it(
    'should migrate an empty database and tolerate repetition',
    { timeout: 30_000 },
    async () => {
      const url = databaseUrl('mig_empty');
      try {
        const first = await runMigrations({
          databaseUrl: url,
          logger: () => {},
        });
        const second = await runMigrations({
          databaseUrl: url,
          logger: () => {},
        });
        assert.deepEqual(first.applied, [
          '001-auth-foundation',
          '002-media-uploads',
          '003-media-processing',
          '004-media-correlation',
          '005-publishing-foundation',
        ]);
        assert.deepEqual(second.skipped, [
          '001-auth-foundation',
          '002-media-uploads',
          '003-media-processing',
          '004-media-correlation',
          '005-publishing-foundation',
        ]);

        const client = new mongo.MongoClient(url);
        await client.connect();
        try {
          const database = client.db();
          assert.equal(
            await database.collection('_schemaMigrations').countDocuments(),
            5,
          );
          const indexes = await database.collection('sessions').indexes();
          const ttl = indexes.find((index) => index.name === 'expiresAt_1');
          assert.equal(ttl?.expireAfterSeconds, 0);
          assert(indexes.some((index) => index.name === 'accountId_1'));
          assert(
            indexes.some(
              (index) => index.name === 'accountId_1_authVersion_1_expiresAt_1',
            ),
          );
        } finally {
          await client.close();
        }
      } finally {
        await dropDatabase(url);
      }
    },
  );

  void it(
    'should migrate populated collections and preserve unique and filtered lookups',
    { timeout: 30_000 },
    async () => {
      const url = databaseUrl('mig_populated');
      const client = new mongo.MongoClient(url);
      await client.connect();
      try {
        const database = client.db();
        const users = database.collection<UserRecord>('users');
        const sessions = database.collection<SessionRecord>('sessions');
        const uploads =
          database.collection<MediaMigrationRecord>('mediaUploads');
        const expiresAt = new Date(Date.now() + 60_000);
        await users.insertMany([
          {
            _id: 'legacy-editor',
            email: 'legacy-editor@example.test',
            role: 'Editor',
            status: 'Active',
          },
          {
            _id: 'legacy-user',
            email: 'legacy-user@example.test',
            role: 'User',
            status: 'Disabled',
          },
        ]);
        await sessions.insertOne({
          _id: 'legacy-session',
          accountId: 'legacy-editor',
          authVersion: 3,
          expiresAt,
        });
        await uploads.insertOne({
          _id: 'legacy-completed-upload',
          accountId: 'legacy-editor',
          status: 'Completed',
          fileKey: 'a'.repeat(64),
        });
        await users.createIndex({ email: 1 }, { unique: true });
        await sessions.createIndex({ accountId: 1 });
        await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

        await runMigrations({ databaseUrl: url, logger: () => {} });

        assert.equal(await users.countDocuments({ schemaVersion: 1 }), 2);
        assert.equal(await sessions.countDocuments({ schemaVersion: 1 }), 1);
        assert.deepEqual(
          await uploads.findOne(
            { _id: 'legacy-completed-upload' },
            {
              projection: {
                _id: 0,
                schemaVersion: 1,
                processingStatus: 1,
                accessStatus: 1,
                accessVersion: 1,
                correlationId: 1,
              },
            },
          ),
          {
            schemaVersion: 3,
            processingStatus: 'Pending',
            accessStatus: 'Active',
            accessVersion: 1,
            correlationId: 'migration:legacy-completed-upload',
          },
        );
        await assert.rejects(
          users.insertOne({
            _id: 'duplicate-email',
            email: 'legacy-editor@example.test',
          }),
          (error: unknown) =>
            error instanceof mongo.MongoServerError && error.code === 11000,
        );
        const uploadIndexes = await database
          .collection('mediaUploads')
          .indexes();
        assert(uploadIndexes.some((index) => index.name === 'fileKey_1'));
        assert(
          uploadIndexes.some(
            (index) => index.name === 'accountId_1_status_1_expiresAt_1',
          ),
        );
        assert(
          uploadIndexes.some((index) => index.name === 'correlationId_1__id_1'),
        );
        assert(
          uploadIndexes.some(
            (index) =>
              index.name ===
              'status_1_processingStatus_1_inspectionLeaseExpiresAt_1_completedAt_1',
          ),
        );

        const materialIndexes = await database
          .collection('materials')
          .indexes();
        assert(
          materialIndexes.some(
            (index) => index.name === 'slug_1' && index.unique === true,
          ),
        );
        const revisionIndexes = await database
          .collection('materialRevisions')
          .indexes();
        assert(
          revisionIndexes.some(
            (index) =>
              index.name === 'materialId_1_revisionNumber_1' &&
              index.unique === true,
          ),
        );
        const outboxIndexes = await database
          .collection('outboxEvents')
          .indexes();
        assert(
          outboxIndexes.some(
            (index) =>
              index.name === 'aggregateId_1_aggregateVersion_1' &&
              index.unique === true,
          ),
        );

        const editors = await users
          .find({ role: 'Editor', status: 'Active' })
          .hint('role_1_status_1__id_1')
          .toArray();
        assert.deepEqual(
          editors.map((item) => item._id),
          ['legacy-editor'],
        );
        const activeSessions = await sessions
          .find({
            accountId: 'legacy-editor',
            authVersion: 3,
            expiresAt: { $gt: new Date() },
          })
          .hint('accountId_1_authVersion_1_expiresAt_1')
          .toArray();
        assert.deepEqual(
          activeSessions.map((item) => item._id),
          ['legacy-session'],
        );
      } finally {
        await client.db().dropDatabase();
        await client.close();
      }
    },
  );

  void it(
    'should roll back a failed migration transaction on the replica set',
    { timeout: 30_000 },
    async () => {
      const url = databaseUrl('mig_tx');
      const client = new mongo.MongoClient(url);
      await client.connect();
      try {
        const database = client.db();
        await database
          .collection<ProbeRecord>('transactionProbe')
          .insertOne({ _id: 'existing', state: 'before' });
        const failingMigration: Migration = {
          id: '900-transaction-rollback-probe',
          version: 900,
          description: 'Prove that migration writes roll back together.',
          signature: 'transaction-rollback-probe-v1',
          async up({ database: migrationDatabase, session }) {
            const probes =
              migrationDatabase.collection<ProbeRecord>('transactionProbe');
            await probes.updateOne(
              { _id: 'existing' },
              { $set: { state: 'during' } },
              { session },
            );
            await probes.insertOne(
              { _id: 'new', state: 'during' },
              { session },
            );
            throw new Error('deliberate transaction rollback');
          },
        };

        await assert.rejects(
          runMigrations({
            databaseUrl: url,
            migrations: [failingMigration],
            logger: () => {},
          }),
          /deliberate transaction rollback/,
        );
        assert.deepEqual(
          await database
            .collection<ProbeRecord>('transactionProbe')
            .findOne({ _id: 'existing' }),
          { _id: 'existing', state: 'before' },
        );
        assert.equal(
          await database
            .collection<ProbeRecord>('transactionProbe')
            .findOne({ _id: 'new' }),
          null,
        );
        assert.equal(
          await database
            .collection<{ _id: string }>('_schemaMigrations')
            .findOne({ _id: failingMigration.id }),
          null,
        );
      } finally {
        await client.db().dropDatabase();
        await client.close();
      }
    },
  );

  void it(
    'should guard and repeat the managed staging seed',
    { timeout: 60_000 },
    async () => {
      const url = databaseUrl('staging_seed');
      const password = `Staging-${randomUUID()}-password`;
      const command = ['scripts/seed.mjs', '--staging'];
      const environment = {
        ...process.env,
        NODE_ENV: 'staging',
        DATABASE_URL: url,
        SEED_PROFILE: 'minimal',
        SEED_PASSWORD: password,
      };
      try {
        await assert.rejects(
          execFileAsync(process.execPath, command, {
            env: environment,
            timeout: 15_000,
          }),
          (error: unknown) => {
            assert.match(String(error), /ALLOW_SYNTHETIC_STAGING/);
            return true;
          },
        );
        const confirmedEnvironment = {
          ...environment,
          ALLOW_SYNTHETIC_STAGING: 'LOAD_EXAMPLE_TEST_DATA',
        };
        await execFileAsync(process.execPath, command, {
          env: confirmedEnvironment,
          timeout: 30_000,
        });
        await execFileAsync(process.execPath, command, {
          env: confirmedEnvironment,
          timeout: 30_000,
        });

        const client = new mongo.MongoClient(url);
        await client.connect();
        try {
          const users = client.db().collection<UserRecord>('users');
          assert.equal(
            await users.countDocuments({
              'syntheticSeed.source': 'managed-v1',
              'syntheticSeed.target': 'staging',
            }),
            3,
          );
          assert.equal(await users.countDocuments(), 3);
        } finally {
          await client.close();
        }
      } finally {
        await dropDatabase(url);
      }
    },
  );
});
