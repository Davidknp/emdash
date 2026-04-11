import z from 'zod';

const provisionOutputSchema = z.object({
  host: z.string().min(1),
  id: z.string().optional(),
  port: z.number().int().positive().optional(),
  username: z.string().optional(),
  worktreePath: z.string().optional(),
});

export type ProvisionOutput = z.infer<typeof provisionOutputSchema>;

export type ParseProvisionOutputError =
  | { type: 'empty'; message: string }
  | { type: 'invalid-json'; message: string }
  | { type: 'validation'; message: string };

export function parseProvisionOutput(
  stdout: string
): { success: true; data: ProvisionOutput } | { success: false; error: ParseProvisionOutputError } {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {
      success: false,
      error: { type: 'empty', message: 'Provision script produced no output' },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      success: false,
      error: {
        type: 'invalid-json',
        message: `Provision script output is not valid JSON: ${trimmed.slice(0, 200)}`,
      },
    };
  }

  const result = provisionOutputSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return {
      success: false,
      error: { type: 'validation', message: `Invalid provision output: ${issues}` },
    };
  }

  return { success: true, data: result.data };
}
