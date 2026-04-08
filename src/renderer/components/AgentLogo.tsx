import { agentConfig } from '@renderer/lib/agentConfig';
import { cn } from '@renderer/lib/utils';
import type { Agent } from '@renderer/types';

type LegacyProps = {
  logo?: string;
  alt?: string;
  isSvg?: boolean;
  invertInDark?: boolean;
};

export default function AgentLogo({
  provider,
  className,
  logo,
  alt,
  isSvg,
}: {
  provider?: Agent;
  className?: string;
} & LegacyProps) {
  const info = provider ? agentConfig[provider] : undefined;
  const effectiveLogo = logo ?? info?.logo;
  const effectiveAlt = alt ?? info?.alt ?? 'agent';
  const effectiveIsSvg = isSvg ?? info?.isSvg;
  if (!effectiveLogo) {
    return <div className={cn('h-4 w-4 rounded bg-muted', className)} />;
  }

  if (effectiveIsSvg) {
    return (
      <span
        className={cn('inline-flex items-center justify-center', className)}
        dangerouslySetInnerHTML={{ __html: effectiveLogo }}
      />
    );
  }

  return (
    <img
      src={effectiveLogo}
      alt={effectiveAlt}
      className={cn('h-4 w-4 object-contain', className)}
    />
  );
}
