import {
  telegramMessageOutputSchema,
  telegramMessageOptionsSchema,
  telegramSendMessageRequestSchema,
  telegramSendMessageResponseSchema,
  type TelegramMessageOptions,
  type TelegramMessageOutput,
} from "./schemas";

/**
 * Sends a message to a Telegram chat using the Telegram Bot API.
 *
 * @param input - The message options, including `botToken`, `chatId`, and `message`.
 * @returns A promise that resolves to an output object containing `ok`, `chatId`, and `messageId`.
 * @throws {Error} If the request fails or the API returns an error response.
 *
 * @example
 * const result = await sendTelegramMessage({
 *   botToken: "YOUR_BOT_TOKEN",
 *   chatId: "YOUR_CHAT_ID",
 *   message: "Hello, World!",
 * });
 */
export async function sendTelegramMessage(
  input: TelegramMessageOptions,
): Promise<TelegramMessageOutput> {
  // Validate and parse the input options
  const parsedInput = telegramMessageOptionsSchema.parse(input);

  // Build and validate the request body to match the Telegram API schema
  const requestBody = telegramSendMessageRequestSchema.parse({
    chat_id: parsedInput.chatId,
    text: parsedInput.message,
  });

  // Send the message via the Telegram Bot API
  const response = await fetch(`https://api.telegram.org/bot${parsedInput.botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: await Response.json(requestBody).text(),
  });

  // Parse and validate the API response
  const data = telegramSendMessageResponseSchema.parse(await response.json());

  // Throw an error if the request or API response indicates a failure
  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description ?? "Telegram message request failed");
  }

  // Return the validated output with the relevant message details
  return telegramMessageOutputSchema.parse({
    ok: true,
    chatId: parsedInput.chatId,
    messageId: data.result.message_id,
  });
}
