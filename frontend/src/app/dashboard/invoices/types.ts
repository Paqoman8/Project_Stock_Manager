export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'DISPUTED';
export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

export interface SupplierInvoiceRow {
  id:          string;
  order_id:    string;
  invoice_ref: string | null;
  amount:      string;
  status:      InvoiceStatus;
  issued_at:   string;
  due_at:      string | null;
  paid_at:     string | null;
  notes:       string | null;
  order: {
    id:                string;
    reference:         string;
    supplier:          { id: string; name: string };
    destination_store: { id: string; name: string };
  };
}

export interface PurchaseOrderRow {
  id:        string;
  reference: string;
  status:    PurchaseOrderStatus;
  supplier:  { id: string; name: string };
  destination_store: { id: string; name: string };
  invoice:   SupplierInvoiceRow | null;
  items:     { ordered_qty: number; unit_price: string }[];
}
