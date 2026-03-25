import { format } from 'date-fns';
import fs from 'fs/promises';
import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import { config } from './config.js';
import { logger } from './logger.js';
import { DiscoveryScheduler, formatSummaryLines } from './scheduler.js';

const WISHLIST_PATH = path.resolve(process.cwd(), 'wishlist.json');

export function startTelegramBot(scheduler: DiscoveryScheduler): void {
  if (!config.telegramBotToken) {
    logger.info('No TELEGRAM_BOT_TOKEN set — Telegram bot disabled.');
    return;
  }

  const bot = new TelegramBot(config.telegramBotToken, { polling: true });
  const allowedUsers = config.telegramAllowedUsers;

  function isAllowed(chatId: number): boolean {
    if (allowedUsers.length === 0) return true;
    return allowedUsers.includes(chatId.toString());
  }

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      `Octiv Booker Bot\n\nYour chat ID: ${msg.chat.id}\n\nCommands:\n/add <date> — add CrossFit Class to wishlist\n/status — current scheduler state\n\nExample: /add 2026-04-01 10:00`,
    );
  });

  bot.onText(/\/add(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) {
      bot.sendMessage(chatId, 'Not authorized.');
      return;
    }

    const input = (match![1] || '').trim();
    if (!input || !isValidDate(input)) {
      bot.sendMessage(
        chatId,
        'Usage: /add <date>\nExample: /add 2026-04-01 10:00',
      );
      return;
    }

    const className = 'CrossFit Class';
    const hoursBefore = 71;
    const classDateUtc = new Date(input.replace(' ', 'T'));

    try {
      const content = await fs.readFile(WISHLIST_PATH, 'utf-8');
      const rules = JSON.parse(content);
      rules.push({
        className,
        classDateUtc: classDateUtc.toISOString(),
        hoursBefore,
      });
      await fs.writeFile(WISHLIST_PATH, JSON.stringify(rules, null, 2));

      bot.sendMessage(
        chatId,
        `Added "${className}" (${format(classDateUtc, 'EEE dd MMM HH:mm')}, ${hoursBefore}h before) to wishlist.`,
      );
    } catch (error) {
      logger.error('Telegram /add error:', error);
      bot.sendMessage(chatId, 'Failed to add to wishlist.');
    }
  });

  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) {
      bot.sendMessage(chatId, 'Not authorized.');
      return;
    }

    try {
      const entries = await scheduler.getSummary();
      const lines = formatSummaryLines(entries);
      bot.sendMessage(chatId, `<pre>${lines.join('\n')}</pre>`, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      logger.error('Telegram /status error:', error);
      bot.sendMessage(chatId, 'Failed to get status.');
    }
  });

  logger.info('Telegram bot started.');
}

function isValidDate(str: string): boolean {
  const d = new Date(str.replace(' ', 'T'));
  return !isNaN(d.getTime());
}
