import type { Context } from 'grammy';

export interface ReplyParametersExtra {
  reply_parameters?: {
    message_id: number;
    allow_sending_without_reply: boolean;
  };
}

/** Reply to the incoming message when there is one; callback contexts have none. */
export function replyToMessage(ctx: Context): ReplyParametersExtra {
  if (!ctx.msg) return {};
  return {
    reply_parameters: {
      message_id: ctx.msg.message_id,
      allow_sending_without_reply: true,
    },
  };
}
