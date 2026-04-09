import { useAppSettingsKey } from '@renderer/core/app/use-app-settings-key';
import { Switch } from '../ui/switch';

export function TrackpadNavigationSettingsCard() {
  const { value, update, isLoading, isSaving } = useAppSettingsKey('navigation');

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/10 p-4">
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">Trackpad swipe navigation</span>
        <span className="text-sm text-muted-foreground">
          Navigate back and forward between views using trackpad swipe gestures.
        </span>
      </div>
      <Switch
        checked={value?.trackpadSwipe ?? true}
        disabled={isLoading || isSaving}
        onCheckedChange={(trackpadSwipe) => update({ trackpadSwipe })}
      />
    </div>
  );
}
