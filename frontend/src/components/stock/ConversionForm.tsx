'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import apiClient from '@/lib/apiClient';

interface PackagingFormat {
  id: string;
  label: string;
  units_per_package: number;
  is_base_unit: boolean;
}

interface BreakdownEntry {
  packaging_format_id: string;
  quantity: number;
  packaging_format: { label: string; units_per_package: number };
}

interface ConversionFormProps {
  productId: string;
  storeId: string;
  productName?: string;
  prefillToFormatId?: string;
  reasonHint?: string;
  onSuccess: () => void;
  onClose?: () => void;
  submitLabel?: string;
  showStockBreakdown?: boolean;
  formIdPrefix?: string;
}

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary';

export default function ConversionForm({
  productId,
  storeId,
  productName,
  prefillToFormatId,
  reasonHint,
  onSuccess,
  onClose,
  submitLabel = 'Convertir',
  showStockBreakdown = true,
  formIdPrefix = 'conv',
}: ConversionFormProps) {
  const [formats, setFormats]             = useState<PackagingFormat[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(true);
  const [formatsError, setFormatsError]     = useState<string | null>(null);

  const [breakdown, setBreakdown]         = useState<Map<string, number>>(new Map());

  const [fromFormatId, setFromFormatId]   = useState('');
  const [toFormatId, setToFormatId]       = useState('');
  const [qty, setQty]                     = useState('1');
  const [reason, setReason]               = useState('');

  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [success, setSuccess]             = useState<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  const onCloseRef   = useRef(onClose);
  onSuccessRef.current = onSuccess;
  onCloseRef.current   = onClose;

  const fromFormat = formats.find((f) => f.id === fromFormatId);
  const toFormat   = formats.find((f) => f.id === toFormatId);
  const toOptions  = formats.filter((f) => f.id !== fromFormatId);

  useEffect(() => {
    setFormatsLoading(true);
    setFormatsError(null);
    setError(null);
    setSuccess(null);
    setReason(reasonHint ?? '');

    Promise.all([
      apiClient.get<{ success: boolean; formats: PackagingFormat[] }>(
        `/api/products/${productId}/packaging-formats`,
      ),
      apiClient.get<{ success: boolean; breakdown: BreakdownEntry[] }>(
        `/api/inventory/${storeId}/${productId}/breakdown`,
      ),
    ])
      .then(([formatsRes, breakdownRes]) => {
        const fmts = formatsRes.data.formats ?? [];
        setFormats(fmts);
        setFormatsLoading(false);

        const map = new Map<string, number>();
        for (const b of breakdownRes.data.breakdown ?? []) {
          map.set(b.packaging_format_id, b.quantity);
        }
        setBreakdown(map);

        if (fmts.length < 2) {
          setFormatsError('Ce produit n\'a qu\'un seul format. Ajoutez-en un autre pour pouvoir effectuer une conversion.');
          return;
        }

        const toFmt = prefillToFormatId && fmts.find((f) => f.id === prefillToFormatId)
          ? prefillToFormatId
          : '';

        const fromCandidates = fmts.filter((f) => f.id !== toFmt && (map.get(f.id) ?? 0) > 0);
        let bestFrom = '';
        if (fromCandidates.length > 0) {
          const baseUnit = fromCandidates.find((f) => f.is_base_unit);
          bestFrom = baseUnit?.id ?? [...fromCandidates].sort((a, b) => (map.get(b.id) ?? 0) - (map.get(a.id) ?? 0))[0].id;
        }

        setFromFormatId(bestFrom);
        const targetToFmt = toFmt || (bestFrom ? fmts.find((f) => f.id !== bestFrom)?.id ?? '' : '');
        setToFormatId(targetToFmt);

        const fromObj = fmts.find((f) => f.id === bestFrom);
        const toObj   = fmts.find((f) => f.id === targetToFmt);
        if (fromObj && toObj) {
          const minQty = Math.max(1, Math.ceil(toObj.units_per_package / fromObj.units_per_package));
          const avail  = map.get(fromObj.id) ?? 0;
          setQty(String(Math.min(minQty, Math.max(avail, 1))));
        }
      })
      .catch(() => {
        setFormatsLoading(false);
        setFormatsError('Impossible de charger les données du produit.');
      });
  }, [productId, storeId, prefillToFormatId, reasonHint]);

  const result = (() => {
    if (!fromFormat || !toFormat) return null;
    const qtyNum = parseInt(qty, 10);
    if (isNaN(qtyNum) || qtyNum < 1) return null;
    const fromUnits = qtyNum * fromFormat.units_per_package;
    const toPackages = Math.floor(fromUnits / toFormat.units_per_package);
    const remainder = fromUnits % toFormat.units_per_package;
    return { fromUnits, toPackages, remainder };
  })();

  const fromMax = fromFormat ? (breakdown.get(fromFormat.id) ?? 0) : 0;
  const isDivisible = result !== null && result.remainder === 0;

  const canSubmit =
    fromFormat &&
    toFormat &&
    fromFormat.id !== toFormat.id &&
    result !== null &&
    result.toPackages > 0 &&
    reason.trim().length > 0 &&
    parseInt(qty, 10) > 0 &&
    parseInt(qty, 10) <= fromMax &&
    formats.length >= 2;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !result || !fromFormat || !toFormat) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.post('/api/stock-movements/convert', {
        store_id: storeId,
        product_id: productId,
        from_packaging_format_id: fromFormatId,
        from_packages_count: parseInt(qty, 10),
        to_packaging_format_id: toFormatId,
        reason: reason.trim(),
      });
      setSuccess('Conversion effectuée avec succès.');
      setTimeout(() => {
        onSuccessRef.current();
        onCloseRef.current?.();
      }, onClose ? 1200 : 1500);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message ?? 'Erreur lors de la conversion.');
      } else {
        setError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {productName && (
        <div className="bg-background border border-borderLight rounded p-3">
          <p className="text-sm font-medium text-textMain">{productName}</p>
        </div>
      )}

      {showStockBreakdown && !formatsLoading && breakdown.size > 0 && (
        <div className="bg-surface border border-borderLight rounded p-4 flex flex-col gap-2">
          <p className="text-xs font-medium text-textSecondary uppercase tracking-wide">
            Stock actuel
          </p>
          <div className="flex flex-wrap gap-2">
            {formats.map((fmt) => {
              const q = breakdown.get(fmt.id) ?? 0;
              return (
                <span
                  key={fmt.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-background border border-borderLight"
                >
                  <span className="font-medium text-textMain">{q}</span>
                  <span className="text-textMuted">{fmt.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {!showStockBreakdown && !formatsLoading && breakdown.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {formats.map((fmt) => {
            const q = breakdown.get(fmt.id) ?? 0;
            return (
              <span
                key={fmt.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-background border border-borderLight"
              >
                <span className="font-medium text-textMain">{q}</span>
                <span className="text-textMuted">{fmt.label}</span>
              </span>
            );
          })}
        </div>
      )}

      {formatsError ? (
        <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">
          {formatsError}
        </p>
      ) : formatsLoading ? (
        <div className="h-40 bg-borderLight rounded animate-pulse" />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${formIdPrefix}-from-format`} className="text-xs font-medium text-textSecondary">De</label>
              <select
                id={`${formIdPrefix}-from-format`}
                value={fromFormatId}
                onChange={(e) => {
                  setFromFormatId(e.target.value);
                  if (toFormatId === e.target.value) setToFormatId('');
                }}
                className={inputCls}
              >
                <option value="">— Sélectionner —</option>
                {formats.map((fmt) => {
                  const available = breakdown.get(fmt.id) ?? 0;
                  return (
                    <option key={fmt.id} value={fmt.id} disabled={available <= 0}>
                      {fmt.label} ×{fmt.units_per_package} ({available > 0 ? `${available} dispo.` : 'rupture'})
                    </option>
                  );
                })}
              </select>
              {fromFormat && (
                <p className="text-xs text-textMuted">{fromMax} colis disponible{fromMax > 1 ? 's' : ''}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${formIdPrefix}-to-format`} className="text-xs font-medium text-textSecondary">Vers</label>
              <select
                id={`${formIdPrefix}-to-format`}
                value={toFormatId}
                onChange={(e) => setToFormatId(e.target.value)}
                className={inputCls}
              >
                <option value="">— Sélectionner —</option>
                {toOptions.map((fmt) => (
                  <option key={fmt.id} value={fmt.id}>
                    {fmt.label} ×{fmt.units_per_package}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={`${formIdPrefix}-qty`} className="text-xs font-medium text-textSecondary">
              Quantité à convertir
            </label>
            <div className="flex items-center gap-3">
              <input
                id={`${formIdPrefix}-qty`}
                type="number"
                min={1}
                max={Math.max(fromMax, 1)}
                value={qty}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') { setQty(''); return; }
                  const n = parseInt(v, 10);
                  if (isNaN(n)) return;
                  setQty(String(Math.min(Math.max(n, 1), Math.max(fromMax, 1))));
                }}
                className={`${inputCls} ${onClose ? 'w-24' : 'w-28'} text-right`}
              />
              <span className="text-xs text-textMuted">
                {fromFormat ? fromFormat.label : 'colis'}
                {fromFormat ? ` · max ${fromMax}` : ''}
              </span>
            </div>
          </div>

          {result && result.toPackages > 0 && (
            <div className="border border-primary/20 bg-primary/5 rounded p-3 flex flex-col gap-1.5">
              <p className="text-xs font-medium text-primary uppercase tracking-wide flex items-center gap-1">
                <span className="text-green-600">{'\u2713'}</span> Résultat
              </p>
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-medium text-textMain">{qty} {fromFormat?.label}</span>
                <span className="text-textMuted">→</span>
                <span className="font-medium text-primary">{result.toPackages} {toFormat?.label}</span>
                {!isDivisible && (
                  <span className="text-xs text-textMuted ml-1">
                    + {result.remainder} unité{result.remainder > 1 ? 's' : ''} restante{result.remainder > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {!onClose && (
                <p className="text-xs text-textMuted">
                  {result.fromUnits} unités ÷ {toFormat!.units_per_package} = {result.toPackages} colis
                  {!isDivisible ? ` (reste ${result.remainder})` : ''}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor={`${formIdPrefix}-reason`} className="text-xs font-medium text-textSecondary">
              Motif <span className="text-danger">*</span>
            </label>
            <input
              id={`${formIdPrefix}-reason`}
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : Transfert vers Dépôt B, Réorganisation du stock…"
              className={inputCls}
              aria-required="true"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">{error}</p>
          )}
          {success && (
            <p role="alert" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{success}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-borderLight">
            {onClose && (
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Annuler
              </Button>
            )}
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting} disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
