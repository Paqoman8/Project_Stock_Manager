import { ZodError } from 'zod';

export function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}
