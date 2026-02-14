import schedule from 'node-schedule';
import { config } from './config.js';
import { OctivClient } from './octiv-client.js';
import { DiscoveryScheduler } from './scheduler.js';
import { watchWishlist } from './wishlist.js';

const client = new OctivClient();
const discoveryScheduler = new DiscoveryScheduler(client);

console.log(`Octiv Booker`);

discoveryScheduler.runDiscovery();

console.log(`Discovery Cron: ${config.discoveryCron}`);

schedule.scheduleJob(config.discoveryCron, () => {
  discoveryScheduler.runDiscovery();
});

watchWishlist(() => {
  console.log('Wishlist configuration changed. Refreshing schedule...');
  discoveryScheduler.runDiscovery();
});

process.on('SIGINT', () => {
  schedule.gracefulShutdown().then(() => process.exit(0));
});
