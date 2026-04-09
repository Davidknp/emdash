import { Bug, FileText, Gauge, Plus, Search, Shield, SlidersHorizontal } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { AutomationMode, TriggerType } from '@shared/automations/types';
import forgejoSvg from '../../../assets/images/Forgejo.svg?raw';
import githubPng from '../../../assets/images/github.png';
import gitlabSvg from '../../../assets/images/GitLab.svg?raw';
import jiraSvg from '../../../assets/images/Jira.svg?raw';
import linearSvg from '../../../assets/images/Linear.svg?raw';
import plainSvg from '../../../assets/images/Plain.svg?raw';
import sentrySvg from '../../../assets/images/Sentry.svg?raw';
import {
  Dialog,
  DialogContent,
  DialogContentArea,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';

const GitHubIcon: React.FC<{ className?: string }> = ({ className }) => (
  <img src={githubPng} alt="" className={`dark:invert ${className ?? 'h-5 w-5'}`} />
);

const LinearIcon: React.FC<{ className?: string }> = ({ className }) => (
  <span
    className={`inline-flex items-center justify-center dark:invert ${className ?? 'h-5 w-5'}`}
    dangerouslySetInnerHTML={{
      __html: linearSvg.replace(/width="200" height="200"/, 'width="100%" height="100%"'),
    }}
  />
);

const SvgIcon: React.FC<{ raw: string; className?: string }> = ({ raw, className }) => (
  <span
    className={`inline-flex items-center justify-center dark:invert [&_svg]:h-full [&_svg]:w-full ${className ?? 'h-5 w-5'}`}
    dangerouslySetInnerHTML={{ __html: raw }}
  />
);

const SentryIcon: React.FC<{ className?: string }> = ({ className }) => (
  <SvgIcon raw={sentrySvg} className={className} />
);

type TemplateCategory =
  | 'Code Review'
  | 'CI/CD'
  | 'Issue Tracking'
  | 'Monitoring'
  | 'Support'
  | 'Security'
  | 'Performance'
  | 'Docs'
  | 'Quality';

interface ExampleAutomation {
  icon: React.ReactNode;
  name: string;
  prompt: string;
  description: string;
  mode: AutomationMode;
  triggerType?: TriggerType;
  category: TemplateCategory;
}

const TRIGGER_EXAMPLES: ExampleAutomation[] = [
  {
    icon: <GitHubIcon />,
    name: 'PR Code Review',
    prompt:
      'Review the pull request changes for code quality, potential bugs, security issues, and adherence to project conventions. Provide actionable feedback.',
    description: 'Auto-review new pull requests',
    mode: 'trigger',
    triggerType: 'github_pr',
    category: 'Code Review',
  },
  {
    icon: <GitHubIcon />,
    name: 'Address PR Comments',
    prompt:
      'Read the PR review comments and address each piece of feedback. Make the requested code changes and explain what was updated.',
    description: 'Fix PR review feedback automatically',
    mode: 'trigger',
    triggerType: 'github_pr',
    category: 'Code Review',
  },
  {
    icon: <GitHubIcon />,
    name: 'Fix CI Failures',
    prompt:
      'Investigate the CI failure on this pull request. Analyze the error logs, identify the root cause, and push a fix.',
    description: 'Debug and fix failing CI',
    mode: 'trigger',
    triggerType: 'github_pr',
    category: 'CI/CD',
  },
  {
    icon: <GitHubIcon />,
    name: 'Auto Fix CI',
    prompt:
      'The CI pipeline on this pull request is failing due to formatting or linting errors. Run the formatter and linter with auto-fix enabled (e.g. prettier --write, eslint --fix), then commit and push the changes so CI passes.',
    description: 'Auto-fix formatting & lint errors',
    mode: 'trigger',
    triggerType: 'github_pr',
    category: 'CI/CD',
  },
  {
    icon: <LinearIcon />,
    name: 'Linear Issue Autostart',
    prompt:
      'Read the Linear issue description and implement the requested changes. Follow project conventions and create a PR when done.',
    description: 'Start work on new Linear tickets',
    mode: 'trigger',
    triggerType: 'linear_issue',
    category: 'Issue Tracking',
  },
  {
    icon: <GitHubIcon />,
    name: 'GitHub Issue Triage',
    prompt:
      'Analyze the new GitHub issue and attempt to reproduce or locate the bug. Add a comment with findings and a suggested fix if possible.',
    description: 'Auto-triage new GitHub issues',
    mode: 'trigger',
    triggerType: 'github_issue',
    category: 'Issue Tracking',
  },
  {
    icon: <SvgIcon raw={jiraSvg} />,
    name: 'Jira Ticket Autostart',
    prompt:
      'Read the Jira ticket description and acceptance criteria. Implement the requested changes following project conventions and create a PR when done.',
    description: 'Start work on new Jira tickets',
    mode: 'trigger',
    triggerType: 'jira_issue',
    category: 'Issue Tracking',
  },
  {
    icon: <SvgIcon raw={gitlabSvg} />,
    name: 'GitLab Issue Worker',
    prompt:
      'Read the GitLab issue description and implement the requested changes. Follow project conventions and create a merge request when done.',
    description: 'Start work on new GitLab issues',
    mode: 'trigger',
    triggerType: 'gitlab_issue',
    category: 'Issue Tracking',
  },
  {
    icon: <SvgIcon raw={gitlabSvg} />,
    name: 'GitLab MR Review',
    prompt:
      'Review the merge request changes for code quality, potential bugs, security issues, and adherence to project conventions. Provide actionable feedback.',
    description: 'Auto-review new merge requests',
    mode: 'trigger',
    triggerType: 'gitlab_mr',
    category: 'Code Review',
  },
  {
    icon: <SvgIcon raw={forgejoSvg} />,
    name: 'Forgejo Issue Worker',
    prompt:
      'Read the Forgejo issue description and implement the requested changes. Follow project conventions and create a pull request when done.',
    description: 'Start work on new Forgejo issues',
    mode: 'trigger',
    triggerType: 'forgejo_issue',
    category: 'Issue Tracking',
  },
  {
    icon: <SvgIcon raw={plainSvg} />,
    name: 'Support Thread Helper',
    prompt:
      'Analyze the new support thread. Research the issue in the codebase, identify the root cause, and draft a helpful response with a fix or workaround.',
    description: 'Auto-respond to support threads',
    mode: 'trigger',
    triggerType: 'plain_thread',
    category: 'Support',
  },
  {
    icon: <SentryIcon />,
    name: 'Fix Sentry Errors',
    prompt:
      'A new unresolved error was reported in Sentry. Analyze the error details including the stack trace, exception type, and affected file. Locate the root cause in the codebase, implement a fix, add a regression test if possible, and create a PR with a clear description of what caused the issue and how the fix addresses it.',
    description: 'Auto-fix new Sentry errors',
    mode: 'trigger',
    triggerType: 'sentry_issue',
    category: 'Monitoring',
  },
  {
    icon: <SentryIcon />,
    name: 'Sentry Error Triage',
    prompt:
      'A new error appeared in Sentry. Analyze the error, stack trace, and frequency. Investigate the codebase to understand the root cause. Add a detailed comment to the issue with your findings: affected code paths, potential impact, reproduction steps if identifiable, and a suggested fix approach.',
    description: 'Triage & analyze new errors',
    mode: 'trigger',
    triggerType: 'sentry_issue',
    category: 'Monitoring',
  },
];

const SCHEDULE_EXAMPLES: ExampleAutomation[] = [
  {
    icon: <GitHubIcon />,
    name: 'Daily code review',
    prompt:
      'Review all uncommitted changes and open PRs. Leave comments on code quality issues, potential bugs, and suggest improvements.',
    description: 'Review changes & PRs daily',
    mode: 'schedule',
    category: 'Code Review',
  },
  {
    icon: <Bug className="h-5 w-5" />,
    name: 'Bug scan',
    prompt:
      'Scan the codebase for common bugs, anti-patterns, and potential runtime errors. Report findings with file paths and suggested fixes.',
    description: 'Find bugs & anti-patterns',
    mode: 'schedule',
    category: 'Quality',
  },
  {
    icon: <Shield className="h-5 w-5" />,
    name: 'Security audit',
    prompt:
      'Check for security vulnerabilities including exposed secrets, SQL injection risks, XSS vulnerabilities, and outdated dependencies with known CVEs.',
    description: 'Check for vulnerabilities',
    mode: 'schedule',
    category: 'Security',
  },
  {
    icon: <Gauge className="h-5 w-5" />,
    name: 'Performance scan',
    prompt:
      'Analyze the codebase for performance bottlenecks, memory leaks, unnecessary re-renders, and slow database queries. Suggest optimizations.',
    description: 'Find performance issues',
    mode: 'schedule',
    category: 'Performance',
  },
  {
    icon: <FileText className="h-5 w-5" />,
    name: 'Doc coverage check',
    prompt:
      'Check for undocumented public APIs, missing README sections, and outdated documentation. Generate missing docs where appropriate.',
    description: 'Ensure docs are up to date',
    mode: 'schedule',
    category: 'Docs',
  },
  {
    icon: <Search className="h-5 w-5" />,
    name: 'Dependency updates',
    prompt:
      'Check for outdated dependencies and create a summary of available updates. Highlight breaking changes and security patches.',
    description: 'Track outdated packages',
    mode: 'schedule',
    category: 'Quality',
  },
];

export interface ExampleAutomationsProps {
  onSelect: (
    name: string,
    prompt: string,
    mode?: AutomationMode,
    triggerType?: TriggerType
  ) => void;
  showEmptyMessage?: boolean;
}

const TemplateCard: React.FC<{
  example: ExampleAutomation;
  onSelect: ExampleAutomationsProps['onSelect'];
}> = ({ example, onSelect }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={() => onSelect(example.name, example.prompt, example.mode, example.triggerType)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(example.name, example.prompt, example.mode, example.triggerType);
      }
    }}
    className="group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/20 p-4 text-left transition-all hover:bg-muted/40 hover:shadow-md"
  >
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground">
      {example.icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-foreground/80 group-hover:text-foreground">
        {example.name}
      </p>
      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{example.description}</p>
    </div>
    <div className="flex-shrink-0 self-center">
      <span className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Plus className="h-4 w-4" />
      </span>
    </div>
  </div>
);

