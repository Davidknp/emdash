import { ExternalLink } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AGENT_PROVIDERS } from '@shared/agent-provider-registry';
import { rpc } from '@renderer/lib/ipc';
import { SearchInput } from '@renderer/lib/ui/search-input';
import { Separator } from '@renderer/lib/ui/separator';
import { cn } from '@renderer/utils/utils';
import { AccountTab } from './AccountTab';
import { CliAgentsList } from './CliAgentsList';
import DefaultAgentSettingsCard from './DefaultAgentSettingsCard';
import HiddenToolsSettingsCard from './HiddenToolsSettingsCard';
import IntegrationsCard from './IntegrationsCard';
import KeyboardSettingsCard from './KeyboardSettingsCard';
import NotificationSettingsCard from './NotificationSettingsCard';
import RepositorySettingsCard from './RepositorySettingsCard';
import { ReviewPromptResetButton, ReviewPromptSettingsCard } from './ReviewPromptSettingsCard';
import {
  AutoApproveByDefaultRow,
  AutoGenerateTaskNamesRow,
  AutoTrustWorktreesRow,
} from './TaskSettingsRows';
import TelemetryCard from './TelemetryCard';
import TerminalSettingsCard from './TerminalSettingsCard';
import ThemeCard from './ThemeCard';
import { UpdateCard } from './UpdateCard';

export type SettingsPageTab =
  | 'general'
  | 'account'
  | 'clis-models'
  | 'integrations'
  | 'repository'
  | 'interface'
  | 'docs';

interface SectionConfig {
  id: string;
  title?: string;
  action?: React.ReactNode;
  component: React.ReactNode;
  keywords: string;
}

interface TabContent {
  title: string;
  description: string;
  sections: SectionConfig[];
  keywords: string;
}

