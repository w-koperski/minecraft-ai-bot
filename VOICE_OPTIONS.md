# Voice Interface Options

## Overview

Multiple ways to interact with the Minecraft bot using voice commands.

## Option A: Voice Input → Text Output ⭐ RECOMMENDED

**Best for:** Headless servers, remote control

**Flow:**
```
You (voice) → Whisper STT → Text command → Bot executes → Text response (Telegram/Discord)
```

**Advantages:**
- ✅ Works on headless server (no audio output needed)
- ✅ Faster (~2-3s vs ~4-5s with TTS)
- ✅ Read responses at your own pace
- ✅ Works remotely without audio forwarding
- ✅ Easiest to set up

### Implementation

#### Method 1: Telegram Voice Messages (Easiest)

1. Send voice message to OpenClaw bot on Telegram
2. OpenClaw auto-transcribes with Whisper
3. Bot receives text command
4. Bot executes and responds with text

**No additional code needed!** OpenClaw handles transcription automatically.

#### Method 2: Manual Upload

```bash
# On your machine: record voice
arecord -d 5 -f cd -t wav voice-command.wav

# Upload to server
scp voice-command.wav server:/tmp/

# On server: transcribe
whisper /tmp/voice-command.wav --model base --language pl --output_format txt --output_dir /tmp

# Set goal
echo "{\"goal\": \"$(cat /tmp/voice-command.txt)\"}" > state/commands.json
```

---

## Option B: Discord Voice Bot

**Best for:** Streaming, group play, real-time voice chat

**Flow:**
```
You (Discord voice) → Bot listens → Whisper STT → Bot executes → TTS → Bot speaks in Discord
```

**Advantages:**
- ✅ Real-time voice communication
- ✅ Works on headless server
- ✅ Multiple people can talk to bot
- ✅ Good for streaming/recording

**Disadvantages:**
- ⚠️ Slower (~4-5s latency)
- ⚠️ Requires Discord bot setup
- ⚠️ Needs TTS installation

### Implementation

1. **Install dependencies**
```bash
npm install @discordjs/voice discord.js @discordjs/opus sodium-native ffmpeg-static
```

2. **Create Discord bot** (see docs/COMPANION_FEATURES.md for voice integration)

3. **Add to .env**
```env
DISCORD_BOT_TOKEN=your-token
DISCORD_GUILD_ID=your-guild
DISCORD_VOICE_CHANNEL_ID=your-channel
```

4. **Run**
```bash
node src/discord-voice.js
```

---

## Option C: Mumble Voice Bot

**Best for:** Low-latency voice chat, privacy-focused

**Flow:**
```
You (Mumble) → Bot listens → Whisper STT → Bot executes → TTS → Bot speaks in Mumble
```

**Advantages:**
- ✅ Lower latency than Discord
- ✅ Open source, self-hosted
- ✅ Better audio quality
- ✅ Works on headless server

**Disadvantages:**
- ⚠️ Requires Mumble server
- ⚠️ More complex setup
- ⚠️ Needs TTS installation

### Implementation

1. **Install dependencies**
```bash
npm install mumble
```

2. **Create Mumble bot** (see docs/COMPANION_FEATURES.md for voice integration)

3. **Add to .env**
```env
MUMBLE_URL=mumble://server:64738
MUMBLE_KEY=/path/to/key.pem
MUMBLE_CERT=/path/to/cert.pem
```

4. **Run**
```bash
node src/mumble-voice.js
```

---

## Option D: Local Voice (with audio devices)

**Best for:** Local setup with microphone/speakers

**Flow:**
```
You (microphone) → Record → Whisper STT → Bot executes → TTS → Speakers
```

**Advantages:**
- ✅ Direct audio I/O
- ✅ No network latency

**Disadvantages:**
- ❌ Doesn't work on headless server
- ❌ Requires audio devices
- ❌ Not suitable for remote control

### Implementation

See docs/COMPANION_FEATURES.md for voice integration details

---

## Comparison Table

| Option | Latency | Headless | Setup | Network | Use Case |
|--------|---------|----------|-------|---------|----------|
| **A: Voice → Text** | ~2-3s | ✅ Yes | ⭐ Easy | Any | **Recommended** |
| **B: Discord Voice** | ~4-5s | ✅ Yes | Medium | Discord | Streaming, groups |
| **C: Mumble Voice** | ~3-4s | ✅ Yes | Medium | Mumble | Low-latency chat |
| **D: Local Voice** | ~4-5s | ❌ No | Hard | None | Local only |

