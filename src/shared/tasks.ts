import { CreateConversationParams } from '@shared/conversations';
import { PullRequest } from './pull-requests';

export type TaskLifecycleStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';

export type Issue = {
  provider: 'github' | 'linear' | 'jira' | 'gitlab' | 'plain' | 'forgejo';
  url: string;
  title: string;
  identifier: string;
  description?: string;
  status?: string;
  assignees?: string[];
  project?: string;
  updatedAt?: string;
  fetchedAt?: string;
};

export type WorkspaceInstanceStatus =
  | 'provisioning'
  | 'ready'
  | 'terminating'
  | 'terminated'
  | 'error';

export type WorkspaceInstance = {
  id: string;
  taskId: string;
  status: WorkspaceInstanceStatus;
  host: string | null;
  port: number;
  username: string | null;
  worktreePath: string | null;
  externalId: string | null;
  errorMessage: string | null;
  stderrLog: string | null;
  createdAt: string;
  readyAt: string | null;
  terminatedAt: string | null;
};

export type Task = {
  id: string;
  projectId: string;
  name: string;
  status: TaskLifecycleStatus;
  sourceBranch: string;
  taskBranch?: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp: when lifecycle status last changed (current status entered). */
  statusChangedAt: string;
  archivedAt?: string;
  lastInteractedAt?: string;
  linkedIssue?: Issue;
  isPinned: boolean;
  prs: PullRequest[];
  conversations: Record<string, number>;
  usesWorkspaceProvider?: boolean;
  workspaceInstance?: WorkspaceInstance;
};

export type TaskBootstrapStatus =
  | { status: 'ready' }
  | { status: 'bootstrapping' }
  | { status: 'error'; message: string }
  | { status: 'not-started' };

export type CreateTaskStrategy =
  | { kind: 'new-branch'; taskBranch: string; pushBranch?: boolean }
  | { kind: 'checkout-existing' }
  | {
      kind: 'from-pull-request';
      prNumber: number;
      headBranch: string;
      taskBranch?: string;
      pushBranch?: boolean;
    }
  | { kind: 'no-worktree' };

export type CreateTaskParams = {
  id: string;
  projectId: string;
  name: string;
  /** The branch to fork the new worktree from (not used for `from-pull-request` strategy) */
  sourceBranch: { branch: string; remote?: string };
  /** Controls branch creation, worktree setup, and git fetch strategy */
  strategy: CreateTaskStrategy;
  /** The issue to link to the task */
  linkedIssue?: Issue;
  /**  */
  initialConversation?: CreateConversationParams;
  initialStatus?: TaskLifecycleStatus;
  /** If true, provision the task on a remote workspace using the project's workspaceProvider scripts */
  useWorkspaceProvider?: boolean;
};

export type CreateTaskError =
  | { type: 'project-not-found' }
  | { type: 'branch-not-found'; branch: string }
  | { type: 'branch-already-exists'; branch: string }
  | { type: 'invalid-base-branch'; branch: string }
  | { type: 'worktree-setup-failed'; message: string }
  | { type: 'pr-fetch-failed'; message: string }
  | { type: 'provision-failed'; message: string }
  | { type: 'workspace-provider-not-configured' }
  | { type: 'workspace-provider-feature-disabled' };

export type ProvisionTaskResult = {
  path: string;
  workspaceId: string;
};

export function formatIssueAsPrompt(issue: Issue, initialPrompt?: string): string {
  const parts = [`[${issue.identifier}] ${issue.title}`, issue.url, issue.description].filter(
    Boolean
  );

  if (initialPrompt?.trim()) parts.push('', initialPrompt.trim());
  return parts.join('\n');
}
