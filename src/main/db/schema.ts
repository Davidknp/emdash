import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const sshConnections = sqliteTable(
  'ssh_connections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull().default(22),
    username: text('username').notNull(),
    authType: text('auth_type').notNull().default('agent'), // 'password' | 'key' | 'agent'
    privateKeyPath: text('private_key_path'), // optional, for key auth
    useAgent: integer('use_agent').notNull().default(0), // boolean, 0=false, 1=true
    metadata: text('metadata'), // JSON for additional connection-specific data
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameIdx: uniqueIndex('idx_ssh_connections_name').on(table.name),
    hostIdx: index('idx_ssh_connections_host').on(table.host),
  })
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    path: text('path').notNull(),
    workspaceProvider: text('workspace_provider').notNull().default('local'), // 'local' | 'ssh' | 'vm'
    baseRef: text('base_ref'),
    sshConnectionId: text('ssh_connection_id').references(() => sshConnections.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pathIdx: uniqueIndex('idx_projects_path').on(table.path),
    sshConnectionIdIdx: index('idx_projects_ssh_connection_id').on(table.sshConnectionId),
  })
);

export const appSettings = sqliteTable(
  'app_settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    keyIdx: uniqueIndex('idx_app_settings_key').on(table.key),
  })
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').notNull(),
    sourceBranch: text('source_branch').notNull(),
    taskBranch: text('task_branch'),
    linkedIssue: text('linked_issue'),
    archivedAt: text('archived_at'), // null = active, timestamp = archived
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastInteractedAt: text('last_interacted_at'),
    statusChangedAt: text('status_changed_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    isPinned: integer('is_pinned').notNull().default(0), // boolean, 0=false, 1=true
  },
  (table) => ({
    projectIdIdx: index('idx_tasks_project_id').on(table.projectId),
  })
);

export const pullRequests = sqliteTable(
  'pull_requests',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull().default('github'),
    nameWithOwner: text('name_with_owner').notNull().default(''),
    url: text('url').notNull(),
    title: text('title').notNull(),
    identifier: text('identifier'),
    status: text('status').notNull().default('open'),
    author: text('author'),
    authorLogin: text('author_login'),
    authorDisplayName: text('author_display_name'),
    authorAvatarUrl: text('author_avatar_url'),
    isDraft: integer('is_draft'),
    headRefName: text('head_ref_name'),
    metadata: text('metadata'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    fetchedAt: text('fetched_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    urlIdx: uniqueIndex('idx_pull_requests_url').on(table.url),
    nameWithOwnerIdx: index('idx_pull_requests_name_with_owner').on(table.nameWithOwner),
    authorLoginIdx: index('idx_pull_requests_author_login').on(table.authorLogin),
    headRefNameIdx: index('idx_pull_requests_head_ref_name').on(table.headRefName),
  })
);

export const pullRequestLabels = sqliteTable(
  'pull_request_labels',
  {
    pullRequestId: text('pull_request_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pullRequestId, table.name] }),
    nameIdx: index('idx_prl_name').on(table.name),
  })
);

export const pullRequestAssignees = sqliteTable(
  'pull_request_assignees',
  {
    pullRequestId: text('pull_request_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    login: text('login').notNull(),
    avatarUrl: text('avatar_url'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pullRequestId, table.login] }),
    loginIdx: index('idx_pra_login').on(table.login),
  })
);

export const projectPullRequests = sqliteTable(
  'project_pull_requests',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pullRequestUrl: text('pull_request_url')
      .notNull()
      .references(() => pullRequests.url, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.pullRequestUrl] }),
    projectIdIdx: index('idx_project_pull_requests_project_id').on(table.projectId),
  })
);

export const tasksPullRequests = sqliteTable(
  'tasks_pull_requests',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    pullRequestUrl: text('pull_request_url')
      .notNull()
      .references(() => pullRequests.url, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.pullRequestUrl] }),
  })
);

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    provider: text('provider'),
    config: text('config'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    taskIdIdx: index('idx_conversations_task_id').on(table.taskId),
  })
);

export const terminals = sqliteTable(
  'terminals',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    ssh: integer('ssh').notNull().default(0), // boolean, 0=false, 1=true
    name: text('name').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    taskIdIdx: index('idx_terminals_task_id').on(table.taskId),
  })
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    sender: text('sender').notNull(),
    timestamp: text('timestamp')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    metadata: text('metadata'),
  },
  (table) => ({
    conversationIdIdx: index('idx_messages_conversation_id').on(table.conversationId),
    timestampIdx: index('idx_messages_timestamp').on(table.timestamp),
  })
);

