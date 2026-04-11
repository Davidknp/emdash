import z from 'zod';

export const workspaceProviderSchema = z.object({
  type: z.literal('script'),
  provisionCommand: z.string(),
  terminateCommand: z.string(),
});

export type WorkspaceProviderConfig = z.infer<typeof workspaceProviderSchema>;

export const projectSettingsSchema = z.object({
  preservePatterns: z
    .array(z.string())
    .optional()
    .default([
      '.env',
      '.env.keys',
      '.env.local',
      '.env.*.local',
      '.envrc',
      'docker-compose.override.yml',
      '.emdash.json',
    ]),
  shellSetup: z.string().optional(),
  tmux: z.boolean().optional(),
  scripts: z
    .object({
      setup: z.string().optional(),
      run: z.string().optional(),
      teardown: z.string().optional(),
    })
    .optional(),
  worktreeDirectory: z.string().optional(),
  defaultBranch: z.string().optional(),
  remote: z.string().optional(),
  workspaceProvider: workspaceProviderSchema.optional(),
});

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

export interface ProjectSettingsProvider {
  getDefaultBranch(): Promise<string>;
  getRemote(): Promise<string>;
  getWorktreeDirectory(): Promise<string>;
  get(): Promise<ProjectSettings>;
  update(settings: ProjectSettings): Promise<void>;
  ensure(): Promise<void>;
}
