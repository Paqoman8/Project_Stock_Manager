import { Request, Response, NextFunction } from 'express';
import { ZodType, ZodError } from 'zod';
import { formatZodErrors } from '../utils/zod';

declare global {
  namespace Express {
    interface Request {
      validatedBody?: unknown;
      validatedQuery?: unknown;
      validatedParams?: unknown;
    }
  }
}

interface ValidateOptions {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function validate(options: ValidateOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (options.body) {
        req.validatedBody = options.body.parse(req.body);
      }
      if (options.query) {
        req.validatedQuery = options.query.parse(req.query);
      }
      if (options.params) {
        req.validatedParams = options.params.parse(req.params);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          errors: formatZodErrors(err),
        });
        return;
      }
      console.error('[validate] Unexpected error:', err);
      res.status(500).json({
        success: false,
        message: 'Erreur de validation.',
      });
    }
  };
}
