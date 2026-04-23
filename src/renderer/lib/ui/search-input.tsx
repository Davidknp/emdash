import { useHotkey } from '@tanstack/react-hotkeys';
import { Search } from 'lucide-react';
import * as React from 'react';
import { Input } from '@renderer/lib/ui/input';
import { ShortcutHint } from '@renderer/lib/ui/shortcut-hint';
import { cn } from '@renderer/utils/utils';

function SearchInput({ className, value, ...props }: React.ComponentProps<'input'>) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  useHotkey(
    'Mod+F',
    () => {
      inputRef.current?.focus();
    },
    { enabled: true }
  );

  const isEmpty = !value || value === '';

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-2.5 top-1/2 size-3.5 shrink-0 -translate-y-1/2 text-foreground-muted/70 transition-colors duration-200 focus-within:text-foreground-muted pointer-events-none" />
      <Input
        className={cn('pl-8 pr-14 transition-all duration-200', className)}
        value={value}
        {...props}
        ref={inputRef}
      />
      <div
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2 transition-all duration-200',
          isEmpty ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        <div className="rounded border border-border/60 bg-background-1/80 px-1 py-0.5 backdrop-blur-sm">
          <ShortcutHint settingsKey="search" />
        </div>
      </div>
    </div>
  );
}

export { SearchInput };
