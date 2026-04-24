import {
  FileText,
  GitPullRequest,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import React from 'react';
import {
  TRIGGER_INTEGRATION_MAP,
  type CreateAutomationInput,
  type DayOfWeek,
  type TriggerType,
} from '@shared/automations/types';
import { ISSUE_PROVIDER_META } from '@renderer/features/integrations/issue-provider-meta';
import { useTheme } from '@renderer/lib/hooks/useTheme';
import { Button } from '@renderer/lib/ui/button';

type LogoKind =
  | { kind: 'image'; src: string; alt: string; invertInDark?: boolean }
  | { kind: 'icon'; Icon: LucideIcon }
  | { kind: 'emoji'; emoji: string };

function providerLogo(triggerType: TriggerType): LogoKind {
  const providerId = TRIGGER_INTEGRATION_MAP[triggerType];
  const meta = ISSUE_PROVIDER_META[providerId];
  return {
    kind: 'image',
    src: meta.logo,
    alt: meta.displayName,
    invertInDark: meta.invertInDark,
  };
}

export type AutomationTemplate = {
  id: string;
  title: string;
  description: string;
  logo: LogoKind;
  tags: string[];
  /** Partial input used to pre-fill the create form (projectId is left empty for the user to pick). */
  seed: Omit<CreateAutomationInput, 'projectId'>;
};

const DEFAULT_AGENT = 'claude';

function dailyAt(hour: number, minute = 0): CreateAutomationInput['schedule'] {
  return { type: 'daily', hour, minute };
}

function weeklyAt(
  dayOfWeek: DayOfWeek,
  hour: number,
  minute = 0
): CreateAutomationInput['schedule'] {
  return { type: 'weekly', dayOfWeek, hour, minute };
}

function triggerSeed(
  name: string,
  triggerType: TriggerType,
  prompt: string
): AutomationTemplate['seed'] {
  return {
    name,
    prompt,
    agentId: DEFAULT_AGENT,
    mode: 'trigger',
    triggerType,
    useWorktree: true,
  };
}

function scheduleSeed(
  name: string,
  schedule: CreateAutomationInput['schedule'],
  prompt: string
): AutomationTemplate['seed'] {
  return {
    name,
    prompt,
    agentId: DEFAULT_AGENT,
    mode: 'schedule',
    schedule,
    useWorktree: true,
  };
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // Event-driven — issue triggers
  {
    id: 'triage-github-issues',
    title: 'GitHub Issue Triage',
    description:
      'Auto-triage new GitHub issues: suggest labels, flag missing info, and open quick-fix PRs when obvious.',
    logo: providerLogo('github_issue'),
    tags: ['Event'],
    seed: triggerSeed(
      'GitHub Issue Triage',
      'github_issue',
      'A new GitHub issue was just opened. Read it, understand what it reports, and post a short triage comment: suggest 2–3 labels (bug/feature/question/priority), flag anything missing, and if a quick fix is obvious, open a PR.'
    ),
  },
  {
    id: 'linear-autostart',
    title: 'Linear Issue Autostart',
    description:
      'Start work on new Linear tickets automatically: read, reproduce, locate root cause, and draft a fix.',
    logo: providerLogo('linear_issue'),
    tags: ['Event'],
    seed: triggerSeed(
      'Linear Issue Autostart',
      'linear_issue',
      'A new Linear ticket was just created. Read the description, reproduce if possible, locate the likely root cause in the code, and draft a fix or detailed investigation notes.'
    ),
  },
  {
    id: 'jira-autostart',
    title: 'Jira Ticket Autostart',
    description:
      'Start work on new Jira tickets automatically: gather context and begin draft implementation.',
    logo: providerLogo('jira_issue'),
    tags: ['Event'],
    seed: triggerSeed(
      'Jira Ticket Autostart',
      'jira_issue',
      'A new Jira ticket was created. Read the description, gather context from the codebase, and start a draft implementation or investigation.'
    ),
  },
  {
    id: 'gitlab-issue-worker',
    title: 'GitLab Issue Worker',
    description:
      'Start work on new GitLab issues automatically: understand the request and open a first-pass MR.',
    logo: providerLogo('gitlab_issue'),
    tags: ['Event'],
    seed: triggerSeed(
      'GitLab Issue Worker',
      'gitlab_issue',
      'A new GitLab issue was created. Read it, understand the request, and open an MR with a first-pass implementation or detailed notes.'
    ),
  },
  {
    id: 'forgejo-issue-worker',
    title: 'Forgejo Issue Worker',
    description:
      'Start work on new Forgejo issues automatically: locate relevant code and draft a fix.',
    logo: providerLogo('forgejo_issue'),
    tags: ['Event'],
    seed: triggerSeed(
      'Forgejo Issue Worker',
      'forgejo_issue',
      'A new Forgejo issue was created. Read the description, locate the relevant code, and draft a fix or investigation.'
    ),
  },
  {
    id: 'support-thread-helper',
    title: 'Support Thread Helper',
    description:
      'Auto-respond to support threads: read the message, look up context, and draft a helpful reply.',
    logo: providerLogo('plain_thread'),
    tags: ['Event'],
    seed: triggerSeed(
      'Support Thread Helper',
      'plain_thread',
      'A new support thread was opened. Read the customer message, look up context in the codebase and docs, and draft a helpful reply with concrete next steps.'
    ),
  },
  // Daily
  {
    id: 'daily-pr-review-assistant',
    title: 'Daily PR review assistant',
    description:
      'Review all open PRs daily: summarize each one, flag risky changes, and suggest reviewers.',
    logo: { kind: 'icon', Icon: GitPullRequest },
    tags: ['Daily'],
    seed: scheduleSeed(
      'Daily PR review assistant',
      dailyAt(10),
      'Review all open pull requests for this project. Summarize each one, flag high-risk changes, note missing tests or docs, and suggest reviewers if needed.'
    ),
  },
  // Weekly
  {
    id: 'weekly-tidy',
    title: 'Weekly repo tidy',
    description:
      'Run linters and formatters, remove dead code, and open a cleanup PR with a summary of changes.',
    logo: { kind: 'icon', Icon: Sparkles },
    tags: ['Weekly'],
    seed: scheduleSeed(
      'Weekly repo tidy',
      weeklyAt('fri', 16),
      'Tidy this repository: run the linter and formatter, fix anything safe, remove obviously dead code, and open a cleanup PR summarizing the changes.'
    ),
  },
  {
    id: 'weekly-security-audit',
    title: 'Weekly security audit',
    description:
      'Scan for leaked secrets, known vulnerabilities, insecure configs, and overly broad permissions.',
    logo: { kind: 'icon', Icon: ShieldCheck },
    tags: ['Weekly'],
    seed: scheduleSeed(
      'Weekly security audit',
      weeklyAt('mon', 9),
      'Run a security audit on this project: scan for leaked secrets, known vulnerabilities in dependencies, insecure configs, and overly broad permissions. Open issues for anything critical.'
    ),
  },
  {
    id: 'weekly-changelog-draft',
    title: 'Weekly changelog draft',
    description:
      'Draft release notes from merged PRs since the last release; categorize and prepare a release PR.',
    logo: { kind: 'icon', Icon: FileText },
    tags: ['Weekly'],
    seed: scheduleSeed(
      'Weekly changelog draft',
      weeklyAt('thu', 11),
      'Draft a changelog entry for this project from merged PRs since the last release. Categorize changes (features, fixes, breaking), write user-facing descriptions, and prepare a release PR.'
    ),
  },
  {
    id: 'dead-code-hunter',
    title: 'Dead code hunter',
    description: 'Find unused exports, functions, files, and dependencies; propose a cleanup PR.',
    logo: { kind: 'icon', Icon: Trash2 },
    tags: ['Weekly'],
    seed: scheduleSeed(
      'Dead code hunter',
      weeklyAt('fri', 11),
      'Hunt for dead code in this project: unused exports, unreferenced functions, orphaned files, and redundant dependencies. Verify each finding is truly safe to remove and propose a cleanup PR.'
    ),
  },
];

type Props = {
  onPick: (template: AutomationTemplate) => void;
};

export const AutomationTemplates: React.FC<Props> = ({ onPick }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">
          All Templates
        </h2>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
        >
          {AUTOMATION_TEMPLATES.map((template) => (
            <TemplateCard key={template.id} template={template} onPick={onPick} />
          ))}
        </div>
      </div>
    </div>
  );
};

