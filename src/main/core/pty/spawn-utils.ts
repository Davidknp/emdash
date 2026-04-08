import type { AgentSessionConfig } from '@shared/agent-session';
import type { GeneralSessionConfig } from '@shared/general-session';

export type SessionType = 'agent' | 'general' | 'lifecycle';
export type SessionConfig = AgentSessionConfig | GeneralSessionConfig;

export interface SpawnParams {
  command: string;
  args: string[];
  cwd: string;
}

/**
 * POSIX shell single-quote escape. Wraps the value in single quotes and
 * escapes any embedded single quotes via the standard `'\''` trick. Safe to
 * pass as a token to `sh -c`.
 */
function shellQuote(value: string): string {
  if (value === '') return "''";
  // If the value is "safe" (alphanumerics + a few harmless chars) we can leave
  // it bare; this keeps existing test fixtures and command lines readable.
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function joinShellCommand(parts: string[]): string {
  return parts.map(shellQuote).join(' ');
}

/**
 * Derive the executable, arguments, and working directory from a session config.
 * Applies shellSetup and tmux wrapping where relevant.
 */
export function resolveSpawnParams(type: SessionType, config: SessionConfig): SpawnParams {
  const shell = process.env.SHELL ?? '/bin/sh';

  switch (type) {
    case 'agent': {
      const cfg = config as AgentSessionConfig;
      const baseCmd = joinShellCommand([cfg.command, ...cfg.args]);
      const fullCmd = cfg.shellSetup ? `${cfg.shellSetup} && ${baseCmd}` : baseCmd;

      if (cfg.tmuxSessionName) {
        return buildTmuxParams(shell, cfg.tmuxSessionName, fullCmd, cfg.cwd);
      }

      return {
        command: shell,
        args: ['-c', fullCmd],
        cwd: cfg.cwd,
      };
    }

    case 'general': {
      const cfg = config as GeneralSessionConfig;
      const baseCmd = cfg.command
        ? joinShellCommand([cfg.command, ...(cfg.args ?? [])])
        : `exec ${shell} -il`;
      const fullCmd = cfg.shellSetup ? `${cfg.shellSetup} && ${baseCmd}` : baseCmd;

      if (cfg.tmuxSessionName) {
        return buildTmuxParams(shell, cfg.tmuxSessionName, fullCmd, cfg.cwd);
      }

      if (cfg.command || cfg.shellSetup) {
        return { command: shell, args: ['-c', fullCmd], cwd: cfg.cwd };
      }

      return { command: shell, args: ['-il'], cwd: cfg.cwd };
    }

    default: {
      throw new Error(`Unsupported session type: ${type}`);
    }
  }
}

/**
 * Build spawn params that wrap a command in a tmux session for persistence.
 *
 * Behaviour:
 * - If a tmux session named `sessionName` already exists → attach to it.
 * - Otherwise → create a detached session running `cmd`, then attach.
 */
export function buildTmuxParams(
  shell: string,
  sessionName: string,
  cmd: string,
  cwd: string
): SpawnParams {
  const quotedName = JSON.stringify(sessionName);
  const quotedCmd = JSON.stringify(cmd);

  const checkExists = `tmux has-session -t ${quotedName} 2>/dev/null`;
  const newSession = `tmux new-session -d -s ${quotedName} ${quotedCmd}`;
  const attach = `tmux attach-session -t ${quotedName}`;

  const tmuxCmd = `(${checkExists} && ${attach}) || (${newSession} && ${attach})`;

  return {
    command: shell,
    args: ['-c', tmuxCmd],
    cwd,
  };
}

/**
 * Build a single command string for SSH remote execution.
 */
export function resolveSshCommand(
  type: SessionType,
  config: SessionConfig,
  envVars?: Record<string, string>
): string {
  const { command, args, cwd } = resolveSpawnParams(type, config);
  const shell = process.env.SHELL ?? '/bin/sh';

  const innerCmd =
    command === shell && args[0] === '-c' ? args[1] : joinShellCommand([command, ...args]);
  const envPrefix = envVars ? buildSshEnvPrefix(envVars) : '';

  return `cd ${JSON.stringify(cwd)} && ${envPrefix}${innerCmd}`;
}

export function buildSshEnvPrefix(vars: Record<string, string>): string {
  const entries = Object.entries(vars);
  if (entries.length === 0) return '';
  const exports = entries.map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`).join('; ');
  return exports + '; ';
}
