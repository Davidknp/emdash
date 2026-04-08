import AutomationsView from '@renderer/components/automations/AutomationsView';
import { Titlebar } from '@renderer/components/titlebar/Titlebar';

export function AutomationsTitlebar() {
  return <Titlebar />;
}

export function AutomationsMainPanel() {
  return <AutomationsView />;
}

export const automationsView = {
  TitlebarSlot: AutomationsTitlebar,
  MainPanel: AutomationsMainPanel,
};
