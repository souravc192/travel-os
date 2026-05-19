import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

export function validateRequest(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details: Record<string, string[]> = {};
    errors.array().forEach((err) => {
      const field = 'path' in err ? (err.path as string) : 'general';
      if (!details[field]) details[field] = [];
      details[field].push(err.msg);
    });

    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details,
      },
    });
    return;
  }
  next();
}