export const lineComments = sqliteTable(
  'line_comments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    lineNumber: integer('line_number').notNull(),
    lineContent: text('line_content'),
    content: text('content').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    sentAt: text('sent_at'), // NULL = unsent, timestamp = when injected to chat
  },
  (table) => ({
    taskFileIdx: index('idx_line_comments_task_file').on(table.taskId, table.filePath),
  })
);

export const editorBuffers = sqliteTable(
  'editor_buffers',
  {
    id: text('id').primaryKey(), // `${projectId}:${workspaceId}:${filePath}`
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull(),
    filePath: text('file_path').notNull(),
    content: text('content').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    workspaceFileIdx: index('idx_editor_buffers_workspace_file').on(
      table.workspaceId,
      table.filePath
    ),
  })
);

export const kv = sqliteTable(
  'kv',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    keyIdx: uniqueIndex('idx_kv_key').on(table.key),
  })
);

export const appSecrets = sqliteTable(
  'app_secrets',
  {
    key: text('key').primaryKey(),
    secret: text('secret').notNull(),
  },
  (table) => ({
    keyIdx: uniqueIndex('idx_app_secrets_key').on(table.key),
  })
);

export type KvRow = typeof kv.$inferSelect;
export type KvInsert = typeof kv.$inferInsert;
export type AppSecretRow = typeof appSecrets.$inferSelect;
export type AppSecretInsert = typeof appSecrets.$inferInsert;

export const sshConnectionsRelations = relations(sshConnections, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tasks: many(tasks),
  sshConnection: one(sshConnections, {
    fields: [projects.sshConnectionId],
    references: [sshConnections.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  conversations: many(conversations),
  lineComments: many(lineComments),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  task: one(tasks, {
    fields: [conversations.taskId],
    references: [tasks.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const lineCommentsRelations = relations(lineComments, ({ one }) => ({
  task: one(tasks, {
    fields: [lineComments.taskId],
    references: [tasks.id],
  }),
}));

export const automations = sqliteTable(
  'automations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    projectName: text('project_name').notNull().default(''),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    agentId: text('agent_id').notNull(),
    mode: text('mode').notNull().default('schedule'), // 'schedule' | 'trigger'
    schedule: text('schedule').notNull(), // JSON: AutomationSchedule
    triggerType: text('trigger_type'), // TriggerType | null
    triggerConfig: text('trigger_config'), // JSON: TriggerConfig | null
    useWorktree: integer('use_worktree').notNull().default(1), // boolean
    status: text('status').notNull().default('active'), // 'active' | 'paused' | 'error'
    lastRunAt: text('last_run_at'),
    nextRunAt: text('next_run_at'),
    runCount: integer('run_count').notNull().default(0),
    lastRunResult: text('last_run_result'), // 'success' | 'failure' | null
    lastRunError: text('last_run_error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    projectIdIdx: index('idx_automations_project_id').on(table.projectId),
    statusNextRunIdx: index('idx_automations_status_next_run').on(table.status, table.nextRunAt),
    updatedAtIdx: index('idx_automations_updated_at').on(table.updatedAt),
  })
);

export const automationRunLogs = sqliteTable(
  'automation_run_logs',
  {
    id: text('id').primaryKey(),
    automationId: text('automation_id')
      .notNull()
      .references(() => automations.id, { onDelete: 'cascade' }),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    status: text('status').notNull(), // 'running' | 'success' | 'failure'
    error: text('error'),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  },
  (table) => ({
    automationStartedIdx: index('idx_automation_run_logs_automation_started').on(
      table.automationId,
      table.startedAt
    ),
    statusIdx: index('idx_automation_run_logs_status').on(table.status),
  })
);

export const automationsRelations = relations(automations, ({ one, many }) => ({
  project: one(projects, {
    fields: [automations.projectId],
    references: [projects.id],
  }),
  runLogs: many(automationRunLogs),
}));

export const automationRunLogsRelations = relations(automationRunLogs, ({ one }) => ({
  automation: one(automations, {
    fields: [automationRunLogs.automationId],
    references: [automations.id],
  }),
  task: one(tasks, {
    fields: [automationRunLogs.taskId],
    references: [tasks.id],
  }),
}));

export type AutomationRow = typeof automations.$inferSelect;
export type AutomationInsert = typeof automations.$inferInsert;
export type AutomationRunLogRow = typeof automationRunLogs.$inferSelect;
export type AutomationRunLogInsert = typeof automationRunLogs.$inferInsert;

export type SshConnectionRow = typeof sshConnections.$inferSelect;
export type SshConnectionInsert = typeof sshConnections.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type TerminalRow = typeof terminals.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type LineCommentRow = typeof lineComments.$inferSelect;
export type LineCommentInsert = typeof lineComments.$inferInsert;
export type EditorBufferRow = typeof editorBuffers.$inferSelect;
export type EditorBufferInsert = typeof editorBuffers.$inferInsert;
