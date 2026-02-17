import { format, subHours } from 'date-fns';
import schedule from 'node-schedule';
import { logger } from './logger.js';
import { OctivClient } from './octiv-client.js';
import {
  computeStartAndEndDate,
  loadWishlist,
  WishlistRule,
} from './wishlist.js';

export class DiscoveryScheduler {
  private client: OctivClient;
  private scheduledJobs = new Map<number, schedule.Job>();

  constructor(client: OctivClient) {
    this.client = client;
  }

  async runDiscovery() {
    logger.info('Running discovery loop...');

    try {
      await this.client.authenticate();
      const wishlist = await loadWishlist();
      logger.info(`Found ${wishlist.length} outstanding rules in wishlist:`);
      const datesResult = computeStartAndEndDate(wishlist);
      if (!datesResult) {
        logger.info(
          `No outstanding rules found in wishlist. Cancelling all scheduled jobs.`,
        );
        for (const [scheduledId, job] of this.scheduledJobs.entries()) {
          job.cancel();
          logger.info(`Cancelled job for class ${scheduledId}`);
        }
        this.scheduledJobs.clear();
        return;
      }

      const availableClassesForDateRange =
        await this.client.fetchClassesForRange(
          datesResult.startDate,
          datesResult.endDate,
        );
      logger.info(
        `Found ${availableClassesForDateRange.length} classes in range:`,
      );

      const confirmedWishlist: (WishlistRule & { id: number })[] = wishlist
        .map((rule) => {
          const matchingClass = availableClassesForDateRange.find(
            (cls) =>
              cls.name === rule.className &&
              cls.date.getTime() === rule.classDateUtc.getTime(),
          );
          return matchingClass ? { ...rule, id: matchingClass.id } : null;
        })
        .filter((item): item is WishlistRule & { id: number } => item !== null);

      logger.info(
        `Matched ${confirmedWishlist.length} classes out of ${wishlist.length} rules.`,
      );
      logger.info('Confirmed Wishlist:', confirmedWishlist);

      for (const [scheduledId, job] of this.scheduledJobs.entries()) {
        const stillInWishlist = confirmedWishlist.some(
          (item) => item.id === scheduledId,
        );
        if (!stillInWishlist) {
          logger.info(
            `Class ${scheduledId} is no longer in the wishlist. Cancelling scheduled booking.`,
          );
          job.cancel();
          this.scheduledJobs.delete(scheduledId);
        }
      }

      for (const item of confirmedWishlist) {
        const bookingTime = subHours(item.classDateUtc, item.hoursBefore);
        logger.info(
          `[${item.id}] Class "${item.className}" at ${format(item.classDateUtc, 'yyyy-MM-dd HH:mm:ss')} should be booked at ${format(bookingTime, 'yyyy-MM-dd HH:mm:ss')}`,
        );

        if (bookingTime <= new Date()) {
          logger.info(
            `[${item.id}] Class "${item.className}" can be booked immediately. Attempting to book...`,
          );
          await this.client.bookClass(item.id.toString());
        } else {
          if (this.scheduledJobs.has(item.id)) {
            logger.info(
              `[${item.id}] Job for class "${item.className}" is already scheduled.`,
            );
            continue;
          }

          logger.info(
            `[${item.id}] ⏱️ Scheduling booking for class "${item.className}" at ${format(bookingTime, 'yyyy-MM-dd HH:mm:ss')}`,
          );
          const scheduledTime = new Date(bookingTime.getTime() + 500);
          const job = schedule.scheduleJob(scheduledTime, async () => {
            logger.info(
              `[${item.id}] 🚀 Executing scheduled booking for class "${item.className}"...`,
            );
            await this.client.bookClass(item.id.toString());
            this.scheduledJobs.delete(item.id);
          });
          this.scheduledJobs.set(item.id, job);
        }
      }
    } catch (error) {
      logger.error('Discovery failed:', error);
    }
  }
}
