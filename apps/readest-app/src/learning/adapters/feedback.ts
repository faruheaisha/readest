import type { FeedbackPort } from '../ports';

type RequestClient = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class HttpFeedbackAdapter implements FeedbackPort {
  constructor(
    private readonly dependencies: {
      guestId: () => string;
      accessToken: () => string | null;
      request?: RequestClient;
    },
  ) {}

  async submit(input: Parameters<FeedbackPort['submit']>[0]): Promise<string> {
    const token = this.dependencies.accessToken();
    const request = this.dependencies.request ?? globalThis.fetch.bind(globalThis);
    const response = await request('/api/v1/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        guestId: this.dependencies.guestId(),
        message: input.message,
        diagnosticConsent: input.diagnosticConsent,
        ...(input.diagnosticConsent && input.diagnostics ? { diagnostics: input.diagnostics } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`Feedback submission failed with status ${response.status}`);
    }
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== 'object' ||
      typeof (result as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Feedback response did not contain an id');
    }
    return (result as { id: string }).id;
  }
}
