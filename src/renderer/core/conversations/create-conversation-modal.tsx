import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgentProviderId, getProvider } from '@shared/agent-provider-registry';
import { AgentSelector } from '@renderer/components/agent-selector';
import { ConfirmButton } from '@renderer/components/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@renderer/components/ui/field';
import { Switch } from '@renderer/components/ui/switch';
import { useAppSettingsKey } from '@renderer/core/app/use-app-settings-key';
import { BaseModalProps } from '@renderer/core/modal/modal-provider';
import { getPaneContainer } from '@renderer/core/pty/pane-sizing-context';
import { measureDimensions } from '@renderer/core/pty/pty-dimensions';
import { getProjectStore } from '@renderer/core/stores/project-selectors';
import { asProvisioned, getTaskStore } from '@renderer/core/stores/task-selectors';

function getConversationsPaneSize() {
  const container = getPaneContainer('conversations');
  return container ? (measureDimensions(container, 8, 16) ?? undefined) : undefined;
}

export const CreateConversationModal = observer(function CreateConversationModal({
  onSuccess,
  projectId,
  taskId,
}: BaseModalProps<{ conversationId: string }> & {
  projectId: string;
  taskId: string;
}) {
  const [providerId, setProviderId] = useState<AgentProviderId>('claude');
  const projectData = getProjectStore(projectId)?.data;
  const connectionId = projectData?.type === 'ssh' ? projectData.connectionId : undefined;
  const conversationMgr = asProvisioned(getTaskStore(projectId, taskId))?.conversations;
  const { value: taskSettings } = useAppSettingsKey('tasks');
  const defaultSkipPermissions = taskSettings?.autoApproveByDefault ?? false;

  // Remember the last skip-permissions choice per provider.
  const SKIP_PERMISSIONS_BY_PROVIDER_KEY = 'emdash-skip-permissions-by-provider';
  const readSkipMap = (): Record<string, boolean> => {
    try {
      const stored = localStorage.getItem(SKIP_PERMISSIONS_BY_PROVIDER_KEY);
      if (stored) return JSON.parse(stored) as Record<string, boolean>;
    } catch {}
    return {};
  };
  const [skipPermissions, setSkipPermissionsState] = useState<boolean>(
    () => readSkipMap()[providerId] ?? defaultSkipPermissions
  );

  // When the user switches provider, restore that provider's remembered choice.
  useEffect(() => {
    const map = readSkipMap();
    setSkipPermissionsState(map[providerId] ?? defaultSkipPermissions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);
  // Providers where the skip-permissions toggle should never be shown,
  // even if the registry technically declares an autoApproveFlag.
  const SKIP_PERMISSIONS_HIDDEN: ReadonlySet<AgentProviderId> = new Set(['amp', 'pi', 'droid']);
  const supportsSkipPermissions =
    Boolean(getProvider(providerId)?.autoApproveFlag) && !SKIP_PERMISSIONS_HIDDEN.has(providerId);

  const setSkipPermissions = useCallback(
    (next: boolean) => {
      setSkipPermissionsState(next);
      try {
        const map = readSkipMap();
        map[providerId] = next;
        localStorage.setItem(SKIP_PERMISSIONS_BY_PROVIDER_KEY, JSON.stringify(map));
      } catch {}
    },
    [providerId]
  );

  const providerIdConversationsCount = useMemo(() => {
    if (!conversationMgr) return 0;
    return Array.from(conversationMgr.conversations.values()).filter(
      (c) => c.data.providerId === providerId
    ).length;
  }, [conversationMgr, conversationMgr?.conversations.size, providerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = useMemo(() => {
    return `${providerId} (${providerIdConversationsCount + 1})`;
  }, [providerId, providerIdConversationsCount]);

  const handleCreateConversation = useCallback(() => {
    const id = crypto.randomUUID();
    void conversationMgr?.createConversation({
      projectId,
      taskId,
      id,
      autoApprove: supportsSkipPermissions ? skipPermissions : false,
      provider: providerId,
      title,
      initialSize: getConversationsPaneSize(),
    });
    onSuccess({ conversationId: id });
  }, [
    conversationMgr,
    providerId,
    title,
    onSuccess,
    projectId,
    taskId,
    skipPermissions,
    supportsSkipPermissions,
  ]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create Conversation</DialogTitle>
      </DialogHeader>
      <DialogContentArea className="pb-2">
        <FieldGroup
          className="transition-[min-height] duration-300 ease-out"
          style={{
            minHeight: supportsSkipPermissions ? 130 : 0,
            // Delay the height change in both directions until the combobox
            // close animation is done (~150ms), otherwise the trigger moves
            // while the dropdown is still animating out and we get a flicker.
            transitionDelay: '150ms',
          }}
        >
          <Field>
            <FieldLabel>Agent</FieldLabel>
            <AgentSelector
              value={providerId}
              onChange={setProviderId}
              connectionId={connectionId}
            />
          </Field>
          <Field
            className="transition-opacity duration-150 ease-out"
            style={{
              opacity: supportsSkipPermissions ? 1 : 0,
              visibility: supportsSkipPermissions ? 'visible' : 'hidden',
              pointerEvents: supportsSkipPermissions ? undefined : 'none',
            }}
          >
            <div className="flex items-center gap-2">
              <Switch
                checked={skipPermissions}
                onCheckedChange={setSkipPermissions}
                disabled={!supportsSkipPermissions}
              />
              <FieldLabel>Dangerously skip permissions</FieldLabel>
            </div>
          </Field>
        </FieldGroup>
      </DialogContentArea>
      <DialogFooter>
        <ConfirmButton onClick={handleCreateConversation}>Create</ConfirmButton>
      </DialogFooter>
    </>
  );
});
