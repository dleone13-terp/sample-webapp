import type { Bill, BillStatus, Customer, BillDocument } from '../types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(url, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as T;
}

// Customers
export const customersApi = {
  list: () => request<Customer[]>(`${BASE}/customers`),
  get: (id: number) => request<Customer>(`${BASE}/customers/${id}`),
  create: (body: Partial<Customer>) =>
    request<Customer>(`${BASE}/customers`, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<Customer>) =>
    request<Customer>(`${BASE}/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: number) =>
    request<{ success: boolean }>(`${BASE}/customers/${id}`, { method: 'DELETE' }),
};

// Bills
export const billsApi = {
  list: (params?: { status?: string; customer_id?: number; search?: string }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : '';
    return request<Bill[]>(`${BASE}/bills${qs}`);
  },
  get: (id: number) => request<Bill>(`${BASE}/bills/${id}`),
  create: (body: Partial<Bill>) =>
    request<Bill>(`${BASE}/bills`, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<Bill>) =>
    request<Bill>(`${BASE}/bills/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: number) =>
    request<{ success: boolean }>(`${BASE}/bills/${id}`, { method: 'DELETE' }),
  updateStatus: (id: number, status: BillStatus, description?: string) =>
    request<Bill>(`${BASE}/bills/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, description }),
    }),
  addDocument: (id: number, formData: FormData) =>
    request<BillDocument>(`${BASE}/bills/${id}/documents`, {
      method: 'POST',
      body: formData,
    }),
  deleteDocument: (billId: number, docId: number) =>
    request<{ success: boolean }>(`${BASE}/bills/${billId}/documents/${docId}`, {
      method: 'DELETE',
    }),
};
