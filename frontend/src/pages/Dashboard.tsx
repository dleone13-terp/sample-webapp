import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { billsApi, customersApi } from '../api';
import type { Bill, BillStatus } from '../types';
import { STATUS_LABELS, STATUS_COLORS } from '../types';
import { StatusBadge } from '../components/StatusBadge';

const STATUS_LIST: BillStatus[] = [
  'draft', 'submitted', 'picked_up', 'in_transit',
  'out_for_delivery', 'delivered', 'invoiced', 'paid', 'disputed', 'cancelled',
];

export default function Dashboard() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([billsApi.list(), customersApi.list()])
      .then(([b, c]) => {
        setBills(b);
        setCustomerCount(c.length);
      })
      .finally(() => setLoading(false));
  }, []);

  const statusCounts = STATUS_LIST.reduce<Record<string, number>>((acc, s) => {
    acc[s] = bills.filter((b) => b.status === s).length;
    return acc;
  }, {});

  const activeBills = bills.filter(
    (b) => !['paid', 'cancelled'].includes(b.status)
  );
  const totalAmount = bills
    .filter((b) => b.amount !== null)
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);

  const recentBills = [...bills].slice(0, 5);

  if (loading) return <div className="page-body">Loading…</div>;

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <Link to="/bills">
          <button className="btn-primary btn-icon">
            <span>+</span> New Bill
          </button>
        </Link>
      </div>
      <div className="page-body">
        {/* Summary stats */}
        <div className="stats-grid mb-4">
          <div className="stat-card">
            <div className="stat-label">Total Bills</div>
            <div className="stat-value">{bills.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active</div>
            <div className="stat-value">{activeBills.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Customers</div>
            <div className="stat-value">{customerCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Revenue</div>
            <div className="stat-value">
              ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="card mb-4">
          <div className="card-header">
            <h3>Bills by Status</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {STATUS_LIST.filter((s) => statusCounts[s] > 0).map((s) => (
                <Link key={s} to={`/bills?status=${s}`} style={{ textDecoration: 'none' }}>
                  <div
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      background: STATUS_COLORS[s] + '15',
                      border: `1px solid ${STATUS_COLORS[s]}30`,
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: STATUS_COLORS[s],
                      }}
                    >
                      {statusCounts[s]}
                    </span>
                    <span style={{ fontSize: '0.8125rem', color: '#374151' }}>
                      {STATUS_LABELS[s]}
                    </span>
                  </div>
                </Link>
              ))}
              {bills.length === 0 && (
                <p className="text-gray text-sm">No bills yet. <Link to="/bills">Create your first bill →</Link></p>
              )}
            </div>
          </div>
        </div>

        {/* Recent bills */}
        <div className="card">
          <div className="card-header">
            <h3>Recent Bills</h3>
            <Link to="/bills" className="text-sm">View all →</Link>
          </div>
          {recentBills.length === 0 ? (
            <div className="empty-state">
              <p>No bills yet</p>
              <Link to="/bills">
                <button className="btn-primary">Create First Bill</button>
              </Link>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Bill #</th>
                    <th>Customer</th>
                    <th>Route</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBills.map((bill) => (
                    <tr key={bill.id}>
                      <td>
                        <Link to={`/bills/${bill.id}`}>{bill.bill_number}</Link>
                      </td>
                      <td>{bill.customer_name ?? '—'}</td>
                      <td style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                        {bill.origin_city && bill.destination_city
                          ? `${bill.origin_city} → ${bill.destination_city}`
                          : '—'}
                      </td>
                      <td>
                        <StatusBadge status={bill.status} />
                      </td>
                      <td>
                        {bill.amount != null
                          ? `$${bill.amount.toLocaleString()}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
