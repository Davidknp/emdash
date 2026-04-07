import { ChevronsUpDown, Star } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import { AgentProviderId } from '@shared/agent-provider-registry';
import { agentFavoritesStore } from '@renderer/core/stores/agent-favorites-store';
import { appState } from '@renderer/core/stores/app-state';
import { cn } from '@renderer/lib/utils';
import { agentConfig } from '../lib/agentConfig';
import AgentLogo from './agent-logo';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from './ui/combobox';

interface AgentOption {
  value: string;
  label: string;
  agentId: AgentProviderId;
  disabled: boolean;
}

interface AgentGroup {
  value: string;
  label: string;
  items: AgentOption[];
}

interface AgentSelectorProps {
  value: AgentProviderId;
  onChange: (agent: AgentProviderId) => void;
  disabled?: boolean;
  className?: string;
  connectionId?: string;
}

export const AgentSelector: React.FC<AgentSelectorProps> = observer(
  ({ value, onChange, disabled = false, className = '', connectionId }) => {
    const installedAgents = connectionId
      ? appState.dependencies.remoteInstalledAgents(connectionId)
      : appState.dependencies.localInstalledAgents;
    const [open, setOpen] = useState(false);
    // Tracks which favorite is pending removal confirmation (second click).
    const [pendingRemove, setPendingRemove] = useState<AgentProviderId | null>(null);

    const installedSet = new Set(installedAgents.filter((id) => id in agentConfig));
    const allAgentIds = Object.keys(agentConfig) as AgentProviderId[];

    const favoriteSet = new Set(agentFavoritesStore.favorites);

    const toOption = (id: AgentProviderId, disabled: boolean): AgentOption => ({
      value: id,
      label: agentConfig[id].name,
      agentId: id,
      disabled,
    });

    // Favorites get their own group at the top, in the order they were favorited.
    const favoriteOptions: AgentOption[] = agentFavoritesStore.favorites
      .filter((id) => id in agentConfig)
      .map((id) => toOption(id as AgentProviderId, !installedSet.has(id as AgentProviderId)));

    const installedOptions: AgentOption[] = allAgentIds
      .filter((id) => installedSet.has(id) && !favoriteSet.has(id))
      .map((id) => toOption(id, false));

    const notInstalledOptions: AgentOption[] = allAgentIds
      .filter((id) => !installedSet.has(id) && !favoriteSet.has(id))
      .map((id) => toOption(id, true));

    const groups: AgentGroup[] = [
      { value: 'favorites', label: 'Favorites', items: favoriteOptions },
      { value: 'installed', label: 'Installed', items: installedOptions },
      { value: 'not-installed', label: 'Not installed', items: notInstalledOptions },
    ].filter((g) => g.items.length > 0);

    const allOptions = [...favoriteOptions, ...installedOptions, ...notInstalledOptions];

    function handleFavoriteClick(e: React.MouseEvent, id: AgentProviderId) {
      e.preventDefault();
      e.stopPropagation();
      const isFav = agentFavoritesStore.isFavorite(id);
      if (!isFav) {
        agentFavoritesStore.add(id);
        setPendingRemove(null);
        return;
      }
      if (pendingRemove === id) {
        agentFavoritesStore.remove(id);
        setPendingRemove(null);
      } else {
        setPendingRemove(id);
      }
    }

    const selectedConfig = agentConfig[value];
    const selectedOption = allOptions.find((o) => o.value === value);

    function handleValueChange(item: AgentOption | null) {
      if (!item || disabled || item.disabled) return;
      onChange(item.agentId);
      setOpen(false);
    }

    return (
      <div className={cn('relative block min-w-0', className)}>
        <Combobox
          items={groups}
          value={selectedOption ?? null}
          onValueChange={handleValueChange}
          open={open}
          onOpenChange={(o) => {
            if (disabled) return;
            setOpen(o);
            if (!o) setPendingRemove(null);
          }}
          isItemEqualToValue={(a: AgentOption, b: AgentOption) => a.value === b.value}
          filter={(item: AgentOption, query) =>
            item.label.toLowerCase().includes(query.toLowerCase())
          }
          autoHighlight
        >
          <ComboboxTrigger
            disabled={disabled}
            className={cn(
              'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-transparent px-2.5 py-1 text-sm outline-none',
              disabled && 'cursor-not-allowed opacity-60'
            )}
          >
            {selectedConfig ? (
              <>
                <AgentLogo
                  logo={selectedConfig.logo}
                  alt={selectedConfig.alt}
                  isSvg={selectedConfig.isSvg}
                  invertInDark={selectedConfig.invertInDark}
                  className="h-4 w-4 shrink-0 rounded-sm"
                />
                <span className="flex-1 truncate text-left">{selectedConfig.name}</span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground opacity-60" />
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-muted-foreground">Select agent</span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground opacity-60" />
              </>
            )}
          </ComboboxTrigger>
          <ComboboxContent className="min-w-(--anchor-width)">
            <ComboboxInput showTrigger={false} placeholder="Search agents..." />
            <ComboboxList className="pb-0">
              {(group: AgentGroup) => (
                <ComboboxGroup key={group.value} items={group.items} className="py-1">
                  <ComboboxLabel>{group.label}</ComboboxLabel>
                  <ComboboxCollection>
                    {(item: AgentOption) => {
                      const config = agentConfig[item.agentId];
                      const isFav = favoriteSet.has(item.agentId);
                      const isPendingRemove = pendingRemove === item.agentId;
                      return (
                        <ComboboxItem
                          key={item.value}
                          value={item}
                          disabled={item.disabled}
                          className={cn(
                            // Hide default check indicator (absolute right-2) so it doesn't collide
                            // with our favorite star button. Selected state is still
                            // visible via data-selected:bg-background-2.
                            'group/item !pr-2 [&>span.absolute]:hidden',
                            isPendingRemove &&
                              'bg-red-500/10 text-red-600 data-highlighted:bg-red-500/15 dark:text-red-400'
                          )}
                        >
                          {config && (
                            <AgentLogo
                              logo={config.logo}
                              alt={config.alt}
                              isSvg={config.isSvg}
                              invertInDark={config.invertInDark}
                              className="h-4 w-4 shrink-0 rounded-sm"
                            />
                          )}
                          <span className="flex-1 truncate">{item.label}</span>
                          <button
                            type="button"
                            aria-label={
                              isFav
                                ? isPendingRemove
                                  ? 'Click again to remove favorite'
                                  : 'Remove favorite'
                                : 'Add favorite'
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => handleFavoriteClick(e, item.agentId)}
                            onPointerEnter={() => {
                              if (pendingRemove && pendingRemove !== item.agentId) {
                                setPendingRemove(null);
                              }
                            }}
                            className={cn(
                              'flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-colors group-hover/item:opacity-60 hover:!opacity-100 data-highlighted:opacity-60',
                              isFav && '!opacity-100 text-yellow-500',
                              isPendingRemove && '!opacity-100 text-red-500'
                            )}
                          >
                            <Star
                              className="size-3.5"
                              fill={isFav ? 'currentColor' : 'none'}
                              strokeWidth={2}
                            />
                          </button>
                        </ComboboxItem>
                      );
                    }}
                  </ComboboxCollection>
                </ComboboxGroup>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    );
  }
);
