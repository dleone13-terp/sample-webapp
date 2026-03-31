import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { billsApi } from '../api';
import type { Bill, BillStatus, BillDocument, BillEvent } from '../types';
import { STATUS_LABELS, STATUS_TRANSITIONS } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { LifecycleTimeline } from '../components/LifecycleTimeline';

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [docForm, setDocForm] = useState({
    filename: '',
    document_type: '',
    content_type: '',
    notes: '',
  });
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    billsApi
      .get(Number(id))
      .then(setBill)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(newStatus: BillStatus) {
    if (!bill) return;
    const label = STATUS_LABELS[newStatus];
    if (!confirm(`Change status to "${label}"?`)) return;
    setTransitioning(true);
    try {
      const updated = await billsApi.updateStatus(bill.id, newStatus);
      // Reload to get fresh events
      load();
      setBill((prev) => prev ? { ...prev, ...updated } : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTransitioning(false);
    }
  }

  async function handleDocumentUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!bill || !docForm.filename.trim()) {
      setUploadError('Filename is required');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      await billsApi.addDocument(bill.id, {
        filename: docForm.filename.trim(),
        document_type: docForm.document_type || undefined,
        content_type: docForm.content_type || undefined,
        notes: docForm.notes || undefined,
      });
      setDocForm({ filename: '', document_type: '', content_type: '', notes: '' });
      setShowUpload(false);
      load();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDocument(docId: number) {
    if (!bill || !confirm('Remove this document?')) return;
    try {
      await billsApi.deleteDocument(bill.id, docId);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteBill() {
    if (!bill || !confirm(`Delete bill ${bill.bill_number}? This cannot be undone.`)) return;
    try {
      await billsApi.delete(bill.id);
      navigate('/bills');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) return <div className="page-body">Loading…</div>;
  if (!bill) return <div className="page-body"><div className="alert alert-error">{error || 'Bill not found'}</div></div>;

  const nextStatuses = STATUS_TRANSITIONS[bill.status];
  const documents = bill.documents ?? [];
  const events = bill.events ?? [];

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(d: string) {
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: 4 }}>
            <Link to="/bills">← Bills</Link>
          </div>
          <h2>{bill.bill_number}</h2>
        </div>
        <div className="flex gap-2 items-center">
          <StatusBadge status={bill.status} />
          <button className="btn-danger btn-sm" onClick={handleDeleteBill}>
            Delete Bill
          </button>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {error && <div className="alert alert-error">{error}</div>}

        {/* Lifecycle Timeline */}
        <div className="card">
          <div className="card-header">
            <h3>Lifecycle</h3>
          </div>
          <div className="card-body">
            <LifecycleTimeline currentStatus={bill.status} />
            {nextStatuses.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8125rem', color: '#6b7280', alignSelf: 'center' }}>
                  Advance to:
                </span>
                {nextStatuses.map((s) => (
                  <button
                    key={s}
                    className="btn-secondary btn-sm"
                    disabled={transitioning}
                    onClick={() => handleStatusChange(s)}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          {/* Bill Details */}
          <div className="card">
            <div className="card-header"><h3>Bill Details</h3></div>
            <div className="card-body">
              <table style={{ fontSize: '0.875rem' }}>
                <tbody>
                  {[
                    ['Bill #', bill.bill_number],
                    ['Customer', bill.customer_name ?? '—'],
                    ['Company', bill.customer_company ?? '—'],
                    ['Email', bill.customer_email ?? '—'],
                    ['Phone', bill.customer_phone ?? '—'],
                    ['Carrier', bill.carrier ?? '—'],
                    ['Tracking #', bill.tracking_number ?? '—'],
                    ['Service Type', bill.service_type ?? '—'],
                    ['Freight Class', bill.freight_class ?? '—'],
                    ['Amount', bill.amount != null ? `$${bill.amount.toLocaleString()} ${bill.currency}` : '—'],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ color: '#6b7280', paddingRight: '1rem', paddingBottom: '0.5rem', whiteSpace: 'nowrap' }}>{label}</td>
                      <td style={{ fontWeight: 500, paddingBottom: '0.5rem' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Shipment Details */}
          <div className="card">
            <div className="card-header"><h3>Shipment Details</h3></div>
            <div className="card-body">
              <table style={{ fontSize: '0.875rem' }}>
                <tbody>
                  {[
                    ['Origin', [bill.origin_city, bill.origin_state, bill.origin_zip].filter(Boolean).join(', ') || '—'],
                    ['Destination', [bill.destination_city, bill.destination_state, bill.destination_zip].filter(Boolean).join(', ') || '—'],
                    ['Weight', bill.weight != null ? `${bill.weight} ${bill.weight_unit}` : '—'],
                    ['Pieces', bill.pieces?.toString() ?? '—'],
                    ['Description', bill.description ?? '—'],
                    ['Pickup Date', formatDate(bill.pickup_date)],
                    ['Est. Delivery', formatDate(bill.estimated_delivery)],
                    ['Actual Delivery', formatDate(bill.actual_delivery)],
                    ['Created', formatDate(bill.created_at)],
                    ['Updated', formatDate(bill.updated_at)],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ color: '#6b7280', paddingRight: '1rem', paddingBottom: '0.5rem', whiteSpace: 'nowrap' }}>{label}</td>
                      <td style={{ fontWeight: 500, paddingBottom: '0.5rem' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="card">
          <div className="card-header">
            <h3>Documents ({documents.length})</h3>
            <button
              className="btn-secondary btn-sm btn-icon"
              onClick={() => setShowUpload(true)}
            >
              <span>+</span> Add Document
            </button>
          </div>
          <div className="card-body">
            {documents.length === 0 ? (
              <p className="text-gray text-sm">No documents attached.</p>
            ) : (
              <div className="doc-list">
                {documents.map((doc: BillDocument) => (
                  <div key={doc.id} className="doc-item">
                    <div className="doc-info">
                      <div className="doc-name">📄 {doc.filename}</div>
                      <div className="doc-meta">
                        {[
                          doc.document_type,
                          doc.content_type,
                          doc.file_size != null ? `${(doc.file_size / 1024).toFixed(1)} KB` : null,
                          formatDateTime(doc.uploaded_at),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      {doc.notes && (
                        <div className="doc-meta">{doc.notes}</div>
                      )}
                    </div>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleDeleteDocument(doc.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Event History */}
        <div className="card">
          <div className="card-header">
            <h3>Activity Log</h3>
          </div>
          <div className="card-body">
            {events.length === 0 ? (
              <p className="text-gray text-sm">No events recorded.</p>
            ) : (
              <div className="event-list">
                {[...events].reverse().map((ev: BillEvent) => (
                  <div key={ev.id} className="event-item">
                    <div className={`event-dot ${ev.event_type}`} />
                    <div className="event-content">
                      <div className="event-description">{ev.description}</div>
                      {ev.from_status && ev.to_status && (
                        <div className="event-meta">
                          {STATUS_LABELS[ev.from_status as BillStatus] ?? ev.from_status} → {STATUS_LABELS[ev.to_status as BillStatus] ?? ev.to_status}
                        </div>
                      )}
                      <div className="event-meta">
                        {formatDateTime(ev.created_at)} · {ev.created_by}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Document Modal */}
      {showUpload && (
        <div className="modal-backdrop" onClick={() => setShowUpload(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Document</h3>
              <button className="modal-close" onClick={() => setShowUpload(false)}>×</button>
            </div>
            <div className="modal-body">
              {uploadError && <div className="alert alert-error">{uploadError}</div>}
              <form onSubmit={handleDocumentUpload}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Filename *</label>
                    <input
                      value={docForm.filename}
                      onChange={(e) => setDocForm((f) => ({ ...f, filename: e.target.value }))}
                      placeholder="e.g. BOL-12345.pdf"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Document Type</label>
                    <select
                      value={docForm.document_type}
                      onChange={(e) => setDocForm((f) => ({ ...f, document_type: e.target.value }))}
                    >
                      <option value="">— Select Type —</option>
                      <option value="BOL">Bill of Lading (BOL)</option>
                      <option value="invoice">Invoice</option>
                      <option value="proof_of_delivery">Proof of Delivery</option>
                      <option value="customs">Customs Documents</option>
                      <option value="insurance">Insurance</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Content Type</label>
                    <input
                      value={docForm.content_type}
                      onChange={(e) => setDocForm((f) => ({ ...f, content_type: e.target.value }))}
                      placeholder="e.g. application/pdf"
                    />
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <textarea
                      value={docForm.notes}
                      onChange={(e) => setDocForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowUpload(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={uploading}>
                    {uploading ? 'Saving…' : 'Add Document'}
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
