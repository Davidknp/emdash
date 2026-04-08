import {
  Bug,
  CircleDot,
  Clock,
  GitPullRequest,
  Pause,
  Pencil,
  Play,
  Trash2,
  Zap,
} from 'lucide-react';
import React from 'react';
import type { Automation } from '@shared/automations/types';
import { INTEGRATION_LABELS, type IntegrationStatusMap } from '@shared/integrations/types';
import forgejoSvg from '../../../assets/images/Forgejo.svg?raw';
import githubPng from '../../../assets/images/github.png';
import gitlabSvg from '../../../assets/images/GitLab.svg?raw';
import jiraSvg from '../../../assets/images/Jira.svg?raw';
import linearSvg from '../../../assets/images/Linear.svg?raw';
import plainSvg from '../../../assets/images/Plain.svg?raw';
import sentrySvg from '../../../assets/images/Sentry.svg?raw';
import { agentConfig } from '../../lib/agentConfig';
import type { Agent } from '../../types';
import type { Project } from '../../types/app';
import AgentLogo from '../AgentLogo';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  formatRelativeTime,
  formatScheduleLabel,
  formatTriggerLabel,
  TRIGGER_INTEGRATION_MAP,
} from './utils';

interface AutomationRowProps {
  automation: Automation;
  projects: Project[];
  integrationStatuses?: IntegrationStatusMap;
  onEdit: (automation: Automation) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onTriggerNow: (id: string) => void;
}

function IntegrationBadge({ integration }: { integration: string }): React.ReactNode {
  const wrapper =
    'pointer-events-none absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-[3px] bg-background ring-1 ring-border';
  if (integration === 'github') {
    return (
      <span className={wrapper}>
        <img src={githubPng} alt="" className="h-2.5 w-2.5 dark:invert" />
      </span>
    );
  }
  const rawMap: Record<string, string> = {
    linear: linearSvg,
    jira: jiraSvg,
    gitlab: gitlabSvg,
    forgejo: forgejoSvg,
    plain: plainSvg,
    sentry: sentrySvg,
  };
  const raw = rawMap[integration];
  if (!raw) return null;
  return (
    <span
      className={`${wrapper} [&_svg]:h-2.5 [&_svg]:w-2.5`}
      dangerouslySetInnerHTML={{ __html: raw }}
    />
  );
}

function getTriggerIcon(triggerType: string): React.ReactNode {
  if (triggerType === 'github_pr') return <GitPullRequest className="h-3 w-3" />;
  if (triggerType === 'linear_issue') return <CircleDot className="h-3 w-3" />;
  if (triggerType === 'sentry_issue') return <Bug className="h-3 w-3" />;
  return <Zap className="h-3 w-3" />;
}

const AutomationRow: React.FC<AutomationRowProps> = ({
  automation,
  projects,
  integrationStatuses,
  onEdit,
  onToggle,
  onDelete,
  onTriggerNow,
}) => {
  const agent = agentConfig[automation.agentId as Agent];
  const project = projects.find((p) => p.id === automation.projectId);
  const isActive = automation.status === 'active';

  const requiredIntegration =
    automation.mode === 'trigger' && automation.triggerType
      ? TRIGGER_INTEGRATION_MAP[automation.triggerType]
      : null;
  const isIntegrationDisconnected =
    requiredIntegration && integrationStatuses ? !integrationStatuses[requiredIntegration] : false;

  const canRunNow = automation.mode !== 'trigger';

  const projectLabel = project?.name ?? automation.projectName ?? 'Unknown';

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-4 transition-all hover:bg-muted/40 ${
        !isActive ? 'opacity-45' : ''
      }`}
    >
      <div className="relative shrink-0">
        {agent?.logo ? (
          <AgentLogo provider={automation.agentId as Agent} className="h-5 w-5 rounded-sm" />
        ) : (
          <span className="block w-5 text-center text-[10px] font-semibold text-muted-foreground">
            {automation.agentId.slice(0, 2).toUpperCase()}
          </span>
        )}
        {requiredIntegration && <IntegrationBadge integration={requiredIntegration} />}
      </div>

      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-semibold text-foreground">{automation.name}</span>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{projectLabel}</p>
      </div>

      {isIntegrationDisconnected && requiredIntegration && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="hidden sm:inline">
            Setup required ({INTEGRATION_LABELS[requiredIntegration]})
          </span>
        </span>
      )}

      {automation.mode === 'trigger' && automation.triggerType && !isIntegrationDisconnected && (
        <span className="hidden items-center gap-1 text-xs text-muted-foreground/40 sm:flex">
          {getTriggerIcon(automation.triggerType)}
          {formatTriggerLabel(automation.triggerType)}
        </span>
      )}
      {automation.mode !== 'trigger' && (
        <span className="hidden items-center gap-1 text-xs text-muted-foreground/40 sm:flex">
          <Clock className="h-3 w-3" />
          {formatScheduleLabel(automation.schedule)}
        </span>
      )}

      {automation.nextRunAt && isActive && automation.mode !== 'trigger' && (
        <span className="hidden text-xs text-muted-foreground/40 lg:inline">
          next {formatRelativeTime(automation.nextRunAt)}
        </span>
      )}

      <span
        className={`text-xs font-medium ${isActive ? 'text-emerald-500/70' : 'text-muted-foreground/40'}`}
      >
        {isActive ? 'Active' : 'Paused'}
      </span>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Tooltip>
          <TooltipTrigger>
            <span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (canRunNow) onTriggerNow(automation.id);
                }}
                aria-label="Run now"
                className="h-7 w-7 text-muted-foreground"
                disabled={!canRunNow}
              >
                <Zap className="h-3.5 w-3.5" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {automation.mode === 'trigger'
              ? 'Run now is unavailable for event-triggered automations'
              : 'Run now'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(automation.id);
              }}
              aria-label={isActive ? 'Pause' : 'Resume'}
              className="h-7 w-7 text-muted-foreground"
            >
              {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{isActive ? 'Pause' : 'Resume'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(automation);
              }}
              aria-label="Edit"
              className="h-7 w-7 text-muted-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(automation.id);
              }}
              aria-label="Delete"
              className="h-7 w-7 text-destructive/60"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Delete</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

export default AutomationRow;
