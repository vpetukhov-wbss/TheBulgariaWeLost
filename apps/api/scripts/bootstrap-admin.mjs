import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { mongo } from 'mongoose';
import { uuidv7 } from 'uuidv7';
import { runMigrations } from './migrations/runner.mjs';

function configuration() {
  if (process.env.ADMIN_BOOTSTRAP_CONFIRM !== 'CREATE_FIRST_ADMIN') {
    throw new Error(
      'Set ADMIN_BOOTSTRAP_CONFIRM=CREATE_FIRST_ADMIN for this one-time command.',
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.startsWith('mongodb://')) {
    throw new Error('DATABASE_URL must use mongodb:// and a replica set.');
  }
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL must be a valid email address.');
  }
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error(
      'ADMIN_BOOTSTRAP_PASSWORD must contain between 12 and 128 characters.',
    );
  }
  return { databaseUrl, email, password };
}

async function run() {
  const { databaseUrl, email, password } = configuration();
  await runMigrations({ databaseUrl });
  const client = new mongo.MongoClient(databaseUrl, {
    serverSelectionTimeoutMS: 5_000,
  });
  await client.connect();
  try {
    const hello = await client.db().admin().command({ hello: 1 });
    if (!hello.setName)
      throw new Error('Admin bootstrap requires a replica set.');
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const database = client.db();
        const users = database.collection('users');
        if (
          await users.countDocuments({ role: 'Administrator' }, { session })
        ) {
          throw new Error(
            'An administrator already exists; bootstrap is closed.',
          );
        }
        await database
          .collection('bootstrapLocks')
          .insertOne(
            { _id: 'first-administrator', createdAt: new Date() },
            { session },
          );
        const now = new Date();
        const existing = await users.findOne({ email }, { session });
        if (existing) {
          await users.updateOne(
            { _id: existing._id },
            {
              $set: {
                role: 'Administrator',
                status: 'Active',
                schemaVersion: 1,
                passwordHash: await bcrypt.hash(password, 12),
                mfaEnabled: false,
                updatedAt: now,
              },
              $inc: { authVersion: 1 },
              $unset: {
                mfaSecretEncrypted: 1,
                mfaPendingSecretEncrypted: 1,
                mfaRecoveryCodeHashes: 1,
                mfaLastUsedStep: 1,
              },
            },
            { session },
          );
          await database
            .collection('sessions')
            .deleteMany({ accountId: existing._id }, { session });
        } else {
          await users.insertOne(
            {
              _id: uuidv7(),
              email,
              firstName: 'First',
              lastName: 'Administrator',
              passwordHash: await bcrypt.hash(password, 12),
              role: 'Administrator',
              status: 'Active',
              schemaVersion: 1,
              authVersion: 0,
              mfaEnabled: false,
              createdAt: now,
              updatedAt: now,
            },
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }
    process.stdout.write(
      `Created the first administrator for ${email}. Enroll MFA before using the back office.\n`,
    );
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Admin bootstrap failed.'}\n`,
  );
  process.exitCode = 1;
});
