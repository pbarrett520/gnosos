export type ElevenLabsClientOptions = {
  apiKey?: string;
  voiceId?: string;
};

export function createElevenLabsClient(opts: ElevenLabsClientOptions) {
  return {
    async say(message: string): Promise<void> {
      if (!opts.apiKey || !opts.voiceId) return; // no-op without credentials
      try {
        await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}/stream`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "xi-api-key": opts.apiKey,
          },
          body: JSON.stringify({ text: message, model_id: "eleven_turbo_v2" }),
        });
      } catch {
        // swallow errors in fire-and-forget mode
      }
    },
  };
}
