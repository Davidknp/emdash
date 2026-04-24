import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import React from 'react';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { DialogContentArea, DialogHeader, DialogTitle } from '@renderer/lib/ui/dialog';
import { ScrollArea } from '@renderer/lib/ui/scroll-area';
import { AUTOMATION_TEMPLATES, TemplateCard, type AutomationTemplate } from './AutomationTemplates';
import { EASE_OUT } from './utils';

type Props = BaseModalProps<AutomationTemplate>;

export const TemplatePickerModal: React.FC<Props> = ({ onSuccess }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Start from a template
        </DialogTitle>
      </DialogHeader>
      <DialogContentArea className="pb-4">
        <ScrollArea className="max-h-[60vh] pr-1">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
          >
            {AUTOMATION_TEMPLATES.map((template, i) => (
              <motion.div
                key={template.id}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.22,
                  delay: shouldReduceMotion ? 0 : Math.min(i * 0.025, 0.2),
                  ease: EASE_OUT,
                }}
              >
                <TemplateCard template={template} onPick={onSuccess} />
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </DialogContentArea>
    </>
  );
};
