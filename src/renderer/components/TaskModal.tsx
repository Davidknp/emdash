import { useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import { Button } from './ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { isValidSlugChar } from './ui/slug-input';
import { Separator } from './ui/separator';
import { type Agent } from '../types';
import {
  generateFriendlyTaskName,
  normalizeTaskName,
  MAX_TASK_NAME_LENGTH,
} from '../lib/taskNames';
import { useProjectManagementContext } from '../contexts/ProjectManagementContext';
import { Field, FieldError, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { useStableArray } from '@/hooks/useStableValue';
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from './ui/combobox';

const DEFAULT_AGENT: Agent = 'claude';

type LinkedIssue = {
  type: 'linear' | 'github' | 'jira';
  data: Record<string, any>;
};

function processName(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function validateName(name: string, existingNames: string[]) {
  if (name.length > MAX_TASK_NAME_LENGTH) {
    return {
      success: false,
      error: `Task name is too long (max ${MAX_TASK_NAME_LENGTH} characters)`,
    };
  }
  if (existingNames.includes(normalizeTaskName(name))) {
    return { success: false, error: 'A Task with this name already exists.' };
  }
  const hasInvalidChars = name.split('').some((char) => !isValidSlugChar(char));
  if (hasInvalidChars) {
    return { success: false, error: 'Only letters, numbers, and hyphens are allowed' };
  }
  return { success: true };
}

type BranchOption = {
  value: string;
  label: string;
};

function TaskBranchSelector({ items }: { items: BranchOption[] }) {
  return (
    <Combobox items={items} defaultValue={items[0]} autoHighlight>
      <ComboboxTrigger
        render={
          <Button variant="outline" size="sm" className="block w-full">
            <ComboboxValue />
          </Button>
        }
      />
      <ComboboxContent className="z-[1000]">
        <ComboboxInput showTrigger={false} placeholder="Select a branch" />
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.value} value={item.value}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

const DEFAULT_BRANCH_OPTIONS: BranchOption[] = [
  { value: 'main', label: 'main' },
  { value: 'develop', label: 'develop' },
  { value: 'feature/123', label: 'feature/123' },
  { value: 'feature/456', label: 'feature/456' },
  { value: 'feature/789', label: 'feature/789' },
  { value: 'feature/101', label: 'feature/101' },
];

export function CreateTaskModal() {
  const { selectedProject } = useProjectManagementContext();

  const existingNames = (selectedProject?.tasks || []).map((w) => w.name);

  const normalizedExisting = useMemo(
    () => existingNames.map((n) => normalizeTaskName(n)).filter(Boolean),
    [existingNames]
  );

  const normalizedExistingStable = useStableArray(normalizedExisting);

  const defaultName = useMemo(
    () => generateFriendlyTaskName(normalizedExistingStable),
    [normalizedExistingStable]
  );

  const form = useForm({
    validators: {
      onChange: ({ value }) => {
        const { success, error } = validateName(value.name, normalizedExisting);
        if (success) return;
        return {
          fields: {
            name: error,
          },
        };
      },
    },
    defaultValues: {
      name: defaultName,
      projectId: selectedProject?.id,
      baseRef: '',
      initialPrompt: '',
      autoApprove: false,
      useWorktree: true,
      linkedIssue: undefined,
      agentRuns: {
        [DEFAULT_AGENT]: 1,
      },
    },
  });

  return (
    <DialogContent
      className="max-h-[calc(100vh-48px)] max-w-md overflow-visible"
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>New Task</DialogTitle>
        <DialogDescription className="text-xs">
          Create a task and open the agent workspace.
        </DialogDescription>
      </DialogHeader>

      <Separator />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        {/* Task name */}
        <form.Field name="name">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  type="text"
                  onChange={(e) => field.handleChange(processName(e.target.value))}
                />
                {isInvalid && (
                  <FieldError
                    errors={field.state.meta.errors.map((error) => ({ message: error }))}
                  />
                )}
              </Field>
            );
          }}
        </form.Field>

        <TaskBranchSelector items={DEFAULT_BRANCH_OPTIONS} />

        <DialogFooter>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button type="submit" disabled={!canSubmit}>
                Create
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
