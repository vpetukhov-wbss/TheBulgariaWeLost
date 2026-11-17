import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { mongo } from 'mongoose';
import { uuidv7 } from 'uuidv7';

const profiles = {
  minimal: [
    ['admin@example.test', 'Админ', 'Архив', 'Administrator', 'Active'],
    ['editor@example.test', 'Елена', 'Редакторова', 'Editor', 'Active'],
    ['user@example.test', 'Иван', 'Потребител', 'User', 'Active'],
  ],
  demo: [
    ['admin@example.test', 'Админ', 'Архив', 'Administrator', 'Active'],
    ['editor@example.test', 'Елена', 'Редакторова', 'Editor', 'Active'],
    ['user@example.test', 'Иван', 'Потребител', 'User', 'Active'],
    ['pending@example.test', 'Мария', 'Непотвърдена', 'User', 'Pending'],
    ['disabled@example.test', 'Петър', 'Спрян', 'User', 'Disabled'],
  ],
};

function seedConfiguration() {
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.NODE_ENV !== 'test'
  ) {
    throw new Error('Seed is allowed only with NODE_ENV=development or test.');
  }
  if (process.env.ALLOW_LOCAL_SEED !== 'true') {
    throw new Error(
      'Set ALLOW_LOCAL_SEED=true explicitly to load synthetic data.',
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]', 'mongo']);
  if (parsed.protocol !== 'mongodb:' || !localHosts.has(parsed.hostname)) {
    throw new Error('Seed refuses remote and mongodb+srv databases.');
  }
  const databaseName = parsed.pathname.replace(/^\//, '');
  if (
    databaseName !== 'bulgaria_archive_dev' &&
    databaseName !== 'bulgaria_archive' &&
    !/^archive_(?:test|e2e)(?:_|$)/.test(databaseName)
  ) {
    throw new Error('Seed requires a dedicated development or test database.');
  }

  const profileName = process.env.SEED_PROFILE ?? 'minimal';
  const accounts = profiles[profileName];
  if (!accounts) {
    throw new Error(
      `Unknown SEED_PROFILE=${profileName}. Use minimal or demo.`,
    );
  }
  const password = process.env.SEED_PASSWORD;
  if (!password) {
    throw new Error('SEED_PASSWORD is required and must be generated locally.');
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error(
      'SEED_PASSWORD must contain between 12 and 128 characters.',
    );
  }
  return { databaseUrl, profileName, accounts, password };
}

async function run() {
  const { databaseUrl, profileName, accounts, password } = seedConfiguration();
  const client = new mongo.MongoClient(databaseUrl, {
    serverSelectionTimeoutMS: 5_000,
  });
  await client.connect();
  try {
    const database = client.db();
    const users = database.collection('users');
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    await users.createIndex({ email: 1 }, { unique: true });
    for (const [email, firstName, lastName, role, status] of accounts) {
      await users.updateOne(
        { email },
        {
          $set: {
            firstName,
            lastName,
            role,
            status,
            passwordHash,
            authVersion: 0,
            updatedAt: now,
          },
          $setOnInsert: { _id: uuidv7(), createdAt: now },
        },
        { upsert: true },
      );
    }

    const seeded = await users
      .find(
        { email: { $in: accounts.map(([email]) => email) } },
        { projection: { _id: 1 } },
      )
      .toArray();
    await database.collection('sessions').deleteMany({
      accountId: { $in: seeded.map(({ _id }) => _id) },
    });

    process.stdout.write(
      `Loaded ${accounts.length} synthetic ${profileName} accounts into ${database.databaseName}:\n` +
        accounts
          .map(([email, , , role, status]) => `- ${email} (${role}, ${status})`)
          .join('\n') +
        '\n',
    );
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
