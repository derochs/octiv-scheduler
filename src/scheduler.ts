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

      const confirmedWishlist: (WishlistRule & { id: number; isAlreadyBooked: boolean })[] = wishlist
        .map((rule) => {
          const matchingClass = availableClassesForDateRange.find(
            (cls) =>
              cls.name === rule.className &&
              cls.date.getTime() === rule.classDateUtc.getTime(),
          );
          return matchingClass
            ? { ...rule, id: matchingClass.id, isAlreadyBooked: matchingClass.isAlreadyBooked }
            : null;
        })
        .filter((item): item is WishlistRule & { id: number; isAlreadyBooked: boolean } => item !== null);

      for (const [scheduledId, job] of this.scheduledJobs.entries()) {
        const stillInWishlist = confirmedWishlist.some(
          (item) => item.id === scheduledId,
        );
        if (!stillInWishlist) {
          job.cancel();
          this.scheduledJobs.delete(scheduledId);
        }
      }

      let bookedNow = 0;
      let scheduledNew = 0;
      let alreadyScheduled = 0;
      let alreadyBooked = 0;
      const notFound = wishlist.length - confirmedWishlist.length;

      for (const item of confirmedWishlist) {
        if (item.isAlreadyBooked) {
          alreadyBooked++;
          continue;
        }

        const bookingTime = subHours(item.classDateUtc, item.hoursBefore);

        if (bookingTime <= new Date()) {
          logger.info(
            `[${item.id}] ✏️ Booking "${item.className}" immediately (window opened ${format(bookingTime, 'yyyy-MM-dd HH:mm')})`,
          );
          await this.client.bookClass(item.id.toString());
          bookedNow++;
        } else {
          if (this.scheduledJobs.has(item.id)) {
            alreadyScheduled++;
            continue;
          }

          const scheduledTime = new Date(bookingTime.getTime() + 500);
          const job = schedule.scheduleJob(scheduledTime, async () => {
            logger.info(
              `[${item.id}] 🚀 Executing scheduled booking for "${item.className}"...`,
            );
            await this.client.bookClass(item.id.toString());
            this.scheduledJobs.delete(item.id);
          });
          this.scheduledJobs.set(item.id, job);
          scheduledNew++;
        }
      }

      const sep = '─'.repeat(44);
      const row = (icon: string, label: string, n: number, note = '') =>
        `   ${icon}  ${label.padEnd(20)} ${String(n).padStart(2)}${note ? `  ${note}` : ''}`;

      const summaryRows = [
        ...(bookedNow        ? [row('✅', 'booked now',          bookedNow)]         : []),
        ...(scheduledNew     ? [row('⏱ ', 'newly scheduled',     scheduledNew)]      : []),
        ...(alreadyScheduled ? [row('↩ ', 'already scheduled',   alreadyScheduled)]  : []),
        ...(alreadyBooked    ? [row('✓ ', 'already booked',      alreadyBooked, '(skipped)')] : []),
        ...(notFound         ? [row('✗ ', 'not found in API',    notFound)]          : []),
      ];

      logger.info(`── Discovery (${wishlist.length} rule(s)) ${sep.slice(0, 44 - `Discovery (${wishlist.length} rule(s)) `.length)}`);
      for (const r of summaryRows.length ? summaryRows : [`   —   nothing to do`]) logger.info(r);
      logger.info(sep);
    } catch (error) {
      logger.error('Discovery failed:', error);
    }
  }
}
