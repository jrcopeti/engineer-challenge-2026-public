import { API_URL } from './config'
import { CustomerProfile, FeedbackItem, FeedbackStatus, InternalNote, Metrics, User } from './types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

let onUnauthorized: (() => void) | null = null

/** Called when an authenticated request gets a 401 (expired or revoked token). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  token?: string
  body?: unknown
  signal?: AbortSignal
}

/**
 * Single choke point for every API call: sets headers, checks `res.ok`, turns error
 * bodies into ApiError, and logs the user out when a token is rejected.
 */
async function request<T>(
  path: string,
  { method = 'GET', token, body, signal }: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })

  if (res.status === 401 && token) {
    onUnauthorized?.()
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const message =
      data && typeof data.error === 'string' ? data.error : `Request failed (${res.status})`
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function login(email: string, password: string) {
  return request<{ token: string; user: User }>('/login', {
    method: 'POST',
    body: { email, password },
  })
}

export function fetchInbox(
  page: number,
  status: string,
  search: string,
  token: string,
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ page: String(page), status, q: search })
  return request<{ items: FeedbackItem[]; total: number; page: number }>(`/feedback?${params}`, {
    token,
    signal,
  })
}

export function fetchItem(id: number, token: string) {
  return request<FeedbackItem>(`/feedback/${id}`, { token })
}

export function setStatus(id: number, status: FeedbackStatus, token: string) {
  return request<FeedbackItem>(`/feedback/${id}/status`, {
    method: 'POST',
    token,
    body: { status },
  })
}

export function fetchUsers(token: string) {
  return request<{ users: User[] }>('/users', { token })
}

export function fetchMetrics(token: string) {
  return request<Metrics>('/metrics', { token })
}

export async function downloadExport(status: string, search: string, token: string): Promise<Blob> {
  const params = new URLSearchParams({ status, q: search })
  const res = await fetch(`${API_URL}/export.csv?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) onUnauthorized?.()
  if (!res.ok) throw new ApiError(res.status, 'Export failed')
  return res.blob()
}

export function fetchCustomer(id: number, token: string) {
  return request<CustomerProfile>(`/customers/${id}`, { token })
}

export function updateAssignment(
  id: number,
  data: { assignee_id: number | null; priority: string; due_at: string },
  token: string
) {
  return request<FeedbackItem>(`/feedback/${id}/assignment`, { method: 'POST', token, body: data })
}

export function fetchNotes(id: number, token: string) {
  return request<{ notes: InternalNote[] }>(`/feedback/${id}/notes`, { token })
}

export function addNote(id: number, data: { body: string; is_private: boolean }, token: string) {
  return request<InternalNote>(`/feedback/${id}/notes`, { method: 'POST', token, body: data })
}

export function summarize(id: number, token: string) {
  return request<{ summary: string }>(`/feedback/${id}/summary`, { method: 'POST', token })
}
