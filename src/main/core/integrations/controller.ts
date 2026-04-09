import type { IntegrationStatusMap } from '@shared/integrations/types';
import { createRPCController } from '@shared/ipc/rpc';
import { forgejoService } from '@main/core/forgejo/forgejo-service';
import { githubAuthService } from '@main/core/github/services/github-auth-service';
import { gitlabService } from '@main/core/gitlab/gitlab-service';
import { jiraService } from '@main/core/jira/JiraService';
import { linearService } from '@main/core/linear/LinearService';
import { plainService } from '@main/core/plain/plain-service';

export const integrationsController = createRPCController({
  statusMap: async (): Promise<IntegrationStatusMap> => {
    const [github, linear, jira, gitlab, plain, forgejo] = await Promise.all([
      githubAuthService.isAuthenticated(),
      linearService.checkConnection(),
      jiraService.checkConnection(),
      gitlabService.checkConnection(),
      plainService.checkConnection(),
      forgejoService.checkConnection(),
    ]);

    return {
      github,
      linear: linear.connected,
      jira: jira.connected,
      gitlab: gitlab.connected,
      plain: plain.connected,
      forgejo: forgejo.connected,
      sentry: false,
    };
  },
});
