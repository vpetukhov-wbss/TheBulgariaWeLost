import { createHash, randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { migrations as defaultMigrations } from './index.mjs';

const migrationCollectionName = '_schemaMigrations';
const lockCollectionName = '_migrationLocks';
const lockId = 'global';
const lockLeaseMilliseconds = 15 * 60 * 1_000;

function checksum(migration) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: migration.id,
        version: migration.version,
        description: migration.description,
        signature: migration.signature,
      }),
    )
    .digest('hex');
}

function validateMigrations(migrations) {
  const ids = new Set();
  const versions = new Set();
  let previousVersion = 0;
  for (const migration of migrations) {
    if (!migration.id || !Number.isSafeInteger(migration.version)) {
      throw new Error('Every migration needs an id and an integer version.');
    }
    if (migration.version <= previousVersion) {
      throw new Error('Migrations must be ordered by increasing version.');
    }
    if (ids.has(migration.id) || versions.has(migration.version)) {
      throw new Error('Migration ids and versions must be unique.');
    }
    if (!migration.signature || typeof migration.up !== 'function') {
      throw new Error(`Migration ${migration.id} is incomplete.`);
    }
    ids.add(migration.id);
    versions.add(migration.version);
    previousVersion = migration.version;
  }
}

async function listIndexes(collection) {
  try {
    return await collection.listIndexes().toArray();
  } catch (error) {
    if (error instanceof mongo.MongoServerError && error.code === 26) return [];
    throw error;
  }
}

function sameKey(actual, expected) {
  return (
    JSON.stringify(Object.entries(actual)) ===
    JSON.stringify(Object.entries(expected))
  );
}

function sameOptions(actual, expected) {
  for (const option of [
    'unique',
    'expireAfterSeconds',
    'partialFilterExpression',
  ]) {
    if (!(option in expected)) continue;
    if (JSON.stringify(actual[option]) !== JSON.stringify(expected[option])) {
      return false;
    }
  }
  return true;
}

async function ensureIndex(database, definition) {
  const collection = database.collection(definition.collection);
  const existing = (await listIndexes(collection)).find(
    (index) => index.name === definition.options.name,
  );
  if (existing) {
    if (
      sameKey(existing.key, definition.key) &&
      sameOptions(existing, definition.options)
    ) {
      return;
    }
    throw new Error(
      `Index ${definition.collection}.${definition.options.name} has an incompatible definition. ` +
        'Migrations never drop or replace indexes automatically.',
    );
  }
  await collection.createIndex(definition.key, definition.options);
}

async function ensureInfrastructure(database) {
  await ensureIndex(database, {
    collection: migrationCollectionName,
    key: { version: 1 },
    options: { name: 'version_1', unique: true },
  });
  await ensureIndex(database, {
    collection: lockCollectionName,
    key: { expiresAt: 1 },
    options: { name: 'expiresAt_1', expireAfterSeconds: 0 },
  });
}

async function acquireLock(database, owner, now) {
  const locks = database.collection(lockCollectionName);
  try {
    const lock = await locks.findOneAndUpdate(
      {
        _id: lockId,
        $or: [{ expiresAt: { $lte: now } }, { owner }],
      },
      {
        $set: {
          owner,
          acquiredAt: now,
          expiresAt: new Date(now.getTime() + lockLeaseMilliseconds),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if (!lock || lock.owner !== owner) throw new Error('lock not acquired');
  } catch (error) {
    if (error instanceof mongo.MongoServerError && error.code === 11000) {
      throw new Error(
        'Another migration runner currently owns the database lock.',
      );
    }
    throw error;
  }
}

function validateApplied(migration, applied) {
  const expectedChecksum = checksum(migration);
  if (applied.checksum !== expectedChecksum) {
    throw new Error(
      `Applied migration ${migration.id} has checksum ${applied.checksum}, ` +
        `but the current source has ${expectedChecksum}. Add a new migration instead of editing history.`,
    );
  }
}

async function applyMigration(client, database, migration, owner) {
  for (const definition of migration.indexes ?? []) {
    await ensureIndex(database, definition);
  }

  const records = database.collection(migrationCollectionName);
  const existing = await records.findOne({ _id: migration.id });
  if (existing) {
    validateApplied(migration, existing);
    return false;
  }

  const session = client.startSession();
  try {
    let applied = false;
    await session.withTransaction(
      async () => {
        const concurrent = await records.findOne(
          { _id: migration.id },
          { session },
        );
        if (concurrent) {
          validateApplied(migration, concurrent);
          return;
        }
        await migration.up({ database, session });
        await records.insertOne(
          {
            _id: migration.id,
            version: migration.version,
            description: migration.description,
            checksum: checksum(migration),
            appliedAt: new Date(),
            owner,
          },
          { session },
        );
        applied = true;
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      },
    );
    return applied;
  } finally {
    await session.endSession();
  }
}

export async function runMigrations({
  databaseUrl = process.env.DATABASE_URL,
  migrations = defaultMigrations,
  logger = (message) => process.stdout.write(`${message}\n`),
} = {}) {
  if (!databaseUrl || !/^mongodb(?:\+srv)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a MongoDB connection string.');
  }
  validateMigrations(migrations);

  const client = new mongo.MongoClient(databaseUrl, {
    serverSelectionTimeoutMS: 5_000,
  });
  await client.connect();
  const database = client.db();
  const owner = `${process.pid}-${randomUUID()}`;
  let locked = false;
  const applied = [];
  const skipped = [];
  try {
    if (!database.databaseName || database.databaseName === 'test') {
      throw new Error('DATABASE_URL must include an explicit database name.');
    }
    const hello = await database.admin().command({ hello: 1 });
    if (!hello.setName) {
      throw new Error('MongoDB migrations require a replica set.');
    }
    await ensureInfrastructure(database);
    await acquireLock(database, owner, new Date());
    locked = true;

    for (const migration of migrations) {
      if (await applyMigration(client, database, migration, owner)) {
        applied.push(migration.id);
        logger(`Applied ${migration.id}.`);
      } else {
        skipped.push(migration.id);
        logger(`Already applied ${migration.id}; indexes verified.`);
      }
    }
    return { database: database.databaseName, applied, skipped };
  } finally {
    if (locked) {
      await database
        .collection(lockCollectionName)
        .deleteOne({ _id: lockId, owner });
    }
    await client.close();
  }
}
