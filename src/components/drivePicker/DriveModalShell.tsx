import React from 'react';
import { LAYER_MODAL_BACKDROP } from '../../lib/layers';

type Props = {
  title: React.ReactNode
  onClose: () => void
  /** The layer of the backdrop: `LAYER_MODAL_BACKDROP` for a picker, `LAYER_MODAL` for a dialog over one. */
  layer?: string
  children: React.ReactNode
}

// The frame every Drive picker shares (#1109): the backdrop, the dialog box, the title and the ×.
export const DriveModalShell: React.FC<Props> = ({ title, onClose, layer = LAYER_MODAL_BACKDROP, children }) => (
  <div className={`fixed inset-0 ${layer} overflow-y-auto`}>
    <div className="flex items-center justify-center min-h-screen">
      <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>
      <div className="bg-bg-secondary p-3 border border-white/10 rounded-lg shadow-lg relative z-20 mx-auto w-11/12 sm:w-3/4 md:w-1/2 lg:w-1/3">
        <div className="flex justify-between items-center">
          <span className="text-2xl font-bold mt-4 mb-2 block text-text-primary">{title}</span>
          <button
            type="button"
            className="text-text-primary hover:text-text-secondary"
            onClick={onClose}
          >
            <span className="text-2xl">&times;</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  </div>
);
