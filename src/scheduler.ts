import { format, subHours } from 'date-fns';
import schedule from 'node-schedule';
import { logger } from './logger.js';
import { OctivClient } from './octiv-client.js';
import {
  computeStartAndEndDate,
  loadWishlist,
  WishlistRule,
} from './wishlist.js';

export type SummaryEntry = { icon: string; name: string; date: Date; note: string };

type ConfirmedItem = WishlistRule & { id: number; isAlreadyBooked: boolean };

export function formatSummaryLines(entries: SummaryEntry[]): string[] {
  if (entries.length === 0) return ['  —   nothing to do'];
  return entries.map((e) => {
    const d = format(e.date, 'EEE dd MMM HH:mm');
    // ✅ renders as 2 columns in most terminals; pad to preserve alignment
    const icon = e.icon === '✅' ? '✅ ' : e.icon;
    return `  ${icon}  ${e.name.padEnd(24)}${d}   ${e.note}`;
  });
}

export class DiscoveryScheduler {
  private client: OctivClient;
  private scheduledJobs = new Map<number, schedule.Job>();

  constructor(client: OctivClient) {
    this.client = client;
  }

  private async resolveWishlist(): Promise<{
    wishlist: WishlistRule[];
    confirmed: ConfirmedItem[];
  } | null> {
    const wishlist = await loadWishlist();
    const datesResult = computeStartAndEndDate(wishlist);
    if (!datesResult) return null;

    const available = await this.client.fetchClassesForRange(
      datesResult.startDate,
      datesResult.endDate,
    );

    const confirmed: ConfirmedItem[] = wishlist
      .map((rule) => {
        const match = available.find(
          (cls) =>
            cls.name === rule.className &&
            cls.date.getTime() === rule.classDateUtc.getTime(),
        );
        return match
          ? { ...rule, id: match.id, isAlreadyBooked: match.isAlreadyBooked }
          : null;
      })
      .filter((item): item is ConfirmedItem => item !== null);

    return { wishlist, confirmed };
  }

  async getSummary(): Promise<SummaryEntry[]> {
    await this.client.authenticate();
    const result = await this.resolveWishlist();
    if (!result) return [];

    const { wishlist, confirmed } = result;
    const entries: SummaryEntry[] = [];

    for (const rule of wishlist) {
      if (!confirmed.find((c) => c.classDateUtc.getTime() === rule.classDateUtc.getTime() && c.className === rule.className)) {
        entries.push({ icon: '✗ ', name: rule.className, date: rule.classDateUtc, note: 'not found in API' });
      }
    }

    for (const item of confirmed) {
      if (item.isAlreadyBooked) {
        entries.push({ icon: '✓ ', name: item.className, date: item.classDateUtc, note: 'already booked' });
        continue;
      }

      const bookingTime = subHours(item.classDateUtc, item.hoursBefore);

      if (bookingTime <= new Date()) {
        entries.push({ icon: '⏱ ', name: item.className, date: item.classDateUtc, note: 'ready to book' });
      } else if (this.scheduledJobs.has(item.id)) {
        entries.push({ icon: '↩ ', name: item.className, date: item.classDateUtc, note: `scheduled ${format(bookingTime, 'EEE dd MMM HH:mm')}` });
      } else {
        entries.push({ icon: '⏱ ', name: item.className, date: item.classDateUtc, note: `opens ${format(bookingTime, 'EEE dd MMM HH:mm')}` });
      }
    }

    return entries;
  }

  async runDiscovery() {
    logger.info('Running discovery loop...');

    try {
      await this.client.authenticate();
      const result = await this.resolveWishlist();
      if (!result) {
        for (const [, job] of this.scheduledJobs.entries()) job.cancel();
        this.scheduledJobs.clear();
        logger.info('Wishlist is empty — all scheduled jobs cancelled.');
        return;
      }

      const { wishlist, confirmed } = result;

      for (const [scheduledId, job] of this.scheduledJobs.entries()) {
        if (!confirmed.some((item) => item.id === scheduledId)) {
          job.cancel();
          this.scheduledJobs.delete(scheduledId);
        }
      }

      const entries: SummaryEntry[] = [];

      for (const rule of wishlist) {
        if (!confirmed.find((c) => c.classDateUtc.getTime() === rule.classDateUtc.getTime() && c.className === rule.className)) {
          entries.push({ icon: '✗ ', name: rule.className, date: rule.classDateUtc, note: 'not found in API' });
        }
      }

      for (const item of confirmed) {
        if (item.isAlreadyBooked) {
          entries.push({ icon: '✓ ', name: item.className, date: item.classDateUtc, note: 'already booked' });
          continue;
        }

        const bookingTime = subHours(item.classDateUtc, item.hoursBefore);

        if (bookingTime <= new Date()) {
          await this.client.bookClass(item.id.toString());
          entries.push({ icon: '✅', name: item.className, date: item.classDateUtc, note: 'booked now' });
        } else {
          if (this.scheduledJobs.has(item.id)) {
            entries.push({ icon: '↩ ', name: item.className, date: item.classDateUtc, note: `scheduled ${format(bookingTime, 'EEE dd MMM HH:mm')}` });
            continue;
          }

          const scheduledTime = new Date(bookingTime.getTime() + 500);
          const job = schedule.scheduleJob(scheduledTime, async () => {
            logger.info(`🚀 Booking "${item.className}" (${format(item.classDateUtc, 'EEE dd MMM HH:mm')})...`);
            await this.client.bookClass(item.id.toString());
            this.scheduledJobs.delete(item.id);
          });
          this.scheduledJobs.set(item.id, job);
          entries.push({ icon: '⏱ ', name: item.className, date: item.classDateUtc, note: `opens ${format(bookingTime, 'EEE dd MMM HH:mm')}` });
        }
      }

      const rowContents = formatSummaryLines(entries);

      const TITLE = '─ Discovery ';
      const innerWidth = Math.max(...rowContents.map((r) => r.length), 0) + 2;
      const boxWidth = Math.max(innerWidth, TITLE.length + 4);

      logger.info('┌' + TITLE + '─'.repeat(boxWidth - TITLE.length) + '┐');
      for (const r of rowContents) logger.info('│' + r.padEnd(boxWidth) + '│');
      logger.info('└' + '─'.repeat(boxWidth) + '┘');
    } catch (error) {
      logger.error('Discovery failed:', error);
    }
  }
}
