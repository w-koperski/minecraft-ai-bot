const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '..', '..', 'logs');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_LOG_FILES = 7;

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  levels: { error: 0, warn: 1, info: 2, debug: 3 },
  format: fileFormat,
  defaultMeta: { service: 'minecraft-ai-bot' },
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(logDir, 'bot.log'),
      level: 'info',
      maxsize: MAX_FILE_SIZE,
      maxFiles: MAX_LOG_FILES,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: MAX_FILE_SIZE,
      maxFiles: MAX_LOG_FILES,
      tailable: true
    })
  ],
  exitOnError: false
});

module.exports = logger;