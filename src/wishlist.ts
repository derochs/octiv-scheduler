import chokidar from 'chokidar';
import path from 'path';

import fs from 'fs/promises';

export interface WishlistRule {
  className: string;
  classDateUtc: Date;
  hoursBefore: number;
}

export async function loadWishlist(): Promise<WishlistRule[]> {
  try {
    const currentDate = new Date();
    const filePath = path.resolve(process.cwd(), 'wishlist.json');
    const content = await fs.readFile(filePath, 'utf-8');
    const rawRules = JSON.parse(content);
    const rules: WishlistRule[] = rawRules.map((rule: any) => ({
      ...rule,
      classDateUtc: new Date(rule.classDateUtc),
    }));

    return rules.filter(
      (rule) => rule.classDateUtc.getTime() > currentDate.getTime(),
    );
  } catch (error) {
    console.warn('Failed to load wishlist.json, using empty list.', error);
    return [];
  }
}

export function watchWishlist(onChange: () => void) {
  const wishlistPath = path.resolve(process.cwd(), 'wishlist.json');

  console.log(`Watching for changes in: ${wishlistPath}`);

  const watcher = chokidar.watch(wishlistPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 5000,
    },
  });

  watcher.on('change', () => {
    console.log('Wishlist configuration changed. Refreshing...!');
    onChange();
  });

  watcher.on('error', (error) => {
    console.error('Watcher error:', error);
  });
}

export function computeStartAndEndDate(
  rules: WishlistRule[],
): { startDate: Date; endDate: Date } | null {
  if (rules.length === 0) {
    return null;
  }

  const { startDate, endDate } = rules.reduce(
    (acc, rule) => ({
      startDate:
        rule.classDateUtc < acc.startDate ? rule.classDateUtc : acc.startDate,
      endDate:
        rule.classDateUtc > acc.endDate ? rule.classDateUtc : acc.endDate,
    }),
    { startDate: rules[0].classDateUtc, endDate: rules[0].classDateUtc },
  );

  return { startDate, endDate };
}