function TemplateLogo({ logo }: { logo: LogoKind }) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'emdark';
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background">
      {logo.kind === 'image' ? (
        <img
          src={logo.src}
          alt={logo.alt}
          className={`h-4 w-4 ${logo.invertInDark && isDark ? 'invert' : ''}`}
        />
      ) : logo.kind === 'icon' ? (
        <logo.Icon className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <span className="text-base leading-none">{logo.emoji}</span>
      )}
    </div>
  );
}

export function TemplateCard({
  template,
  onPick,
}: {
  template: AutomationTemplate;
  onPick: (template: AutomationTemplate) => void;
}) {
  const pick = () => onPick(template);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      }}
      className="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg bg-muted/20 px-2.5 py-2 text-left shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.06),0_1px_2px_rgb(0_0_0/0.3)] hover:bg-muted/40 hover:shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_4px_12px_rgb(0_0_0/0.08)] dark:hover:shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_4px_12px_rgb(0_0_0/0.4)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [transition-property:background-color,box-shadow,transform] [transition-duration:150ms,150ms,120ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]"
    >
      <TemplateLogo logo={template.logo} />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate text-xs font-medium text-foreground">{template.title}</h3>
        <p className="truncate text-[11px] text-muted-foreground">{template.description}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 translate-x-1 opacity-0 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          pick();
        }}
        aria-label={`Use ${template.title} template`}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
