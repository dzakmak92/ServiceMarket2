import React from 'react';
import { useParams, Navigate } from 'react-router-dom';

/**
 * `/invoice-from-project/:id` → `/jobs/:id/invoice`.
 *
 * There is nothing to resolve. This fetched `GET /api/jobs/{id}` and read
 * `r.data.job_id` — a column `jobs` does not have, because the job *is* the
 * row — so it always fell back to the literal string 'none' and navigated to
 * `/jobs/none/invoice`. That URL is the target of the "create invoice" link
 * on the job overview and of the approved-Nachtrag button on the billing tab,
 * so both led to a dead page.
 *
 * Kept as a route rather than deleted: links to it exist in the wild, and a
 * redirect is cheaper than hunting every one of them down.
 */
export default function InvoiceFromProjectRedirect() {
  const { id } = useParams();
  const co = new URLSearchParams(window.location.search).get('co');
  return <Navigate to={`/jobs/${id}/invoice${co ? `?from_co=${co}` : ''}`} replace />;
}