export function SettingsPage({
  tab: activeTab,
  onTabChange,
}: {
  tab: SettingsPageTab;
  onTabChange: (tab: SettingsPageTab) => void;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  const handleDocsClick = useCallback(() => {
    rpc.app.openExternal('https://docs.emdash.sh');
  }, []);

  const tabs: Array<{
    id: SettingsPageTab;
    label: string;
    isExternal?: boolean;
  }> = [
    { id: 'general', label: 'General' },
    { id: 'account', label: 'Account' },
    { id: 'clis-models', label: 'Agents' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'repository', label: 'Repository' },
    { id: 'interface', label: 'Interface' },
    { id: 'docs', label: 'Docs', isExternal: true },
  ];

  const agentKeywords = useMemo(
    () =>
      AGENT_PROVIDERS.map((p) => `${p.id} ${p.name}`)
        .join(' ')
        .toLowerCase(),
    []
  );

  const tabContent: Record<Exclude<SettingsPageTab, 'docs'>, TabContent> = {
    general: {
      title: 'General',
      description: 'Manage your account, privacy settings, notifications, and app updates.',
      keywords: 'general privacy notifications updates telemetry',
      sections: [
        {
          id: 'telemetry',
          component: <TelemetryCard />,
          keywords: 'privacy telemetry anonymous usage data posthog',
        },
        {
          id: 'auto-generate-task-names',
          component: <AutoGenerateTaskNamesRow />,
          keywords: 'auto generate task names suggest',
        },
        {
          id: 'auto-approve-by-default',
          component: <AutoApproveByDefaultRow />,
          keywords: 'auto approve by default permissions file operations skip',
        },
        {
          id: 'auto-trust-worktrees',
          component: <AutoTrustWorktreesRow />,
          keywords: 'auto trust worktree directories claude code folder',
        },
        {
          id: 'notifications',
          component: <NotificationSettingsCard />,
          keywords: 'notifications sound alerts',
        },
        {
          id: 'updates',
          component: <UpdateCard />,
          keywords: 'update auto-update version check release',
        },
      ],
    },
    account: {
      title: 'Account',
      description: 'Manage your Emdash account.',
      keywords: 'account login sign in profile user',
      sections: [
        {
          id: 'account',
          component: <AccountTab />,
          keywords: 'account login sign in profile user emdash',
        },
      ],
    },
    'clis-models': {
      title: 'Agents',
      description: 'Manage CLI agents and model configurations.',
      keywords: `agents cli models default review prompt ${agentKeywords}`,
      sections: [
        {
          id: 'default-agent',
          component: <DefaultAgentSettingsCard />,
          keywords: `default agent model selection cli ${agentKeywords}`,
        },
        {
          id: 'review-prompt',
          title: 'Review Prompt',
          action: <ReviewPromptResetButton />,
          component: <ReviewPromptSettingsCard />,
          keywords: 'review prompt template instructions',
        },
        {
          id: 'cli-agents',
          title: 'CLI agents',
          component: (
            <div className="rounded-xl border border-border/60 bg-muted/10 p-2">
              <CliAgentsList />
            </div>
          ),
          keywords: `cli agents installed path ${agentKeywords}`,
        },
      ],
    },
    integrations: {
      title: 'Integrations',
      description: 'Connect external services and tools.',
      keywords: 'integrations external services tools github mcp',
      sections: [
        {
          id: 'integrations',
          title: 'Integrations',
          component: <IntegrationsCard />,
          keywords: 'integrations external services tools github mcp connect',
        },
      ],
    },
    repository: {
      title: 'Repository',
      description: 'Configure repository and branch settings.',
      keywords: 'repository branch prefix git worktree',
      sections: [
        {
          id: 'branch-prefix',
          title: 'Branch prefix',
          component: <RepositorySettingsCard />,
          keywords: 'branch prefix repository git naming',
        },
      ],
    },
    interface: {
      title: 'Interface',
      description: 'Customize the appearance and behavior of the app.',
      keywords: 'interface appearance theme terminal keyboard shortcuts tools hidden',
      sections: [
        {
          id: 'theme',
          component: <ThemeCard />,
          keywords: 'theme appearance dark light mode colors',
        },
        {
          id: 'terminal',
          component: <TerminalSettingsCard />,
          keywords: 'terminal font size shell pty',
        },
        {
          id: 'keyboard-shortcuts',
          title: 'Keyboard shortcuts',
          component: <KeyboardSettingsCard />,
          keywords: 'keyboard shortcuts hotkeys keybindings',
        },
        {
          id: 'hidden-tools',
          title: 'Tools',
          component: <HiddenToolsSettingsCard />,
          keywords: 'tools hidden visibility',
        },
      ],
    },
  };

  const matchesQuery = useCallback(
    (text: string) => {
      if (!hasQuery) return true;
      return text.toLowerCase().includes(normalizedQuery);
    },
    [hasQuery, normalizedQuery]
  );

  const filteredTabs = hasQuery
    ? tabs.filter((tab) => {
        if (tab.isExternal) return false;
        const content = tabContent[tab.id as Exclude<SettingsPageTab, 'docs'>];
        if (!content) return false;
        const tabText = `${tab.label} ${content.title} ${content.description} ${content.keywords}`;
        if (matchesQuery(tabText)) return true;
        return content.sections.some((section) =>
          matchesQuery(`${section.title ?? ''} ${section.keywords}`)
        );
      })
    : tabs;

  useEffect(() => {
    if (!hasQuery) return;
    if (filteredTabs.length === 0) return;
    if (filteredTabs.some((t) => t.id === activeTab)) return;
    onTabChange(filteredTabs[0].id);
  }, [activeTab, filteredTabs, hasQuery, onTabChange]);

  const currentContent = tabContent[activeTab as Exclude<SettingsPageTab, 'docs'>];

  const visibleSections = !currentContent
    ? []
    : !hasQuery
      ? currentContent.sections
      : (() => {
          const tabText = `${currentContent.title} ${currentContent.description} ${currentContent.keywords}`;
          const tabMatches = matchesQuery(tabText);
          return currentContent.sections.filter((section) => {
            if (tabMatches) return true;
            return matchesQuery(`${section.title ?? ''} ${section.keywords}`);
          });
        })();

  const noResults = hasQuery && filteredTabs.length === 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1060px] flex-col gap-6 px-8">
        <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] gap-8 overflow-hidden">
          <div className="flex min-h-0 flex-col py-10">
            <div className="mb-3 px-1">
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="Search settings"
                aria-label="Search settings"
              />
            </div>
            <nav className="flex min-h-0 w-52 flex-col gap-0.5 overflow-y-auto">
              {(hasQuery ? filteredTabs : tabs).map((tab) => {
                const isActive = tab.id === activeTab && !tab.isExternal;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (tab.isExternal) {
                        handleDocsClick();
                      } else {
                        onTabChange(tab.id);
                      }
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 hover:bg-background-1 text-foreground-muted hover:text-foreground rounded-md px-3 py-2 text-sm font-normal transition-colors',
                      isActive &&
                        'bg-background-2 text-foreground hover:bg-background-2 hover:text-foreground'
                    )}
                  >
                    <span className="text-left">{tab.label}</span>
                    {tab.isExternal && <ExternalLink className="h-4 w-4" />}
                  </button>
                );
              })}
              {noResults && (
                <span className="px-3 py-2 text-xs text-foreground-muted">No matches</span>
              )}
            </nav>
          </div>
          {/* Content container */}
          {currentContent && !noResults && (
            <div className="min-h-0 min-w-0 flex-1 justify-center overflow-x-hidden overflow-y-auto">
              <div className="mx-auto w-full max-w-4xl space-y-8 py-10">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-xl">{currentContent.title}</h2>
                    <p className="text-sm text-foreground-muted">{currentContent.description}</p>
                  </div>
                  <Separator />
                </div>
                {visibleSections.length === 0 ? (
                  <div className="text-sm text-foreground-muted">
                    No settings match &ldquo;{query}&rdquo; in this tab.
                  </div>
                ) : (
                  visibleSections.map((section) => (
                    <div key={section.id} className="flex flex-col gap-3">
                      {section.title && (
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-normal text-foreground">{section.title}</h3>
                          {section.action && <div>{section.action}</div>}
                        </div>
                      )}
                      {section.component}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {noResults && (
            <div className="flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-hidden py-10">
              <div className="text-sm text-foreground-muted">
                No settings match &ldquo;{query}&rdquo;.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
