import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Loader2 } from 'lucide-react';

/**
 * Resolves a PM project's job_id then redirects to the existing invoice
 * editor with `?from_project=<id>` so the editor knows to import the
 * project's materials + labour as prefilled line items.
 */
export default function InvoiceFromProjectRedirect() {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const co = new URLSearchParams(window.location.search).get('co');
    api.get(`/api/jobs/${id}`)
      .then((r) => {
        if (cancelled) return;
        const jobId = r.data?.job_id || 'none';
        const coParam = co ? `&from_co=${co}` : '';
        navigate(`/jobs/${jobId}/invoice?from_project=${id}${coParam}`, { replace: true });
      })
      .catch(() => navigate('/projects', { replace: true }));
    return () => { cancelled = true; };
  }, [id, navigate]);

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center" data-testid="pm-invoice-redirect">
      <Loader2 size={28} className="text-teal animate-spin" />
    </div>
  );
}
