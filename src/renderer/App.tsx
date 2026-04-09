import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import ErrorBoundary from './components/error-boundary';
import { RightSidebarProvider } from './components/ui/right-sidebar';
import { TooltipProvider } from './components/ui/tooltip';
import { ThemeProvider } from './core/app/ThemeProvider';
import { GithubContextProvider } from './core/github-context-provider';
import { IntegrationsProvider } from './core/integrations/integrations-provider';
import { ModalProvider } from './core/modal/modal-provider';
import { TerminalPoolProvider } from './core/pty/pty-pool-provider';
import { SshConnectionProvider } from './core/ssh/ssh-connection-provider';
import { WorkspaceLayoutContextProvider } from './core/view/layout-provider';
import { WorkspaceViewProvider } from './core/view/provider';
import { useAccountSession } from './hooks/useAccount';
import { useLocalStorage } from './hooks/useLocalStorage';
import { syncPosthogIdentity } from './lib/posthog-flags';
import { WelcomeScreen } from './views/Welcome';
import { Workspace } from './views/Workspace';

export const FIRST_LAUNCH_KEY = 'emdash:first-launch:v1';

const queryClient = new QueryClient();

function usePosthogIdentitySync() {
  const { data: session } = useAccountSession();
  useEffect(() => {
    if (session) {
      syncPosthogIdentity(session.user, session.isSignedIn);
    }
  }, [session]);
}

function AppShell() {
  const [isFirstLaunch, setIsFirstLaunch] = useLocalStorage<boolean>(FIRST_LAUNCH_KEY, true);
  usePosthogIdentitySync();

  if (isFirstLaunch) {
    return <WelcomeScreen onGetStarted={() => setIsFirstLaunch(false)} />;
  }
  return <Workspace />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={300}>
        <ModalProvider>
          <WorkspaceLayoutContextProvider>
            <TerminalPoolProvider>
              <SshConnectionProvider>
                <GithubContextProvider>
                  <IntegrationsProvider>
                    <WorkspaceViewProvider>
                      <RightSidebarProvider>
                        <ThemeProvider>
                          <ErrorBoundary>
                            <AppShell />
                          </ErrorBoundary>
                        </ThemeProvider>
                      </RightSidebarProvider>
                    </WorkspaceViewProvider>
                  </IntegrationsProvider>
                </GithubContextProvider>
              </SshConnectionProvider>
            </TerminalPoolProvider>
          </WorkspaceLayoutContextProvider>
        </ModalProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
