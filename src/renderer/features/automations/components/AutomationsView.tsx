import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { Automation } from '@shared/automations/types';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import { TooltipProvider } from '@renderer/lib/ui/tooltip';
import { AutomationRow } from './AutomationRow';
import { AutomationTemplates, type AutomationTemplate } from './AutomationTemplates';
import { useAutomations } from './useAutomations';

export const AutomationsView: React.FC = () => {
  const {
    automations,
    isLoading,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleAutomation,
    triggerNow,
  } = useAutomations();
  const showRunLogsModal = useShowModal('runLogsModal');
  const showConfirmModal = useShowModal('confirmActionModal');
  const showAutomationFormModal = useShowModal('automationFormModal');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isExploreOpen, setIsExploreOpen] = useState(false);

  const openCreateModal = (template?: AutomationTemplate) => {
    showAutomationFormModal({
      mode: 'create',
      initialSeed: template?.seed,
      onCreate: (input) => createAutomation(input),
    });
  };

  const openEditModal = (automation: Automation) => {
    showAutomationFormModal({
      mode: 'edit',
      automation,
      onUpdate: (input) => updateAutomation(input),
    });
  };

  const handlePickTemplate = (template: AutomationTemplate) => {
    setIsExploreOpen(false);
    openCreateModal(template);
  };

  const withBusy = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  };

  const { activeAutomations, pausedAutomations } = useMemo(() => {
    const active = automations.filter((a) => a.status !== 'paused');
    const paused = automations.filter((a) => a.status === 'paused');
    return { activeAutomations: active, pausedAutomations: paused };
  }, [automations]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider delay={200}>
      <div
        className="flex h-full flex-col overflow-y-auto bg-background text-foreground"
        style={{ scrollbarGutter: 'stable' }}
      >
        <div className="mx-auto w-full max-w-3xl px-8 py-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold">Automations</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Run agents on a schedule or in response to GitHub, Linear, Jira and other
                integration events.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {automations.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExploreOpen((v) => !v)}
                  aria-pressed={isExploreOpen}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {isExploreOpen ? 'Hide examples' : 'Explore automations'}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => openCreateModal()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Automation
              </Button>
            </div>
          </div>

          {automations.length === 0 ? (
            <AutomationTemplates onPick={handlePickTemplate} />
          ) : (
            <div className="space-y-6">
              <AnimatePresence initial={false}>
                {isExploreOpen && (
                  <motion.div
                    key="explore"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <AutomationTemplates onPick={handlePickTemplate} />
                  </motion.div>
                )}
              </AnimatePresence>
              {activeAutomations.length > 0 && (
                <Section label="Active" count={activeAutomations.length}>
                  {activeAutomations.map((automation) => (
                    <Row
                      key={automation.id}
                      automation={automation}
                      busy={busyId === automation.id}
                      onToggle={() =>
                        withBusy(automation.id, () => toggleAutomation(automation.id))
                      }
                      onDelete={() =>
                        showConfirmModal({
                          title: 'Delete automation?',
                          description: `"${automation.name}" will be removed along with its run history. This cannot be undone.`,
                          confirmLabel: 'Delete',
                          variant: 'destructive',
                          onSuccess: () =>
                            void withBusy(automation.id, () => deleteAutomation(automation.id)),
                        })
                      }
                      onTriggerNow={() => withBusy(automation.id, () => triggerNow(automation.id))}
                      onShowLogs={() =>
                        showRunLogsModal({
                          automationId: automation.id,
                          automationName: automation.name,
                        })
                      }
                      onEdit={() => openEditModal(automation)}
                    />
                  ))}
                </Section>
              )}

              {pausedAutomations.length > 0 && (
                <Section label="Paused" count={pausedAutomations.length}>
                  {pausedAutomations.map((automation) => (
                    <Row
                      key={automation.id}
                      automation={automation}
                      busy={busyId === automation.id}
                      onToggle={() =>
                        withBusy(automation.id, () => toggleAutomation(automation.id))
                      }
                      onDelete={() =>
                        showConfirmModal({
                          title: 'Delete automation?',
                          description: `"${automation.name}" will be removed along with its run history. This cannot be undone.`,
                          confirmLabel: 'Delete',
                          variant: 'destructive',
                          onSuccess: () =>
                            void withBusy(automation.id, () => deleteAutomation(automation.id)),
                        })
                      }
                      onTriggerNow={() => withBusy(automation.id, () => triggerNow(automation.id))}
                      onShowLogs={() =>
                        showRunLogsModal({
                          automationId: automation.id,
                          automationName: automation.name,
                        })
                      }
                      onEdit={() => openEditModal(automation)}
                    />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground/60">{count}</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

const Row = AutomationRow;
