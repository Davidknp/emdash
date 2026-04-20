import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Plus } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { Automation } from '@shared/automations/types';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import { TooltipProvider } from '@renderer/lib/ui/tooltip';
import { AutomationEditor } from './AutomationEditor';
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
  const [editingId, setEditingId] = useState<string | null>(null);

  const openCreateModal = (template?: AutomationTemplate) => {
    showAutomationFormModal({
      initialSeed: template?.seed,
      onCreate: (input) => createAutomation(input),
    });
  };

  const openEditor = (automation: Automation) => {
    setEditingId(automation.id);
  };

  const handlePickTemplate = (template: AutomationTemplate) => {
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

  useEffect(() => {
    if (editingId && !automations.some((a) => a.id === editingId)) setEditingId(null);
  }, [editingId, automations]);

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

  const editingAutomation = editingId ? automations.find((a) => a.id === editingId) : undefined;

  const transition = { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const };
  const fadeSlide = {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
  };

  let content: React.ReactNode;
  if (editingAutomation) {
    content = (
      <motion.div
        key={`edit-${editingAutomation.id}`}
        {...fadeSlide}
        transition={transition}
        className="h-full"
      >
        <AutomationEditor
          automation={editingAutomation}
          onBack={() => setEditingId(null)}
          onUpdate={(input) => updateAutomation(input)}
          onToggle={() =>
            withBusy(editingAutomation.id, () => toggleAutomation(editingAutomation.id))
          }
          onTriggerNow={() =>
            withBusy(editingAutomation.id, () => triggerNow(editingAutomation.id))
          }
          onDelete={() =>
            showConfirmModal({
              title: 'Delete automation?',
              description: `"${editingAutomation.name}" will be removed along with its run history. This cannot be undone.`,
              confirmLabel: 'Delete',
              variant: 'destructive',
              onSuccess: () => {
                setEditingId(null);
                void withBusy(editingAutomation.id, () => deleteAutomation(editingAutomation.id));
              },
            })
          }
          isBusy={busyId === editingAutomation.id}
        />
      </motion.div>
    );
  } else {
    content = (
      <motion.div
        key="list"
        {...fadeSlide}
        transition={transition}
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
                      onEdit={() => openEditor(automation)}
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
                      onEdit={() => openEditor(automation)}
                    />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <TooltipProvider delay={200}>
      <AnimatePresence mode="wait" initial={false}>
        {content}
      </AnimatePresence>
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
