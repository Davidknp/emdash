import { Clock, LineChart, Plus, Sparkles, type LucideIcon } from 'lucide-react';
import React from 'react';
import type { CreateAutomationInput, ScheduleType, TriggerType } from '@shared/automations/types';
import { ISSUE_PROVIDER_META } from '@renderer/features/integrations/issue-provider-meta';
import { Button } from '@renderer/lib/ui/button';

type LogoKind =
  | { kind: 'image'; src: string; alt: string; invertInDark?: boolean }
  | { kind: 'icon'; Icon: LucideIcon };

export type AutomationTemplate = {
  id: string;
  title: string;
  description: string;
  logo: LogoKind;
  category: 'event' | 'scheduled';
  /** Partial input used to pre-fill the create form (projectId is left empty for the user to pick). */
  seed: Omit<CreateAutomationInput, 'projectId'>;
};

const DEFAULT_AGENT = 'claude';

function dailyAt(hour: number, minute = 0) {
  return { type: 'daily' as ScheduleType, hour, minute };
}

function weeklyAt(dayOfWeek: 'mon' | 'fri', hour: number, minute = 0) {
  return { type: 'weekly' as ScheduleType, dayOfWeek, hour, minute };
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
    schedule: dailyAt(9),
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

const githubLogo: LogoKind = {
  kind: 'image',
  src: ISSUE_PROVIDER_META.github.logo,
  alt: 'GitHub',
  invertInDark: true,
};
const linearLogo: LogoKind = {
  kind: 'image',
  src: ISSUE_PROVIDER_META.linear.logo,
  alt: 'Linear',
  invertInDark: true,
};
const jiraLogo: LogoKind = { kind: 'image', src: ISSUE_PROVIDER_META.jira.logo, alt: 'Jira' };
const gitlabLogo: LogoKind = {
  kind: 'image',
  src: ISSUE_PROVIDER_META.gitlab.logo,
  alt: 'GitLab',
};
const forgejoLogo: LogoKind = {
  kind: 'image',
  src: ISSUE_PROVIDER_META.forgejo.logo,
  alt: 'Forgejo',
};
const plainLogo: LogoKind = {
  kind: 'image',
  src: ISSUE_PROVIDER_META.plain.logo,
  alt: 'Plain',
  invertInDark: true,
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'triage-github-issues',
    title: 'GitHub Issue Triage',
    description: 'Auto-triage new GitHub issues',
    logo: githubLogo,
    category: 'event',
    seed: triggerSeed(
      'GitHub Issue Triage',
      'github_issue',
      'A new GitHub issue was just opened. Read it, understand what it reports, and post a short triage comment: suggest 2–3 labels (bug/feature/question/priority), flag anything missing, and if a quick fix is obvious, open a PR.'
    ),
  },
  {
    id: 'linear-autostart',
    title: 'Linear Issue Autostart',
    description: 'Start work on new Linear tickets',
    logo: linearLogo,
    category: 'event',
    seed: triggerSeed(
      'Linear Issue Autostart',
      'linear_issue',
      'A new Linear ticket was just created. Read the description, reproduce if possible, locate the likely root cause in the code, and draft a fix or detailed investigation notes.'
    ),
  },
  {
    id: 'jira-autostart',
    title: 'Jira Ticket Autostart',
    description: 'Start work on new Jira tickets',
    logo: jiraLogo,
    category: 'event',
    seed: triggerSeed(
      'Jira Ticket Autostart',
      'jira_issue',
      'A new Jira ticket was created. Read the description, gather context from the codebase, and start a draft implementation or investigation.'
    ),
  },
  {
    id: 'gitlab-issue-worker',
    title: 'GitLab Issue Worker',
    description: 'Start work on new GitLab issues',
    logo: gitlabLogo,
    category: 'event',
    seed: triggerSeed(
      'GitLab Issue Worker',
      'gitlab_issue',
      'A new GitLab issue was created. Read it, understand the request, and open an MR with a first-pass implementation or detailed notes.'
    ),
  },
  {
    id: 'forgejo-issue-worker',
    title: 'Forgejo Issue Worker',
    description: 'Start work on new Forgejo issues',
    logo: forgejoLogo,
    category: 'event',
    seed: triggerSeed(
      'Forgejo Issue Worker',
      'forgejo_issue',
      'A new Forgejo issue was created. Read the description, locate the relevant code, and draft a fix or investigation.'
    ),
  },
  {
    id: 'support-thread-helper',
    title: 'Support Thread Helper',
    description: 'Auto-respond to support threads',
    logo: plainLogo,
    category: 'event',
    seed: triggerSeed(
      'Support Thread Helper',
      'plain_thread',
      'A new support thread was opened. Read the customer message, look up context in the codebase and docs, and draft a helpful reply with concrete next steps.'
    ),
  },
  {
    id: 'daily-dependency-check',
    title: 'Daily dependency check',
    description: 'Scan outdated packages every morning',
    logo: { kind: 'icon', Icon: Clock },
    category: 'scheduled',
    seed: scheduleSeed(
      'Daily dependency check',
      dailyAt(9),
      'Check for outdated dependencies in this project. Identify anything out-of-date, note major-version bumps requiring manual review, and open a PR bumping safe minor/patch updates.'
    ),
  },
  {
    id: 'weekly-test-coverage',
    title: 'Weekly coverage review',
    description: 'Find untested paths and add tests',
    logo: { kind: 'icon', Icon: LineChart },
    category: 'scheduled',
    seed: scheduleSeed(
      'Weekly coverage review',
      weeklyAt('mon', 10),
      'Review the test coverage for this project. Find the most important uncovered code paths, rank them by risk, and add tests for the top 3 this week.'
    ),
  },
  {
    id: 'weekly-tidy',
    title: 'Weekly repo tidy',
    description: 'Run linters and open a cleanup PR',
    logo: { kind: 'icon', Icon: Sparkles },
    category: 'scheduled',
    seed: scheduleSeed(
      'Weekly repo tidy',
      weeklyAt('fri', 16),
      'Tidy this repository: run the linter and formatter, fix anything safe, remove obviously dead code, and open a cleanup PR summarizing the changes.'
    ),
  },
];

type Props = {
  onPick: (template: AutomationTemplate) => void;
};

export const AutomationTemplates: React.FC<Props> = ({ onPick }) => {
  const eventTemplates = AUTOMATION_TEMPLATES.filter((t) => t.category === 'event');
  const scheduledTemplates = AUTOMATION_TEMPLATES.filter((t) => t.category === 'scheduled');

  return (
    <div className="space-y-6">
      <TemplateSection label="Event Triggers" templates={eventTemplates} onPick={onPick} />
      <TemplateSection label="Scheduled" templates={scheduledTemplates} onPick={onPick} />
    </div>
  );
};

function TemplateSection({
  label,
  templates,
  onPick,
}: {
  label: string;
  templates: AutomationTemplate[];
  onPick: (template: AutomationTemplate) => void;
}) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">{label}</h2>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function TemplateLogo({ logo }: { logo: LogoKind }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background">
      {logo.kind === 'image' ? (
        <img
          src={logo.src}
          alt={logo.alt}
          className={`h-4 w-4 ${logo.invertInDark ? 'dark:invert' : ''}`}
        />
      ) : (
        <logo.Icon className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </div>
  );
}

function TemplateCard({
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
      className="group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      <TemplateLogo logo={template.logo} />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate text-sm font-medium text-foreground">{template.title}</h3>
        <p className="truncate text-xs text-muted-foreground">{template.description}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          pick();
        }}
        aria-label={`Use ${template.title} template`}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
