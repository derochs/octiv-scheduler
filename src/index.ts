import schedule from 'node-schedule';
import { config } from './config.js';
import { logger } from './logger.js';
import { OctivClient } from './octiv-client.js';
import { DiscoveryScheduler } from './scheduler.js';
import { watchWishlist } from './wishlist.js';

const client = new OctivClient();
const discoveryScheduler = new DiscoveryScheduler(client);

logger.info(`Octiv Booker`);

discoveryScheduler.runDiscovery();

logger.info(`Discovery Cron: ${config.discoveryCron}`);

schedule.scheduleJob(config.discoveryCron, () => {
  discoveryScheduler.runDiscovery();
});

watchWishlist(() => {
  logger.info('Wishlist configuration changed. Refreshing schedule...');
  discoveryScheduler.runDiscovery();
});

process.on('SIGINT', () => {
  schedule.gracefulShutdown().then(() => process.exit(0));
});