---

## Recommendation

**Start with Option A (Voice → Text):**
1. Easiest to set up
2. Works on headless server
3. Fastest response time
4. No additional dependencies
5. Works with Telegram voice messages

**Upgrade to Option B/C later if you need:**
- Real-time voice conversation
- Streaming/recording with bot commentary
- Multiple people talking to bot

---

## Example Usage

### Option A: Telegram Voice

1. Open Telegram chat with OpenClaw bot
2. Hold voice message button
3. Say: "Zbuduj dom z drewna"
4. Release button
5. Bot responds: "Wykonuję: zbuduj dom z drewna. Szukam drzew..."

### Option B: Discord Voice

1. Join Discord voice channel with bot
2. Say: "Znajdź diamenty"
3. Bot responds (voice): "Szukam diamentów. Schodzę na poziom Y=11..."

### Option C: Mumble Voice

1. Connect to Mumble server
2. Join channel with bot
3. Say: "Zbierz 64 kamienia"
4. Bot responds (voice): "Zbieranie kamienia. Znalazłem żyłę..."

---

## Technical Details

### STT (Speech-to-Text)
- **Tool:** Whisper (OpenAI)
- **Model:** base (fastest, good accuracy)
- **Language:** Polish (configurable)
- **Latency:** ~1-2s

### TTS (Text-to-Speech)
- **Tool:** sherpa-onnx-tts (local, offline)
- **Model:** vits-piper-en_US-lessac-high
- **Latency:** ~1s
- **Quality:** Good, natural-sounding

### Audio Processing
- **Format:** WAV, 16-bit, 48kHz (Discord/Mumble)
- **Codec:** PCM → WAV conversion via ffmpeg
- **Streaming:** Real-time audio streaming for voice bots

---

## Installation Requirements

### All Options
- Whisper: `/home/linuxbrew/.linuxbrew/bin/whisper` ✅ Already installed

### Option A (Voice → Text)
- No additional requirements ✅

### Option B (Discord Voice)
- Node.js packages: `@discordjs/voice`, `discord.js`, `@discordjs/opus`, `sodium-native`
- System: `ffmpeg` (for audio conversion)
- sherpa-onnx-tts (for TTS output)

### Option C (Mumble Voice)
- Node.js package: `mumble`
- System: `ffmpeg`
- sherpa-onnx-tts (for TTS output)
- Mumble server (self-hosted or public)

### Option D (Local Voice)
- System: `arecord`, `aplay` (ALSA tools)
- sherpa-onnx-tts (for TTS output)
- Audio devices (microphone, speakers)

---

## Next Steps

1. **Choose your option** based on use case
2. **Follow implementation guide** in docs/COMPANION_FEATURES.md
3. **Test with simple commands** first
4. **Tune Whisper model** if accuracy is low (try `small` or `medium`)
5. **Adjust TTS voice** if needed (see sherpa-onnx-tts skill)

---

## Troubleshooting

### Whisper transcription is inaccurate
- Try larger model: `--model small` or `--model medium`
- Speak clearly and slowly
- Reduce background noise
- Check language setting: `--language pl`

### Discord bot won't join voice channel
- Check bot permissions (Connect, Speak, Use Voice Activity)
- Verify guild ID and channel ID in .env
- Check bot token is valid

### Mumble bot won't connect
- Verify Mumble server URL and port
- Check SSL certificates (key.pem, cert.pem)
- Test connection with Mumble client first

### TTS sounds robotic
- Try different voice model (see sherpa-onnx-tts releases)
- Adjust speaking rate (if supported by model)
- Use punctuation in text for better prosody

### High latency
- Use faster Whisper model: `tiny` or `base`
- Reduce audio recording duration
- Check network latency (for Discord/Mumble)
- Use local voice option if possible

---

## Future Improvements

- [ ] Wake word detection ("Hey bot, ...")
- [ ] Continuous listening (no button press)
- [ ] Voice activity detection (VAD)
- [ ] Multi-language support
- [ ] Custom TTS voices
- [ ] Emotion detection in voice
- [ ] Voice command history
- [ ] Voice shortcuts/macros
