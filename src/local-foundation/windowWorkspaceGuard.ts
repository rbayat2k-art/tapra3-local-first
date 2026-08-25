export function requestWorkspaceTabClose(tabId: string) {
  const pagePanel = Array.from(document.querySelectorAll<HTMLElement>('[data-workspace-page-id]'))
    .find((panel) => panel.dataset.workspacePageId === tabId);
  if (!pagePanel?.querySelector('[data-workspace-dirty="true"]')) return true;
  window.dispatchEvent(new CustomEvent('workspace:tab-close-blocked', {detail: {tabId}}));
  return false;
}

export function notifyWorkspaceTabActivated(tabId: string) {
  window.dispatchEvent(new CustomEvent('workspace:active-tab-changed', {detail: {tabId}}));
}
