import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import React, { useState } from 'react';
import type {
  Automation,
  CreateAutomationInput,
  UpdateAutomationInput,
} from '@shared/automations/types';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { AutomationForm } from './AutomationForm';
import type { AutomationTemplate } from './AutomationTemplates';

export type AutomationFormModalArgs = {
  mode: 'create' | 'edit';
  /** Required when mode === 'edit'. */
  automation?: Automation;
  /** Optional seed when mode === 'create'. */
  initialSeed?: AutomationTemplate['seed'];
  /** Invoked when mode === 'create'. */
  onCreate?: (input: CreateAutomationInput) => Promise<unknown>;
  /** Invoked when mode === 'edit'. */
  onUpdate?: (input: UpdateAutomationInput) => Promise<unknown>;
};

type Props = AutomationFormModalArgs & BaseModalProps<void>;

export const AutomationFormModal: React.FC<Props> = (props) => {
  const title = props.mode === 'edit' ? 'Edit automation' : 'New automation';
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runSubmit = async <T,>(fn: () => Promise<T>) => {
    setIsSubmitting(true);
    try {
      await fn();
      props.onSuccess();
    } catch {
      // toast handled upstream; keep modal open so user can retry
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
      </div>
      {props.mode === 'edit' && props.automation && props.onUpdate ? (
        <AutomationForm
          mode="edit"
          automation={props.automation}
          isSubmitting={isSubmitting}
          onCancel={props.onClose}
          onUpdate={(input) => runSubmit(() => props.onUpdate!(input))}
        />
      ) : props.mode === 'create' && props.onCreate ? (
        <AutomationForm
          mode="create"
          initialSeed={props.initialSeed}
          isSubmitting={isSubmitting}
          onCancel={props.onClose}
          onCreate={(input) => runSubmit(() => props.onCreate!(input))}
        />
      ) : null}
    </>
  );
};
