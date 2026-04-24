import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, Loader2, Plus, Sparkles } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Automation, CreateAutomationInput } from '@shared/automations/types';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import { TooltipProvider } from '@renderer/lib/ui/tooltip';
import { AutomationEditor } from './AutomationEditor';
import { AutomationForm } from './AutomationForm';
import { AutomationRow } from './AutomationRow';
import { AutomationTemplates, type AutomationTemplate } from './AutomationTemplates';
import { useAutomations } from './useAutomations';
import { EASE_OUT } from './utils';

type CreateMode = { open: false } | { open: true; seed?: AutomationTemplate['seed'] };

export const AutomationsView: React.FC = () => {
  const {
    automations,
    isLoading,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    pauseAutomation,
    resumeAutomation,
    triggerNow,
    isCreating,
  } = useAutomations();
  const showRunLogsModal = useShowModal('runLogsModal');
  const showConfirmModal = useShowModal('confirmActionModal');
  const showTemplatePickerModal = useShowModal('templatePickerModal');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>({ open: false });
  const [seedVersion, setSeedVersion] = useState(0);
  const newAutomationButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocusAfterDeleteRef = useRef(false);

  const openCreate = (seed?: AutomationTemplate['seed']) => {
    setCreateMode({ open: true, seed });
    setSeedVersion((v) => v + 1);
  };

  const closeCreate = () => {
    setCreateMode({ open: false });
  };

  const handleCreate = async (input: CreateAutomationInput) => {
    await createAutomation(input);
    closeCreate();
  };

  const openEditor = (automation: Automation) => {
    setEditingId(automation.id);
  };

  const handlePickTemplate = (template: AutomationTemplate) => {
    openCreate(template.seed);
  };

  const openTemplatePicker = () => {
    showTemplatePickerModal({
      onSuccess: handlePickTemplate,
    });
  };

  const withBusy = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  };

  const setPaused = (automation: Automation) => {
    const action = automation.status === 'paused' ? resumeAutomation : pauseAutomation;
    return withBusy(automation.id, () => action(automation.id));
  };

  useEffect(() => {
    if (editingId && !automations.some((a) => a.id === editingId)) setEditingId(null);
  }, [editingId, automations]);

  useEffect(() => {
    if (!createMode.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      closeCreate();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createMode.open]);

  useEffect(() => {
    if (!editingId && pendingFocusAfterDeleteRef.current) {
      pendingFocusAfterDeleteRef.current = false;
      newAutomationButtonRef.current?.focus();
    }
  }, [editingId]);

  const { activeAutomations, pausedAutomations } = useMemo(() => {
    const active = automations.filter((a) => a.status !== 'paused');
    const paused = automations.filter((a) => a.status === 'paused');
    return { activeAutomations: active, pausedAutomations: paused };
  }, [automations]);

  const shouldReduceMotion = useReducedMotion();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground [animation-duration:600ms]" />
      </div>
    );
  }

  const editingAutomation = editingId ? automations.find((a) => a.id === editingId) : undefined;

  const enterTransition = { duration: 0.2, ease: EASE_OUT };
  const exitTransition = { duration: 0.12, ease: EASE_OUT };
  const enterX = shouldReduceMotion ? 0 : '3%';
  const exitX = shouldReduceMotion ? 0 : '1.5%';
  const swapYOffset = shouldReduceMotion ? 0 : 2;

  let content: React.ReactNode;
  if (editingAutomation) {
    content = (
      <motion.div
        key={`edit-${editingAutomation.id}`}
        initial={{ opacity: 0, x: enterX }}
        animate={{ opacity: 1, x: 0, transition: enterTransition }}
        exit={{ opacity: 0, x: exitX, transition: exitTransition }}
        className="h-full"
      >
        <AutomationEditor
          automation={editingAutomation}
          onBack={() => setEditingId(null)}
          onUpdate={(input) => updateAutomation(input)}
          onToggle={() => setPaused(editingAutomation)}
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
                pendingFocusAfterDeleteRef.current = true;
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
        initial={{ opacity: 0, x: shouldReduceMotion ? 0 : '-3%' }}
        animate={{ opacity: 1, x: 0, transition: enterTransition }}
        exit={{ opacity: 0, x: shouldReduceMotion ? 0 : '-3%', transition: exitTransition }}
        className="flex h-full flex-col overflow-y-auto bg-background text-foreground"
        style={{ scrollbarGutter: 'stable' }}
      >
        <div className="mx-auto w-full max-w-3xl px-8 py-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                {createMode.open ? (
                  <motion.button
                    key="create-back"
                    type="button"
                    onClick={closeCreate}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, x: 0, transition: enterTransition }}
                    exit={{ opacity: 0, transition: exitTransition }}
                    className="relative inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:scale-[0.97] [transition:background-color_150ms,color_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)] before:absolute before:-inset-2 before:content-['']"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </motion.button>
                ) : (
                  <motion.div
                    key="list-title"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, x: 0, transition: enterTransition }}
                    exit={{ opacity: 0, transition: exitTransition }}
                  >
                    <h1 className="text-lg font-semibold text-balance">Automations</h1>
                    <p className="mt-1 text-xs text-muted-foreground text-pretty">
                      Run agents on a schedule or in response to GitHub, Linear, Jira and other
                      integration events.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <AnimatePresence initial={false}>
                {createMode.open && (
                  <motion.div
                    key="use-template"
                    initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 4 }}
                    animate={{ opacity: 1, x: 0, transition: enterTransition }}
                    exit={{ opacity: 0, x: shouldReduceMotion ? 0 : 4, transition: exitTransition }}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openTemplatePicker}
                      className="transition-transform duration-150 ease-out active:scale-[0.97]"
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Use template
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              <Button
                ref={newAutomationButtonRef}
                variant="outline"
                size="sm"
                onClick={() => openCreate()}
                disabled={createMode.open}
                className="transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Automation
              </Button>
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {createMode.open ? (
              <motion.div
                key="create"
                initial={{ opacity: 0, y: swapYOffset }}
                animate={{ opacity: 1, y: 0, transition: enterTransition }}
                exit={{ opacity: 0, y: -swapYOffset, transition: exitTransition }}
                className="overflow-hidden rounded-lg border border-border/60 bg-muted/10 shadow-sm"
              >
                <AutomationForm
                  key={`seed-${seedVersion}`}
                  initialSeed={createMode.seed}
                  isSubmitting={isCreating}
                  onCancel={closeCreate}
                  onCreate={handleCreate}
                />
              </motion.div>
            ) : (
              <motion.div
                key="body"
                initial={{ opacity: 0, y: swapYOffset }}
                animate={{ opacity: 1, y: 0, transition: enterTransition }}
                exit={{ opacity: 0, y: -swapYOffset, transition: exitTransition }}
              >
                {automations.length === 0 ? (
                  <AutomationTemplates onPick={handlePickTemplate} />
                ) : (
                  <div className="space-y-6">
                    {activeAutomations.length > 0 && (
                      <Section label="Active" count={activeAutomations.length}>
                        {activeAutomations.map((automation, i) => (
                          <StaggeredRow
                            key={automation.id}
                            index={i}
                            shouldReduceMotion={shouldReduceMotion ?? false}
                          >
                            <AutomationRow
                              automation={automation}
                              busy={busyId === automation.id}
                              onToggle={() => setPaused(automation)}
                              onDelete={() =>
                                showConfirmModal({
                                  title: 'Delete automation?',
                                  description: `"${automation.name}" will be removed along with its run history. This cannot be undone.`,
                                  confirmLabel: 'Delete',
                                  variant: 'destructive',
                                  onSuccess: () =>
                                    void withBusy(automation.id, () =>
                                      deleteAutomation(automation.id)
                                    ),
                                })
                              }
                              onTriggerNow={() =>
                                withBusy(automation.id, () => triggerNow(automation.id))
                              }
                              onShowLogs={() =>
                                showRunLogsModal({
                                  automationId: automation.id,
                                  automationName: automation.name,
                                })
                              }
                              onEdit={() => openEditor(automation)}
                            />
                          </StaggeredRow>
                        ))}
                      </Section>
                    )}

                    {pausedAutomations.length > 0 && (
                      <Section label="Paused" count={pausedAutomations.length}>
                        {pausedAutomations.map((automation, i) => (
                          <StaggeredRow
                            key={automation.id}
                            index={i}
                            shouldReduceMotion={shouldReduceMotion ?? false}
                          >
                            <AutomationRow
                              automation={automation}
                              busy={busyId === automation.id}
                              onToggle={() => setPaused(automation)}
                              onDelete={() =>
                                showConfirmModal({
                                  title: 'Delete automation?',
                                  description: `"${automation.name}" will be removed along with its run history. This cannot be undone.`,
                                  confirmLabel: 'Delete',
                                  variant: 'destructive',
                                  onSuccess: () =>
                                    void withBusy(automation.id, () =>
                                      deleteAutomation(automation.id)
                                    ),
                                })
                              }
                              onTriggerNow={() =>
                                withBusy(automation.id, () => triggerNow(automation.id))
                              }
                              onShowLogs={() =>
                                showRunLogsModal({
                                  automationId: automation.id,
                                  automationName: automation.name,
                                })
                              }
                              onEdit={() => openEditor(automation)}
                            />
                          </StaggeredRow>
                        ))}
                      </Section>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
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

function StaggeredRow({
  index,
  shouldReduceMotion,
  children,
}: {
  index: number;
  shouldReduceMotion: boolean;
  children: React.ReactNode;
}) {
  if (shouldReduceMotion) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.03, 0.16), ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
