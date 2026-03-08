type LogLevel = 'info' | 'warn' | 'error';

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, prefix: string, message: string, data?: Record<string, unknown>) {
  const entry = {
    time: timestamp(),
    level,
    prefix,
    message,
    ...data,
  };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(JSON.stringify(entry));
}

export const logger = {
  info: (prefix: string, message: string, data?: Record<string, unknown>) =>
    log('info', prefix, message, data),
  warn: (prefix: string, message: string, data?: Record<string, unknown>) =>
    log('warn', prefix, message, data),
  error: (prefix: string, message: string, data?: Record<string, unknown>) =>
    log('error', prefix, message, data),
};
