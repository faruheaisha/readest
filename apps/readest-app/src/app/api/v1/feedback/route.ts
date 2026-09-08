import { feedbackSubmissionSchema } from '@/learning/contracts';
import { validateUserAndToken } from '@/utils/access';
import { createSupabaseAdminClient } from '@/utils/supabase';

const problem = (status: number, detail: string, code: string): Response =>
  Response.json(
    {
      type: `https://english-learning-os.local/problems/${code}`,
      title: status >= 500 ? 'Feedback service unavailable' : 'Invalid feedback request',
      status,
      detail,
      code,
    },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, 'The request body must be valid JSON.', 'INVALID_JSON');
  }

  const parsed = feedbackSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, 'The feedback payload is invalid.', 'INVALID_FEEDBACK');
  }

  let userId: string | null = null;
  const authorization = request.headers.get('authorization');
  if (authorization) {
    const { user, token } = await validateUserAndToken(authorization);
    if (!user || !token) {
      return problem(401, 'The supplied session is invalid.', 'INVALID_SESSION');
    }
    userId = user.id;
  }

  const input = parsed.data;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('learning_feedback')
    .insert({
      user_id: userId,
      guest_id: input.guestId,
      message: input.message,
      diagnostic_consent: input.diagnosticConsent,
      diagnostics: input.diagnosticConsent ? (input.diagnostics ?? {}) : {},
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    console.error('Feedback submission failed', error?.message ?? 'missing feedback id');
    return problem(503, 'Feedback could not be stored. Please retry.', 'FEEDBACK_UNAVAILABLE');
  }

  return Response.json({ id: data.id }, { status: 201 });
}
