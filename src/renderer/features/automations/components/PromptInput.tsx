import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ISSUE_PROVIDER_META } from '@renderer/features/integrations/issue-provider-meta';
import { cn } from '@renderer/utils/utils';

export type MentionProvider = {
  token: string;
  label: string;
  logo: string;
  invertInDark?: boolean;
  /** Short hint appended to the prompt at run time, once per mention. */
  hint: string;
};

export const MENTION_PROVIDERS: MentionProvider[] = [
  {
    token: 'github',
    label: 'GitHub',
    logo: ISSUE_PROVIDER_META.github.logo,
    invertInDark: true,
    hint: 'Use the connected GitHub integration (gh CLI or MCP) to fetch issues, PRs, and repo context.',
  },
  {
    token: 'linear',
    label: 'Linear',
    logo: ISSUE_PROVIDER_META.linear.logo,
    invertInDark: true,
    hint: 'Use the connected Linear integration to read and update tickets.',
  },
  {
    token: 'jira',
    label: 'Jira',
    logo: ISSUE_PROVIDER_META.jira.logo,
    hint: 'Use the connected Jira integration to read and update issues.',
  },
  {
    token: 'gitlab',
    label: 'GitLab',
    logo: ISSUE_PROVIDER_META.gitlab.logo,
    hint: 'Use the connected GitLab integration (glab CLI or MCP) for issues and MRs.',
  },
  {
    token: 'forgejo',
    label: 'Forgejo',
    logo: ISSUE_PROVIDER_META.forgejo.logo,
    hint: 'Use the connected Forgejo integration for issues and PRs.',
  },
  {
    token: 'plain',
    label: 'Plain',
    logo: ISSUE_PROVIDER_META.plain.logo,
    invertInDark: true,
    hint: 'Use the connected Plain integration to read and reply to customer threads.',
  },
];

const MENTION_TOKENS = new Set(MENTION_PROVIDERS.map((p) => p.token));
// Enough trailing spaces so the raw textarea text is always wider than the
// rendered chip. The chip is clamped to this width so the caret stays aligned.
const MENTION_LAYOUT_PADDING = '            ';
const MENTION_SCAN_REGEX = /\$([a-zA-Z][a-zA-Z0-9_-]*)( {0,12})/g;

type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; raw: string; token: string; provider: MentionProvider | undefined };

function segmentize(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(MENTION_SCAN_REGEX)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) segments.push({ kind: 'text', text: text.slice(lastIndex, idx) });
    const token = match[1].toLowerCase();
    const provider = MENTION_PROVIDERS.find((p) => p.token === token);
    segments.push({ kind: 'mention', raw: match[0], token, provider });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ kind: 'text', text: text.slice(lastIndex) });
  return segments;
}

function MentionPill({
  raw,
  recognized,
  provider,
}: {
  raw: string;
  recognized: boolean;
  provider: MentionProvider | undefined;
}) {
  if (!recognized || !provider) {
    return (
      <span className="text-muted-foreground/80 underline decoration-dotted underline-offset-2">
        {raw}
      </span>
    );
  }
  return (
    <span className="relative inline-block align-baseline">
      <span className="whitespace-pre opacity-0">{raw}</span>
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 right-0 my-auto inline-flex h-6 items-center gap-1.5 overflow-hidden rounded-md border border-border/70 bg-background-tertiary/80 px-2 text-xs font-medium leading-none text-foreground shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]"
      >
        <img
          src={provider.logo}
          alt=""
          aria-hidden="true"
          className={cn(
            'pointer-events-none h-3.5 w-3.5 shrink-0 select-none',
            provider.invertInDark && 'dark:invert'
          )}
        />
        <span className="whitespace-nowrap">{provider.label}</span>
      </span>
    </span>
  );
}

function Highlighted({ value }: { value: string }) {
  const segments = segmentize(value);
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ) : (
          <MentionPill
            key={i}
            raw={seg.raw}
            recognized={MENTION_TOKENS.has(seg.token)}
            provider={seg.provider}
          />
        )
      )}
      {/* Preserve trailing newlines — textareas render them as an extra line. */}
      {value.endsWith('\n') && ' '}
    </>
  );
}

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
  textareaClassName?: string;
};

type PickerState = {
  open: boolean;
  triggerStart: number;
  query: string;
  hoverIdx: number;
};

const CLOSED: PickerState = { open: false, triggerStart: -1, query: '', hoverIdx: 0 };

const MIRROR_PROPS = [
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'MozTabSize',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
] as const;

function getCaretCoordinates(ta: HTMLTextAreaElement, position: number) {
  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  const style = mirror.style;
  const computed = window.getComputedStyle(ta);
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.top = '0';
  style.left = '-9999px';
  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  for (const prop of MIRROR_PROPS) {
    style[prop as never] = computed[prop as never];
  }
  mirror.textContent = ta.value.substring(0, position);
  const marker = document.createElement('span');
  marker.textContent = ta.value.substring(position) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const coords = {
    top: marker.offsetTop - ta.scrollTop,
    left: marker.offsetLeft - ta.scrollLeft,
    height: parseInt(computed.lineHeight, 10) || 20,
  };
  document.body.removeChild(mirror);
  return coords;
}

