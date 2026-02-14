import dotenv from 'dotenv';
dotenv.config();

export const config = {
  email: process.env.OCTIV_EMAIL || '',
  password: process.env.OCTIV_PASSWORD || '',
  dryRun: process.env.DRY_RUN === 'true',
  baseUrl: 'https://api.octivfitness.com/api',
  tenantId: process.env.OCTIV_TENANT_ID || '102121', // Default from notes
  locationId: process.env.OCTIV_LOCATION_ID || '1691', // Default from notes
  discoveryCron: process.env.DISCOVERY_CRON || '0 4 * * *', // Default: Daily at 04:00
};

if (!config.email || !config.password) {
  console.error(
    'Missing OCTIV_EMAIL or OCTIV_PASSWORD in environment variables.',
  );
  process.exit(1);
}
