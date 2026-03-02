import { useEffect, useMemo, useState } from 'react';
import { useForm, useStore } from '@tanstack/react-form';
import { ExternalLink, Settings } from 'lucide-react';
import { Button } from './ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import type { BaseModalProps } from '@/contexts/ModalProvider';
import { SlugInput } from './ui/slug-input';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { MultiAgentDropdown } from './MultiAgentDropdown';
import { type Agent } from '../types';
import { type AgentRun } from '../types/chat';
import { agentMeta } from '../providers/meta';
import { type LinearIssueSummary } from '../types/linear';
import { type GitHubIssueSummary } from '../types/github';
import { type JiraIssueSummary } from '../types/jira';
import {
  generateFriendlyTaskName,
  normalizeTaskName,
  MAX_TASK_NAME_LENGTH,
} from '../lib/taskNames';
import BranchSelect from './BranchSelect';
import { generateTaskNameFromContext } from '../lib/branchNameGenerator';
import { useProjectManagementContext } from '../contexts/ProjectManagementContext';

const DEFAULT_AGENT: Agent = 'claude';

export interface CreateTaskResult {
  name: string;
  initialPrompt?: string;
  agentRuns?: AgentRun[];
  linkedLinearIssue?: LinearIssueSummary | null;
  linkedGithubIssue?: GitHubIssueSummary | null;
  linkedJiraIssue?: JiraIssueSummary | null;
  autoApprove?: boolean;
  useWorktree?: boolean;
  baseRef?: string;
  nameGenerated?: boolean;
}

