import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { ChevronDown } from 'lucide-react';
import React, { useState } from 'react';
import type { CreateAutomationInput } from '@shared/automations/types';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { AnimatedHeight } from '@renderer/lib/ui/animated-height';
import { cn } from '@renderer/utils/utils';
import { AutomationForm } from './AutomationForm';
import { AutomationTemplates, type AutomationTemplate } from './AutomationTemplates';

export type AutomationFormModalArgs = {
  /** Optional seed for pre-filling the form. */
  initialSeed?: AutomationTemplate['seed'];
  onCreate: (input: CreateAutomationInput) => Promise<unknown>;
};

type Props = AutomationFormModalArgs & BaseModalProps<void>;

export const AutomationFormModal: React.FC<Props> = (props) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [seed, setSeed] = useState<AutomationTemplate['seed'] | undefined>(props.initialSeed);
  const [seedKey, setSeedKey] = useState(0);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const handleCreate = async (input: CreateAutomationInput) => {
    setIsSubmitting(true);
    try {
      await props.onCreate(input);
      props.onSuccess();
    } catch {
      // toast handled upstream; keep modal open so user can retry
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePickTemplate = (template: AutomationTemplate) => {
    setSeed(template.seed);
    setSeedKey((k) => k + 1);
    setTemplatesOpen(false);
  };

  return (
    <>
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <DialogPrimitive.Title className="text-sm font-semibold">
          {templatesOpen ? 'Choose a template' : 'New automation'}
        </DialogPrimitive.Title>
        {!templatesOpen && (
          <button
            type="button"
            onClick={() => setTemplatesOpen(true)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2 text-xs transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
            )}
          >
            <span>Use template</span>
          </button>
        )}
        {templatesOpen && (
          <button
            type="button"
            onClick={() => setTemplatesOpen(false)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2 text-xs transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
            )}
          >
            <ChevronDown className="h-3 w-3 rotate-90 text-muted-foreground/70" />
            <span>Back</span>
          </button>
        )}
      </div>
      <AnimatedHeight>
        {templatesOpen ? (
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            <AutomationTemplates onPick={handlePickTemplate} />
          </div>
        ) : (
          <AutomationForm
            key={seedKey}
            initialSeed={seed}
            isSubmitting={isSubmitting}
            onCancel={props.onClose}
            onCreate={handleCreate}
          />
        )}
      </AnimatedHeight>
    </>
  );
};
