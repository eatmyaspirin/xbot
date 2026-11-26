import type { Context } from 'grammy';
import type { Chat } from 'grammy/types';

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

/** Accepts numeric Telegram chat IDs, including negative group/channel IDs. */
export function parseChatId(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d{1,20}$/.test(trimmed)) return null;

  const id = Number(trimmed);
  if (!Number.isSafeInteger(id) || id === 0) return null;
  return id;
}

export function chatTitle(chat: Chat): string | undefined {
  if ('title' in chat && chat.title) return chat.title;
  if ('first_name' in chat) {
    return [chat.first_name, chat.last_name].filter(Boolean).join(' ') || undefined;
  }
  return undefined;
}
