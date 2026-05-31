import { Request, Response, NextFunction } from 'express';

/**
 * Custom request logger middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'incorrect' : 'correct';
    
    console.log(
      `${logLevel} ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
    );
  });

  next();
}

/**
 * Log error
 */
export function logError(error: Error, context?: string) {
  console.error(`Error${context ? ` in ${context}` : ''}:`, error.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(error.stack);
  }
}

/**
 * Log info
 */
export function logInfo(message: string, data?: any) {
  console.log(`info: ${message}`, data || '');
}

/**
 * Log warning
 */
export function logWarning(message: string, data?: any) {
  console.warn(`warning ${message}`, data || '');
}