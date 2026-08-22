'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import ConversionForm from './ConversionForm';

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  price: string;
}

interface ConversionPanelProps {
  products: ProductRow[];
  storeId: string;
}

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary';

export default function ConversionPanel({ products, storeId }: ConversionPanelProps) {
  const [productSearch, setProductSearch]         = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId],
  );

  function handleReset() {
    setSelectedProductId('');
    setProductSearch('');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-surface border border-borderLight rounded p-4 flex flex-col gap-3">
        <p className="text-xs font-medium text-textSecondary uppercase tracking-wide">
          Produit
        </p>
        {!selectedProductId ? (
          <div className="flex flex-col gap-2">
            <input
              type="search"
              placeholder="Rechercher un produit par nom ou SKU…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className={inputCls}
              autoFocus
            />
            {filteredProducts.length === 0 ? (
              <p className="text-sm text-textMuted italic py-2">
                Aucun produit trouvé.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto divide-y divide-borderLight border border-borderLight rounded">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProductId(p.id)}
                    className="w-full text-left px-3 py-2 text-sm text-textMain hover:bg-background transition-colors"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 text-xs text-textMuted font-mono">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-textMain">{selectedProduct?.name}</p>
              <p className="text-xs text-textMuted font-mono">{selectedProduct?.sku}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              Changer
            </Button>
          </div>
        )}
      </div>

      {selectedProductId && (
        <ConversionForm
          key={selectedProductId}
          productId={selectedProductId}
          storeId={storeId}
          onSuccess={handleReset}
          showStockBreakdown={true}
          formIdPrefix="conv"
        />
      )}
    </div>
  );
}
