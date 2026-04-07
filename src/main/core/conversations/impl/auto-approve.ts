export function resolveAutoApproveEnabled({
  conversationAutoApprove,
  autoApproveByDefault,
}: {
  conversationAutoApprove?: boolean;
  autoApproveByDefault: boolean;
}): boolean {
  return conversationAutoApprove !== undefined ? conversationAutoApprove : autoApproveByDefault;
}
