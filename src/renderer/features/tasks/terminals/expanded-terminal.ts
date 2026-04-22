export interface ExpandedTerminalKeydownEventLike {
  key: string;
}

export function shouldCloseExpandedTerminal(event: ExpandedTerminalKeydownEventLike): boolean {
  return event.key === 'Escape';
}
