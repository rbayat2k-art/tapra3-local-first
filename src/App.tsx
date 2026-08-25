import {LocalFoundationApp} from './local-foundation/FoundationApp';
import {FormValidationPopupHost} from './local-foundation/FormValidation';
import {WindowWorkspaceProvider} from './local-foundation/WindowWorkspace';

export default function App() {
  return <WindowWorkspaceProvider><LocalFoundationApp /><FormValidationPopupHost /></WindowWorkspaceProvider>;
}