export function CreateTaskModal({ onClose, onSuccess }: BaseModalProps<CreateTaskResult>) {
  const {
    selectedProject,
    projectDefaultBranch: defaultBranch,
    projectBranchOptions: branchOptions,
    isLoadingBranches,
  } = useProjectManagementContext();

  const existingNames = (selectedProject?.tasks || []).map((w) => w.name);
  const projectPath = selectedProject?.path;

  const normalizedExisting = useMemo(
    () => existingNames.map((n) => normalizeTaskName(n)).filter(Boolean),
    [existingNames]
  );

  // Advanced settings UI state
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ---------------------------------------------------------------------------
  // TanStack Form
  // ---------------------------------------------------------------------------
  const form = useForm({
    defaultValues: {
      name: '',
      agentRuns: [{ agent: DEFAULT_AGENT, runs: 1 }] as Array<{ agent: string; runs: number }>,
      initialPrompt: '',
      linkedLinearIssue: null as LinearIssueSummary | null,
      linkedGithubIssue: null as GitHubIssueSummary | null,
      linkedJiraIssue: null as JiraIssueSummary | null,
      autoApprove: false,
      useWorktree: true,
      baseRef: defaultBranch,
    },
    onSubmit: async ({ value }) => {
      // Determine final name and nameGenerated flag
      let finalName = normalizeTaskName(value.name);
      let isNameGenerated = false;
      if (!finalName) {
        finalName = generateFriendlyTaskName(normalizedExisting);
        isNameGenerated = true;
      }

      const activeAgentIds = value.agentRuns.map((ar) => ar.agent as Agent);
      const hasAutoApproveSupport = activeAgentIds.every((id) => !!agentMeta[id]?.autoApproveFlag);
      const hasInitialPromptSupport = activeAgentIds.every(
        (id) => agentMeta[id]?.initialPromptFlag !== undefined
      );

      // Close modal immediately — task creation happens in background
      onClose();

      try {
        onSuccess({
          name: finalName,
          initialPrompt:
            hasInitialPromptSupport && value.initialPrompt.trim()
              ? value.initialPrompt.trim()
              : undefined,
          agentRuns: value.agentRuns as AgentRun[],
          linkedLinearIssue: value.linkedLinearIssue as LinearIssueSummary | null,
          linkedGithubIssue: value.linkedGithubIssue as GitHubIssueSummary | null,
          linkedJiraIssue: value.linkedJiraIssue as JiraIssueSummary | null,
          autoApprove: hasAutoApproveSupport ? value.autoApprove : false,
          useWorktree: value.useWorktree,
          baseRef: value.baseRef,
          nameGenerated: isNameGenerated,
        });
      } catch (err) {
        console.error('Failed to create task:', err);
      }
    },
  });

  // Derived values from the current form store
  const agentRunsValue = useStore(form.store, (s) => s.values.agentRuns);
  const linkedLinearIssue = useStore(form.store, (s) => s.values.linkedLinearIssue);
  const linkedGithubIssue = useStore(form.store, (s) => s.values.linkedGithubIssue);
  const linkedJiraIssue = useStore(form.store, (s) => s.values.linkedJiraIssue);

  const activeAgents = useMemo(
    () => agentRunsValue.map((ar) => ar.agent as Agent),
    [agentRunsValue]
  );
  const hasAutoApproveSupport = activeAgents.every((id) => !!agentMeta[id]?.autoApproveFlag);
  const hasInitialPromptSupport = activeAgents.every(
    (id) => agentMeta[id]?.initialPromptFlag !== undefined
  );

  // ---------------------------------------------------------------------------
  // Branch tracking — sync with defaultBranch unless user manually changed it
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!userChangedBranchRef.current) {
      form.setFieldValue('baseRef', defaultBranch);
    }
  }, [defaultBranch, form]);

  const getInitialPromptPlaceholder = () => {
    if (!hasInitialPromptSupport) return 'Selected provider does not support initial prompts';
    if (linkedLinearIssue)
      return `e.g. Fix the attached Linear ticket ${(linkedLinearIssue as LinearIssueSummary).identifier} — describe any constraints.`;
    if (linkedGithubIssue)
      return `e.g. Fix the attached GitHub issue #${(linkedGithubIssue as GitHubIssueSummary).number} — describe any constraints.`;
    if (linkedJiraIssue)
      return `e.g. Fix the attached Jira ticket ${(linkedJiraIssue as JiraIssueSummary).key} — describe any constraints.`;
    return 'e.g. Summarize the key problems and propose a plan.';
  };

  // ---------------------------------------------------------------------------
  // Clear issues / auto-approve when provider doesn't support them
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hasInitialPromptSupport) {
      form.setFieldValue('linkedLinearIssue', null);
      form.setFieldValue('linkedGithubIssue', null);
      form.setFieldValue('linkedJiraIssue', null);
      form.setFieldValue('initialPrompt', '');
    }
  }, [hasInitialPromptSupport, form]);

  useEffect(() => {
    const autoApprove = form.getFieldValue('autoApprove');
    if (!hasAutoApproveSupport && autoApprove) {
      form.setFieldValue('autoApprove', false);
    }
  }, [hasAutoApproveSupport, form]);

  // ---------------------------------------------------------------------------
  // Auto-generate name from context (prompt / linked issue) with debounce
  // ---------------------------------------------------------------------------
  const initialPromptValue = useStore(form.store, (s) => s.values.initialPrompt);

  const generatedTaskName = useMemo(() => {
    return generateTaskNameFromContext({
      initialPrompt: initialPromptValue || null,
      linearIssue: linkedLinearIssue as LinearIssueSummary | null,
      githubIssue: linkedGithubIssue as GitHubIssueSummary | null,
      jiraIssue: linkedJiraIssue as JiraIssueSummary | null,
    });
  }, [initialPromptValue, linkedLinearIssue, linkedGithubIssue, linkedJiraIssue]);

  // ---------------------------------------------------------------------------
  // Derived branch value for display
  // ---------------------------------------------------------------------------
  const baseRefValue = useStore(form.store, (s) => s.values.baseRef);

  return (
    <DialogContent
      className="max-h-[calc(100vh-48px)] max-w-md overflow-visible"
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>New Task</DialogTitle>
        <DialogDescription className="text-xs">
          Create a task and open the agent workspace.
        </DialogDescription>
        <div className="space-y-1 pt-1">
          <p className="text-sm font-medium text-foreground">{selectedProject?.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">from</span>
            {branchOptions.length > 0 ? (
              <BranchSelect
                value={baseRefValue}
                onValueChange={handleBranchChange}
                options={branchOptions}
                isLoading={isLoadingBranches}
                variant="ghost"
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {isLoadingBranches ? 'Loading...' : baseRefValue || defaultBranch}
              </span>
            )}
          </div>
        </div>
      </DialogHeader>

      <Separator />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        {/* Task name */}
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => {
              const normalized = normalizeTaskName(value);
              if (!normalized) return undefined;
              if (normalized.length > MAX_TASK_NAME_LENGTH)
                return `Task name is too long (max ${MAX_TASK_NAME_LENGTH} characters).`;
              if (normalizedExisting.includes(normalized))
                return 'A Task with this name already exists.';
              return undefined;
            },
          }}
        >
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            const errorMessage = field.state.meta.errors[0];
            return (
              <div>
                <Label htmlFor="task-name" className="mb-2 block">
                  Task name (optional)
                </Label>
                <SlugInput
                  autoFocus
                  id="task-name"
                  value={field.state.value}
                  onChange={(val) => {
                    field.handleChange(val);
                  }}
                  onBlur={field.handleBlur}
                  placeholder="refactor-api-routes"
                  maxLength={MAX_TASK_NAME_LENGTH}
                  className={`w-full ${isInvalid ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive' : ''}`}
                  aria-invalid={isInvalid}
                />
                {isInvalid && errorMessage && (
                  <p className="mt-1 text-xs text-destructive">{String(errorMessage)}</p>
                )}
              </div>
            );
          }}
        </form.Field>

        {/* Agent */}
        <form.Field name="agentRuns">
          {(field) => (
            <div className="flex items-center gap-4">
              <Label className="shrink-0">Agent</Label>
              <MultiAgentDropdown
                agentRuns={field.state.value as AgentRun[]}
                onChange={(runs) => field.handleChange(runs)}
              />
            </div>
          )}
        </form.Field>

        {/* Advanced options */}
        <Accordion
          type="single"
          collapsible
          value={showAdvanced ? 'advanced' : undefined}
          className="space-y-2"
        >
          <AccordionItem value="advanced" className="border-none">
            <AccordionTrigger
              className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border-none bg-muted px-3 text-sm font-medium text-foreground hover:bg-accent hover:no-underline [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0"
              onPointerDown={(e) => {
                e.preventDefault();
                const wasClosed = !showAdvanced;
                setShowAdvanced((prev) => !prev);
                if (wasClosed) {
                  void (async () => {
                    const { captureTelemetry } = await import('../lib/telemetryClient');
                    captureTelemetry('task_advanced_options_opened');
                  })();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const wasClosed = !showAdvanced;
                  setShowAdvanced((prev) => !prev);
                  if (wasClosed) {
                    void (async () => {
                      const { captureTelemetry } = await import('../lib/telemetryClient');
                      captureTelemetry('task_advanced_options_opened');
                    })();
                  }
                }
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span>Advanced options</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 overflow-hidden px-0 pt-2" id="task-advanced">
              <div className="flex flex-col gap-4 p-2">
                {/* Worktree */}
                <form.Field name="useWorktree">
                  {(field) => (
                    <div className="flex items-center gap-4">
                      <Label className="w-32 shrink-0">Run in worktree</Label>
                      <div className="min-w-0 flex-1">
                        <label className="inline-flex cursor-pointer items-start gap-2 text-sm leading-tight">
                          <Checkbox
                            checked={field.state.value}
                            onCheckedChange={(checked) => field.handleChange(checked === true)}
                            className="mt-[1px]"
                          />
                          <div className="space-y-1">
                            <span className="text-muted-foreground">
                              {field.state.value
                                ? 'Create isolated Git worktree (recommended)'
                                : 'Work directly on current branch'}
                            </span>
                            {!field.state.value && (
                              <p className="text-xs text-destructive">
                                ⚠️ Changes will affect your current working directory
                              </p>
                            )}
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </form.Field>

                {/* Auto-approve */}
                {hasAutoApproveSupport && (
                  <form.Field name="autoApprove">
                    {(field) => (
                      <div className="flex items-center gap-4">
                        <Label className="w-32 shrink-0">Auto-approve</Label>
                        <div className="min-w-0 flex-1">
                          <label className="inline-flex cursor-pointer items-start gap-2 text-sm leading-tight">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) => field.handleChange(checked === true)}
                              className="mt-[1px]"
                            />
                            <div className="space-y-1">
                              <span className="text-muted-foreground">
                                Skip permissions for file operations
                              </span>
                              <a
                                href="https://simonwillison.net/2025/Oct/22/living-dangerously-with-claude/"
                                target="_blank"
                                rel="noreferrer noopener"
                                className="ml-1 inline-flex items-center gap-1 text-foreground underline"
                              >
                                Explanation
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              </a>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </form.Field>
                )}
              </div>

              {/* Initial prompt */}
              <form.Field name="initialPrompt">
                {(field) => (
                  <div className="flex items-start gap-4 p-2">
                    <Label htmlFor="initial-prompt" className="w-32 shrink-0">
                      Initial prompt
                    </Label>
                    <div className="min-w-0 flex-1">
                      <Textarea
                        id="initial-prompt"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        disabled={!hasInitialPromptSupport}
                        placeholder={getInitialPromptPlaceholder()}
                        className="resize-none"
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </form.Field>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <DialogFooter>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button type="submit" disabled={!canSubmit}>
                Create
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
