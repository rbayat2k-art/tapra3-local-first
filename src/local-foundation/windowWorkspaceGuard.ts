export function requestWorkspaceNavigation() {
  if (!document.body.classList.contains('has-open-window-bar')) return true;
  window.dispatchEvent(new CustomEvent('workspace:navigation-blocked'));
  return false;
}
