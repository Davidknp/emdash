import { useEffect } from 'react';
import AutomationsView from '@renderer/components/automations/AutomationsView';
import { Titlebar } from '@renderer/components/titlebar/Titlebar';
import { useNavigate } from '@renderer/core/view/navigation-provider';
import { useFeatureFlag } from '@renderer/hooks/use-feature-flag';

export function AutomationsTitlebar() {
  return <Titlebar />;
}

export function AutomationsMainPanel() {
  const enabled = useFeatureFlag('automations');
  const { navigate } = useNavigate();

  useEffect(() => {
    if (!enabled) navigate('home');
  }, [enabled, navigate]);

  if (!enabled) return null;
  return <AutomationsView />;
}

export const automationsView = {
  TitlebarSlot: AutomationsTitlebar,
  MainPanel: AutomationsMainPanel,
};
