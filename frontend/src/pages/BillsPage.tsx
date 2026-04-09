import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { billsApi, customersApi } from '../api';
import type { Bill, BillStatus, Customer } from '../types';
import { STATUS_LABELS } from '../types';
import { StatusBadge } from '../components/StatusBadge';

const ALL_STATUSES: BillStatus[] = [
  'draft', 'submitted', 'picked_up', 'in_transit',
  'out_for_delivery', 'delivered', 'invoiced', 'paid', 'disputed', 'cancelled',
];

const EMPTY_BILL: Partial<Bill> = {
  customer_id: undefined,
  carrier: '',
  tracking_number: '',
  service_type: '',
  freight_class: '',
  origin_city: '',
  origin_state: '',
  origin_zip: '',
  destination_city: '',
  destination_state: '',
  destination_zip: '',
  weight: undefined,
  weight_unit: 'lbs',
  pieces: undefined,
  description: '',
  amount: undefined,
  currency: 'USD',
  pickup_date: '',
  estimated_delivery: '',
};

export default function BillsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [bills, setBills] = useState<Bill[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Bill>>(EMPTY_BILL);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const statusFilter = searchParams.get('status') ?? '';

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      billsApi.list({ status: statusFilter || undefined, search: search || undefined }),
      customersApi.list(),
    ])
      .then(([b, c]) => { setBills(b); setCustomers(c); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value, type } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === 'number' && value !== '' ? Number(value) : value || undefined,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await billsApi.create(form);
      setShowModal(false);
      setForm(EMPTY_BILL);
      setBills((prev) => [created, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(bill: Bill) {
    if (!confirm(`Delete bill ${bill.bill_number}?`)) return;
    try {
      await billsApi.delete(bill.id);
      setBills((prev) => prev.filter((b) => b.id !== bill.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Bills</h2>
        <button
          className="btn-primary btn-icon"
          onClick={() => { setForm(EMPTY_BILL); setShowModal(true); }}
        >
          <span>+</span> New Bill
        </button>
      </div>

      <div className="filters-bar">
        <input
          placeholder="Search bill#, carrier, tracking…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setSearchParams(e.target.value ? { status: e.target.value } : {})}
          style={{ maxWidth: 200 }}
        >
          <option value="">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <div className="page-body">
        {error && <div className="alert alert-error">{error}</div>}
        <div className="card">
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : bills.length === 0 ? (
            <div className="empty-state">
              <p>No bills found.</p>
              <button
                className="btn-primary"
                onClick={() => { setForm(EMPTY_BILL); setShowModal(true); }}
              >
                Create First Bill
              </button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Bill #</th>
                    <th>Customer</th>
                    <th>Carrier</th>
                    <th>Route</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id}>
                      <td>
                        <Link to={`/bills/${bill.id}`} style={{ fontWeight: 600 }}>
                          {bill.bill_number}
                        </Link>
                      </td>
                      <td>{bill.customer_name ?? '—'}</td>
                      <td>{bill.carrier ?? '—'}</td>
                      <td className="text-sm text-gray">
                        {bill.origin_city && bill.destination_city
                          ? `${bill.origin_city}, ${bill.origin_state ?? ''} → ${bill.destination_city}, ${bill.destination_state ?? ''}`
                          : '—'}
                      </td>
                      <td><StatusBadge status={bill.status} /></td>
                      <td>
                        {bill.amount != null ? `$${bill.amount.toLocaleString()}` : '—'}
                      </td>
                      <td className="text-sm text-gray">
                        {new Date(bill.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <Link to={`/bills/${bill.id}`}>
                            <button className="btn-secondary btn-sm">View</button>
                          </Link>
                          <button
                            className="btn-danger btn-sm"
                            onClick={() => handleDelete(bill)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Bill Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div
            className="modal"
            style={{ maxWidth: 700 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>New Freight Bill</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <form onSubmit={handleSubmit}>
                <div className="form-grid form-grid-2">
                  {/* Customer */}
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Customer</label>
                    <select
                      name="customer_id"
                      value={form.customer_id ?? ''}
                      onChange={handleChange}
                    >
                      <option value="">— No Customer —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.company ? ` (${c.company})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Carrier */}
                  <div className="form-group">
                    <label>Carrier</label>
                    <input name="carrier" value={form.carrier ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Tracking Number</label>
                    <input name="tracking_number" value={form.tracking_number ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Service Type</label>
                    <input name="service_type" value={form.service_type ?? ''} onChange={handleChange} placeholder="e.g. LTL, FTL, Expedited" />
                  </div>
                  <div className="form-group">
                    <label>Freight Class</label>
                    <input name="freight_class" value={form.freight_class ?? ''} onChange={handleChange} placeholder="e.g. 50, 70, 125" />
                  </div>

                  {/* Origin */}
                  <div className="form-group">
                    <label>Origin City</label>
                    <input name="origin_city" value={form.origin_city ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Origin State</label>
                    <input name="origin_state" value={form.origin_state ?? ''} onChange={handleChange} />
                  </div>

                  {/* Destination */}
                  <div className="form-group">
                    <label>Destination City</label>
                    <input name="destination_city" value={form.destination_city ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Destination State</label>
                    <input name="destination_state" value={form.destination_state ?? ''} onChange={handleChange} />
                  </div>

                  {/* Cargo */}
                  <div className="form-group">
                    <label>Weight (lbs)</label>
                    <input name="weight" type="number" min="0" step="0.1" value={form.weight ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Pieces</label>
                    <input name="pieces" type="number" min="1" step="1" value={form.pieces ?? ''} onChange={handleChange} />
                  </div>

                  {/* Financial */}
                  <div className="form-group">
                    <label>Amount (USD)</label>
                    <input name="amount" type="number" min="0" step="0.01" value={form.amount ?? ''} onChange={handleChange} />
                  </div>

                  {/* Dates */}
                  <div className="form-group">
                    <label>Pickup Date</label>
                    <input name="pickup_date" type="date" value={form.pickup_date ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Estimated Delivery</label>
                    <input name="estimated_delivery" type="date" value={form.estimated_delivery ?? ''} onChange={handleChange} />
                  </div>

                  {/* Description */}
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Description</label>
                    <textarea name="description" value={form.description ?? ''} onChange={handleChange} />
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Creating…' : 'Create Bill'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
