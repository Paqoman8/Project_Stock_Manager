'use client';

import React from 'react';
import { Portal } from '@/components/ui/Portal';
import ConversionForm from './ConversionForm';

interface ConversionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storeId: string;
  productId: string;
  productName?: string;
  prefillToFormatId?: string;
  reasonHint?: string;
}

export default function ConversionDialog({
  isOpen,
  onClose,
  onSuccess,
  storeId,
  productId,
  productName,
  prefillToFormatId,
  reasonHint,
}: ConversionDialogProps) {
  if (!isOpen) return null;

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-borderLight rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-borderLight shrink-0">
          <h2 className="text-base font-semibold text-textMain">Conversion de conditionnement</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xl text-textMuted hover:text-textMain leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          <ConversionForm
            productId={productId}
            storeId={storeId}
            productName={productName}
            prefillToFormatId={prefillToFormatId}
            reasonHint={reasonHint}
            onSuccess={onSuccess}
            onClose={onClose}
            submitLabel="Confirmer la conversion"
            showStockBreakdown={false}
            formIdPrefix="dlg"
          />
        </div>
      </div>
    </div>
    </Portal>
  );
}