export const PromptInput: React.FC<Props> = ({
  value,
  onValueChange,
  placeholder,
  minHeight = 120,
  className,
  textareaClassName,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const [picker, setPicker] = useState<PickerState>(CLOSED);
  const [height, setHeight] = useState<number>(minHeight);
  const [caretPos, setCaretPos] = useState<{
    top: number;
    left: number;
    placement: 'above' | 'below';
  } | null>(null);

  // Auto-grow: match textarea height to overlay content height.
  useLayoutEffect(() => {
    if (!overlayRef.current) return;
    const next = Math.max(minHeight, overlayRef.current.offsetHeight);
    setHeight(next);
  }, [value, minHeight]);

  // Apply pending caret after the parent-controlled value has been reflected
  // into the textarea — synchronous so no intermediate frame flashes the wrong
  // selection.
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) return;
    const ta = textareaRef.current;
    if (!ta) return;
    pendingCaretRef.current = null;
    ta.focus();
    ta.setSelectionRange(caret, caret);
  }, [value]);

  const filtered = picker.open
    ? MENTION_PROVIDERS.filter((p) => p.token.startsWith(picker.query.toLowerCase()))
    : [];

  const updatePickerFromCaret = (text: string, caret: number) => {
    const upToCaret = text.slice(0, caret);
    const match = upToCaret.match(/(^|\s)\$([a-zA-Z0-9_-]*)$/);
    if (match) {
      const query = match[2];
      const triggerStart = caret - query.length - 1;
      const ta = textareaRef.current;
      if (ta) {
        const coords = getCaretCoordinates(ta, triggerStart);
        const rect = ta.getBoundingClientRect();
        const caretLineTop = rect.top + coords.top;
        const caretLineBottom = caretLineTop + coords.height;
        const matchedCount = MENTION_PROVIDERS.filter((p) =>
          p.token.startsWith(query.toLowerCase())
        ).length;
        const estHeight = 28 + matchedCount * 32;
        const spaceBelow = window.innerHeight - caretLineBottom;
        const placement: 'above' | 'below' =
          spaceBelow < estHeight + 16 && caretLineTop > estHeight + 16 ? 'above' : 'below';
        setCaretPos({
          top: placement === 'below' ? caretLineBottom + 4 : caretLineTop - 4,
          left: rect.left + coords.left,
          placement,
        });
      }
      setPicker((prev) => ({
        open: true,
        triggerStart,
        query,
        hoverIdx:
          prev.open && prev.triggerStart === triggerStart
            ? Math.min(
                prev.hoverIdx,
                Math.max(
                  0,
                  MENTION_PROVIDERS.filter((p) => p.token.startsWith(query.toLowerCase())).length -
                    1
                )
              )
            : 0,
      }));
    } else if (picker.open) {
      setPicker(CLOSED);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    onValueChange(nextValue);
    updatePickerFromCaret(nextValue, e.target.selectionStart ?? nextValue.length);
  };

  const handleSelectionChange = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    updatePickerFromCaret(ta.value, ta.selectionStart ?? 0);
  };

  const selectProvider = (provider: MentionProvider) => {
    if (!picker.open) return;
    const before = value.slice(0, picker.triggerStart);
    const afterStart = picker.triggerStart + 1 + picker.query.length;
    const after = value.slice(afterStart);
    const insertion = `$${provider.token}${MENTION_LAYOUT_PADDING}`;
    const nextValue = `${before}${insertion}${after}`;
    const nextCaret = before.length + insertion.length;
    pendingCaretRef.current = nextCaret;
    onValueChange(nextValue);
    setPicker(CLOSED);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!picker.open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPicker((p) => ({ ...p, hoverIdx: (p.hoverIdx + 1) % filtered.length }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPicker((p) => ({
        ...p,
        hoverIdx: (p.hoverIdx - 1 + filtered.length) % filtered.length,
      }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const idx = Math.min(picker.hoverIdx, filtered.length - 1);
      selectProvider(filtered[idx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setPicker(CLOSED);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={overlayRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none w-full whitespace-pre-wrap break-words px-5 pt-1 pb-4 text-sm leading-6 text-foreground',
          textareaClassName
        )}
        style={{ minHeight }}
      >
        {value.length === 0 ? (
          <span className="text-muted-foreground/60">{placeholder ?? ''}</span>
        ) : (
          <Highlighted value={value} />
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelectionChange}
        onClick={handleSelectionChange}
        onBlur={() => setPicker(CLOSED)}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          'absolute inset-0 w-full resize-none overflow-hidden bg-transparent px-5 pt-1 pb-4 text-sm leading-6 text-transparent caret-foreground placeholder:text-transparent focus:outline-none',
          textareaClassName
        )}
        style={{ height }}
      />

      {picker.open &&
        filtered.length > 0 &&
        caretPos &&
        createPortal(
          <div
            className={cn(
              'fixed z-[9999] w-[240px] overflow-hidden rounded-md border border-border bg-background-quaternary shadow-md ring-1 ring-foreground/10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150 motion-safe:ease-out',
              caretPos.placement === 'below' ? 'origin-top-left' : 'origin-bottom-left'
            )}
            style={
              caretPos.placement === 'below'
                ? { top: caretPos.top, left: caretPos.left }
                : { bottom: window.innerHeight - caretPos.top, left: caretPos.left }
            }
          >
            <div className="px-2 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Integrations
            </div>
            {filtered.map((p, i) => (
              <button
                key={p.token}
                type="button"
                // Use onMouseDown so the textarea doesn't blur before the click lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectProvider(p);
                }}
                onMouseEnter={() => setPicker((s) => ({ ...s, hoverIdx: i }))}
                className={cn(
                  'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors duration-100',
                  i === picker.hoverIdx
                    ? 'bg-background-tertiary'
                    : 'hover:bg-background-tertiary/60'
                )}
              >
                <img
                  src={p.logo}
                  alt={p.label}
                  className={cn('h-4 w-4 shrink-0', p.invertInDark && 'dark:invert')}
                />
                <span className="flex-1 truncate">{p.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">${p.token}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
