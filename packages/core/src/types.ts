import type { reportPayload, reportEvent } from '@syntra/shared';
import type { z } from 'zod';

export type ReportPayload = z.infer<typeof reportPayload>;
export type ReportEvent = z.infer<typeof reportEvent>;
