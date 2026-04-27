import { useMutation } from '@tanstack/react-query';
import type { InquiryRecommendation } from '../../../types/inventoryInquiry';

interface RequestArgs {
  skuCode: string;
  notes?: string;
}

async function requestInquiryRecommendation(args: RequestArgs): Promise<InquiryRecommendation> {
  const response = await fetch(`/api/v1/inventory/inquiry/${encodeURIComponent(args.skuCode)}/ai-recommendation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: args.notes ?? '' }),
  });

  if (!response.ok) {
    const rawText = await response.text();
    let body: any = {};
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      body = {};
    }
    const message =
      typeof body?.error?.devDetail === 'string'
        ? body.error.devDetail
        : typeof body?.error?.message === 'string'
        ? body.error.message
        : rawText.trim()
        ? rawText.trim()
        : `AI recommendation failed: ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

export function useInquiryRecommendation() {
  return useMutation({
    mutationFn: requestInquiryRecommendation,
  });
}
