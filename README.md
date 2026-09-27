# MAEK7 Creative Studio

Real image/video generation studio with a local server-side provider layer.

## Start
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Add at least one provider key.
4. Run:
   `npm install`
   `npm start`
5. Open `http://127.0.0.1:3000`

## Providers
- OpenAI: GPT Image + Sora 2 / Sora 2 Pro.
- Google Gemini: Nano Banana 2 image generation/editing + Veo 3.1 video.
- fal.ai: generic image/video endpoint bridge through FAL_KEY.
- Custom OpenAI-compatible image provider.

Keys are never stored in browser localStorage. Browser stores only local project history and UI settings.
