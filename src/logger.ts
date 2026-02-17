import winston from 'winston';

const { combine, timestamp, printf, colorize, json } = winston.format;

const customFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format:
    process.env.NODE_ENV === 'production'
      ? combine(timestamp(), json())
      : combine(
          colorize(),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          customFormat,
        ),
  transports: [new winston.transports.Console()],
});
