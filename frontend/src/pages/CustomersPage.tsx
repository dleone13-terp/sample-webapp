import { useEffect, useState, useCallback } from 'react';
import { customersApi } from '../api';
import type { Customer } from '../types';

const EMPTY: Partial<Customer> = {
  name: '', email: '', phone: '', company: '',
  address: '', city: '', state: '', zip: '', country: 'US', notes: '',
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Partial<Customer>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    customersApi.list()
      .then(setCustomers)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setShowModal(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ ...c });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setError('');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await customersApi.update(editing.id, form);
      } else {
        await customersApi.create(form);
      }
      closeModal();
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Customer) {
    if (!confirm(`Delete customer "${c.name}"?`)) return;
    try {
      await customersApi.delete(c.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.company?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="page-header">
        <h2>Customers</h2>
        <button className="btn-primary btn-icon" onClick={openCreate}>
          <span>+</span> Add Customer
        </button>
      </div>

      <div className="filters-bar">
        <input
          placeholder="Search customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
      </div>

      <div className="page-body">
        {error && !showModal && <div className="alert alert-error">{error}</div>}

        <div className="card">
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <p>{search ? 'No customers match your search.' : 'No customers yet.'}</p>
              {!search && (
                <button className="btn-primary" onClick={openCreate}>Add Customer</button>
              )}
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Company</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Location</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td className="font-semibold">{c.name}</td>
                      <td>{c.company ?? '—'}</td>
                      <td>{c.email ?? '—'}</td>
                      <td>{c.phone ?? '—'}</td>
                      <td className="text-gray text-sm">
                        {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn-secondary btn-sm" onClick={() => openEdit(c)}>
                            Edit
                          </button>
                          <button className="btn-danger btn-sm" onClick={() => handleDelete(c)}>
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

      {showModal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit Customer' : 'Add Customer'}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <form onSubmit={handleSubmit}>
                <div className="form-grid form-grid-2" style={{ gap: '1rem' }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Name *</label>
                    <input name="name" value={form.name ?? ''} onChange={handleChange} required />
                  </div>
                  <div className="form-group">
                    <label>Company</label>
                    <input name="company" value={form.company ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input name="email" type="email" value={form.email ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input name="phone" value={form.phone ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Address</label>
                    <input name="address" value={form.address ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>City</label>
                    <input name="city" value={form.city ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>State</label>
                    <input name="state" value={form.state ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>ZIP</label>
                    <input name="zip" value={form.zip ?? ''} onChange={handleChange} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Notes</label>
                    <textarea name="notes" value={form.notes ?? ''} onChange={handleChange} />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Customer'}
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
