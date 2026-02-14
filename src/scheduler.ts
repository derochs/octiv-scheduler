import { subHours } from 'date-fns';
import schedule from 'node-schedule';
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
    console.log(`[${new Date().toISOString()}] Running discovery loop...`);

    try {
      await this.client.authenticate();
      const wishlist = await loadWishlist();
      console.log(`Found ${wishlist.length} rules in wishlist.`);
      console.log(JSON.stringify(wishlist, null, 2));
      const datesResult = computeStartAndEndDate(wishlist);
      if (!datesResult) {
        console.log(
          `No rules found in wishlist. Cancelling all scheduled jobs.`,
        );
        for (const [scheduledId, job] of this.scheduledJobs.entries()) {
          job.cancel();
          console.log(`Cancelled job for class ${scheduledId}`);
        }
        this.scheduledJobs.clear();
        return;
      }
      console.log(`Start date: ${datesResult.startDate.toISOString()}`);
      console.log(`End date: ${datesResult.endDate.toISOString()}`);

      const availableClassesForDateRange =
        await this.client.fetchClassesForRange(
          datesResult.startDate,
          datesResult.endDate,
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

      console.log(
        `Found ${confirmedWishlist.length} matching wishlist items out of ${wishlist.length} rules.`,
      );
      console.log(JSON.stringify(confirmedWishlist, null, 2));

      for (const [scheduledId, job] of this.scheduledJobs.entries()) {
        const stillInWishlist = confirmedWishlist.some(
          (item) => item.id === scheduledId,
        );
        if (!stillInWishlist) {
          console.log(
            `Class ${scheduledId} is no longer in the wishlist. Cancelling scheduled booking.`,
          );
          job.cancel();
          this.scheduledJobs.delete(scheduledId);
        }
      }

      for (const item of confirmedWishlist) {
        const bookingTime = subHours(item.classDateUtc, item.hoursBefore);
        console.log(
          `Class ${item.className} at ${item.classDateUtc.toISOString()} should be booked at ${bookingTime.toISOString()}`,
        );

        if (bookingTime <= new Date()) {
          console.log(
            `Booking time for class ${item.id} has passed. Booking immediately.`,
          );
          await this.client.bookClass(item.id.toString());
        } else {
          if (this.scheduledJobs.has(item.id)) {
            console.log(`Job for class ${item.id} is already scheduled.`);
            continue;
          }

          console.log(
            `Scheduling booking for class ${item.id} at ${bookingTime.toISOString()}`,
          );
          const job = schedule.scheduleJob(bookingTime, async () => {
            console.log(`Executing scheduled booking for class ${item.id}...`);
            await this.client.bookClass(item.id.toString());
            this.scheduledJobs.delete(item.id);
          });
          this.scheduledJobs.set(item.id, job);
        }
      }
    } catch (error) {
      console.error('Discovery failed:', error);
    }
  }
}
