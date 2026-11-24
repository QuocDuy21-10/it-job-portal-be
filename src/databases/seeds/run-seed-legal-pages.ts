import 'dotenv/config';
import mongoose from 'mongoose';
import { LEGAL_PAGES_SEED_DATA } from './data/legal-pages.data';

// Date printed on the sample texts, shown as "last updated" until an admin saves.
const SAMPLE_TEXT_DATE = new Date('2026-11-14T00:00:00+07:00');

// Narrow view of the raw driver collection so this can run against a fake in tests.
export interface LegalPagesCollection {
  bulkWrite(operations: any[]): Promise<{ upsertedCount: number }>;
}

/** Idempotent: existing pages are never touched, not even their updatedAt. */
export async function seedLegalPages(legalPages: LegalPagesCollection): Promise<number> {
  const { upsertedCount } = await legalPages.bulkWrite(
    LEGAL_PAGES_SEED_DATA.map(({ page, locale, title, description, contentHtml }) => ({
      updateOne: {
        filter: { page, locale },
        update: {
          $setOnInsert: {
            title,
            description,
            contentHtml,
            isPublished: false,
            createdAt: SAMPLE_TEXT_DATE,
            updatedAt: SAMPLE_TEXT_DATE,
          },
        },
        upsert: true,
      },
    })),
  );
  return upsertedCount;
}

if (require.main === module) {
  (async () => {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) throw new Error('Missing MONGO_URL environment variable');

    await mongoose.connect(mongoUrl, { autoIndex: false });
    try {
      const inserted = await seedLegalPages(mongoose.connection.collection('legal_pages'));
      console.log(`Legal pages inserted: ${inserted}`);
    } finally {
      await mongoose.disconnect();
    }
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