const ALL_TEMPLATES: ExampleAutomation[] = [...TRIGGER_EXAMPLES, ...SCHEDULE_EXAMPLES];

const BrowseCard: React.FC<{
  example: ExampleAutomation;
  onSelect: ExampleAutomationsProps['onSelect'];
}> = ({ example, onSelect }) => {
  const handleSelect = () =>
    onSelect(example.name, example.prompt, example.mode, example.triggerType);
  return (
    <button
      type="button"
      onClick={handleSelect}
      className="group flex h-full flex-col items-start gap-3 rounded-lg border border-border bg-muted/20 p-4 text-left transition-colors hover:bg-muted/40"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted/40 text-muted-foreground/70 transition-colors group-hover:text-muted-foreground [&_img]:h-5 [&_img]:w-5 [&_span]:h-5 [&_span]:w-5 [&_svg]:h-5 [&_svg]:w-5">
        {example.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground/80 group-hover:text-foreground">
          {example.name}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
          {example.description}
        </p>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {example.category}
      </span>
    </button>
  );
};

export const TemplatesDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: ExampleAutomationsProps['onSelect'];
}> = ({ open, onOpenChange, onSelect }) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'All'>('All');

  const handleSelect: ExampleAutomationsProps['onSelect'] = (name, prompt, mode, triggerType) => {
    onSelect(name, prompt, mode, triggerType);
    onOpenChange(false);
  };

  const categories = useMemo(() => {
    const set = new Set<TemplateCategory>();
    ALL_TEMPLATES.forEach((t) => set.add(t.category));
    return Array.from(set);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_TEMPLATES.filter((t) => {
      if (activeCategory !== 'All' && t.category !== activeCategory) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [query, activeCategory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-h-[90vh] w-[95vw] sm:max-w-[1200px]">
        <DialogHeader>
          <div className="flex flex-col gap-1">
            <DialogTitle>Browse Templates</DialogTitle>
            <DialogDescription className="text-xs">
              Pick a template to get started quickly. You can customize it after.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Category chips + search */}
        <div className="flex flex-col gap-3 px-6 pb-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveCategory('All')}
              className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                activeCategory === 'All'
                  ? 'border-foreground/30 bg-muted text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                  activeCategory === cat
                    ? 'border-foreground/30 bg-muted text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <Plus className="h-3 w-3 opacity-60" />
                {cat}
              </button>
            ))}
          </div>
          <div className="relative flex-shrink-0 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates…"
              className="h-8 pl-8 pr-8 text-xs"
            />
            <SlidersHorizontal className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <DialogContentArea className="min-h-0 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
              No templates match your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((example) => (
                <BrowseCard key={example.name} example={example} onSelect={handleSelect} />
              ))}
            </div>
          )}
        </DialogContentArea>
      </DialogContent>
    </Dialog>
  );
};

const ExampleAutomations: React.FC<ExampleAutomationsProps> = ({
  onSelect,
  showEmptyMessage = true,
}) => {
  return (
    <div className="py-4">
      {showEmptyMessage && (
        <div className="mb-6 text-center">
          <p className="text-xs text-muted-foreground/60">
            No automations yet. Start with a template or create your own.
          </p>
        </div>
      )}

      <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">
        Event Triggers
      </h2>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TRIGGER_EXAMPLES.map((example) => (
          <TemplateCard key={example.name} example={example} onSelect={onSelect} />
        ))}
      </div>

      <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">Scheduled</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SCHEDULE_EXAMPLES.map((example) => (
          <TemplateCard key={example.name} example={example} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
};

export default ExampleAutomations;
