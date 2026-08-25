import {LocalFoundationApp} from './local-foundation/FoundationApp';
import {WindowWorkspaceProvider} from './local-foundation/WindowWorkspace';

export default function App() {
  return <WindowWorkspaceProvider><LocalFoundationApp /></WindowWorkspaceProvider>;
}
