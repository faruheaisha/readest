import { validateUserAndToken } from '@/utils/access';
import { streamText, createGateway } from 'ai';
import type { ModelMessage } from 'ai';
import { USAGE_TYPES, UsageStatsManager } from '@/utils/usage';

const DEFAULT_DAILY_AI_ACTION_QUOTA = 10;
const AI_DAILY_QUOTA_EXCEEDED = 'AI_DAILY_QUOTA_EXCEEDED';
const DEFAULT_PLATFORM_AI_MODEL = 'google/gemini-2.5-flash-lite';
const MAX_PLATFORM_INPUT_CHARS = 12_000;

const getDailyAIActionQuota = (): number => {
  const configured = Number.parseInt(process.env['AI_DAILY_ACTION_QUOTA'] ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DAILY_AI_ACTION_QUOTA;
};

export async function POST(req: Request): Promise<Response> {
  try {
    const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
    if (!user || !token) {
      return Response.json({ error: 'Not authenticated' }, { status: 403 });
    }

    const { messages, system, apiKey, model } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const usesPlatformAllowance = !apiKey;
    const gatewayApiKey = apiKey || process.env['AI_GATEWAY_API_KEY'];
    if (!gatewayApiKey) {
      return new Response(JSON.stringify({ error: 'API key required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (usesPlatformAllowance) {
      const inputLength =
        (typeof system === 'string' ? system.length : 0) + JSON.stringify(messages).length;
      if (messages.length > 20 || inputLength > MAX_PLATFORM_INPUT_CHARS) {
        return Response.json({ error: 'AI_INPUT_TOO_LARGE' }, { status: 413 });
      }
    }

    if (usesPlatformAllowance) {
      const quota = getDailyAIActionQuota();
      const usage = await UsageStatsManager.getCurrentUsage(
        user.id,
        USAGE_TYPES.AI_ACTIONS,
        'daily',
      );
      if (usage >= quota) {
        return Response.json({ error: AI_DAILY_QUOTA_EXCEEDED, quota, usage }, { status: 429 });
      }
      const consumed = await UsageStatsManager.trackUsage(user.id, USAGE_TYPES.AI_ACTIONS, 1, {
        source: 'english_learning_action',
      });
      if (consumed <= 0) {
        return Response.json({ error: 'AI_USAGE_TRACKING_UNAVAILABLE' }, { status: 503 });
      }
      if (consumed > quota) {
        return Response.json(
          { error: AI_DAILY_QUOTA_EXCEEDED, quota, usage: consumed },
          { status: 429 },
        );
      }
    }

    const gateway = createGateway({ apiKey: gatewayApiKey });
    const languageModel = gateway(
      usesPlatformAllowance
        ? process.env['AI_PLATFORM_MODEL'] || DEFAULT_PLATFORM_AI_MODEL
        : model || DEFAULT_PLATFORM_AI_MODEL,
    );

    const result = streamText({
      model: languageModel,
      system: system || 'You are a helpful assistant.',
      messages: messages as ModelMessage[],
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('AI chat request failed', error);
    return new Response(JSON.stringify({ error: 'Chat failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
