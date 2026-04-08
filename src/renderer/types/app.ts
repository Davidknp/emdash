import type { Project as SharedProject } from '@shared/projects';

export type Project = SharedProject & {
  githubInfo?: {
    connected?: boolean;
    repository?: string;
  };
  gitInfo?: {
    branch?: string;
  };
  isRemote?: boolean;
  sshConnectionId?: string;
};
