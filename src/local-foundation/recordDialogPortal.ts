import {createContext, useContext} from 'react';

export interface RecordDialogPortalManager {
  portalTarget?: HTMLElement;
  registerOverlay: (close: () => void) => () => void;
}

export const RecordDialogPortalContext = createContext<RecordDialogPortalManager | undefined>(undefined);

export function useRecordDialogPortal() {
  return useContext(RecordDialogPortalContext);
}
