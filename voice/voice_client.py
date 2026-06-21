"""
Cliente de voz para el bot de Minecraft.

Escucha el micrófono todo el tiempo, detecta cuándo hablas (VAD), transcribe el
audio a texto y manda SOLO el texto al bot por WebSocket. El bot decide qué hacer:
  - Comandos fijos ("ven aqui", "salta", ...) -> se ejecutan directo.
  - Frase libre -> solo si dices la palabra clave "oye bot ...".

La transcripción (STT) tiene 3 backends, configurable con STT_BACKEND:
  - local  : Whisper local en CPU (offline, gratis, más lento). Default.
  - groq   : Groq Whisper large-v3-turbo (rapidísimo y barato). Necesita GROQ_API_KEY.
  - openai : OpenAI transcribe (rápido). Necesita OPENAI_API_KEY.

Uso:
    python voice_client.py            # usa STT_BACKEND del .env / entorno
    python voice_client.py --list     # lista micrófonos

Config (voice/.env o variables de entorno):
    STT_BACKEND    local | groq | openai          (default local)
    GROQ_API_KEY   tu key de Groq                 (si STT_BACKEND=groq)
    OPENAI_API_KEY tu key de OpenAI               (si STT_BACKEND=openai)
    STT_MODEL      override del modelo del backend (opcional)
    WHISPER_MODEL  modelo local: tiny|base|small  (default small, solo backend local)
    BOT_WS_URL     URL del WebSocket del bot       (default ws://localhost:8080)
    MIC_DEVICE     índice del micrófono            (ver --list)
"""

import io
import os
import sys
import time
import wave
import queue
import threading
import collections

import numpy as np
import sounddevice as sd
import webrtcvad
from websocket import create_connection, WebSocketConnectionClosedException

# La consola de Windows usa cp1252 por defecto y crashea al imprimir emojis.
# Forzamos UTF-8 en la salida para evitar UnicodeEncodeError.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

# --- Configuración ---
STT_BACKEND = os.environ.get("STT_BACKEND", "local").lower()
BOT_WS_URL = os.environ.get("BOT_WS_URL", "ws://localhost:8080")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
MIC_DEVICE = os.environ.get("MIC_DEVICE")
MIC_DEVICE = int(MIC_DEVICE) if MIC_DEVICE not in (None, "") else None

# Modo de captura: ptt (push-to-talk, mantener tecla) | vad (escucha continua).
INPUT_MODE = os.environ.get("INPUT_MODE", "ptt").lower()
# Tecla para grabar en modo ptt. F8 no está asignada en Minecraft por defecto.
PTT_KEY = os.environ.get("PTT_KEY", "f8")

# ElevenLabs (respuestas habladas / TTS). Si no hay key, el TTS queda desactivado.
ELEVEN_KEY = os.environ.get("ELEVENLABS_API_KEY")
ELEVEN_VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
ELEVEN_MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")

SAMPLE_RATE = 16000          # webrtcvad solo acepta 8k/16k/32k/48k
FRAME_MS = 30                # tamaño de frame para el VAD (10/20/30 ms)
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000   # 480 muestras
VAD_AGGRESSIVENESS = 3       # 0 (sensible) .. 3 (estricto con el ruido)

# Una frase termina tras este silencio; necesita al menos este tanto de voz.
SILENCE_MS_TO_END = 700
MIN_SPEECH_MS = 400

# Whisper "alucina" estas frases cuando recibe silencio/ruido. Las descartamos.
ALUCINACIONES = {
    "gracias", "gracias.", "muchas gracias", "gracias por ver el video",
    "gracias por ver", "gracias por ver el video hasta el final", "subtitulos",
    "subtitulos realizados por la comunidad de amara org", "amara org",
    "you", "subscribe", "thanks for watching", ".", "...",
}


def es_alucinacion(texto):
    t = texto.lower().strip().strip(".!¡¿? ")
    t = "".join(c for c in t if c.isalnum() or c.isspace()).strip()
    return t in ALUCINACIONES or t == ""


def pcm_to_wav_bytes(pcm):
    """Empaqueta PCM int16 mono en un WAV en memoria (para las APIs cloud)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm)
    buf.seek(0)
    buf.name = "audio.wav"
    return buf


def make_transcriber():
    """Devuelve una función transcribe(pcm_bytes) -> str según STT_BACKEND."""
    if STT_BACKEND == "local":
        from faster_whisper import WhisperModel
        print(f"🧠 Backend LOCAL: cargando Whisper '{WHISPER_MODEL}' (CPU, int8)...")
        model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
        print("✅ Modelo local listo.")

        def transcribe(pcm):
            audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
            segments, _ = model.transcribe(audio, language="es", beam_size=1)
            return "".join(s.text for s in segments).strip()

        return transcribe

    # Backends cloud (Groq y OpenAI comparten el SDK de OpenAI)
    from openai import OpenAI

    if STT_BACKEND == "groq":
        key = os.environ.get("GROQ_API_KEY")
        if not key:
            sys.exit("❌ Falta GROQ_API_KEY (ponla en voice/.env). STT_BACKEND=groq")
        client = OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1")
        model_name = os.environ.get("STT_MODEL", "whisper-large-v3-turbo")
        print(f"☁️  Backend GROQ: modelo '{model_name}'")

    elif STT_BACKEND == "openai":
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            sys.exit("❌ Falta OPENAI_API_KEY (ponla en voice/.env). STT_BACKEND=openai")
        client = OpenAI(api_key=key)
        model_name = os.environ.get("STT_MODEL", "gpt-4o-mini-transcribe")
        print(f"☁️  Backend OPENAI: modelo '{model_name}'")

    else:
        sys.exit(f"❌ STT_BACKEND desconocido: '{STT_BACKEND}'. Usa local | groq | openai.")

    def transcribe(pcm):
        wav = pcm_to_wav_bytes(pcm)
        resp = client.audio.transcriptions.create(
            model=model_name, file=wav, language="es"
        )
        return (resp.text or "").strip()

    return transcribe


def list_devices():
    print(sd.query_devices())


def connect_ws():
    """Conecta al bot, reintentando en silencio hasta que esté disponible."""
    while True:
        try:
            ws = create_connection(BOT_WS_URL)
            print(f"🔌 Conectado al bot en {BOT_WS_URL}")
            return ws
        except Exception:
            print(f"⏳ Esperando al bot en {BOT_WS_URL} ... (¿está corriendo node index.js?)")
            sd.sleep(1500)


def make_sender(transcribe, ws_holder):
    """Devuelve send(pcm): transcribe el audio y lo manda al bot por WebSocket."""
    def send(pcm):
        if len(pcm) < SAMPLE_RATE * 2 * MIN_SPEECH_MS // 1000:
            return  # demasiado corto, probablemente nada
        try:
            texto = transcribe(pcm)
        except Exception as e:
            print(f"⚠️ Error transcribiendo: {e}")
            return
        if not texto:
            return
        if es_alucinacion(texto):
            print(f"🔇 (ignorado, ruido): {texto}")
            return
        print(f"🗣️  {texto}")
        try:
            ws_holder["ws"].send(texto)
        except (WebSocketConnectionClosedException, OSError):
            print("🔌 Conexión perdida, reconectando...")
            ws_holder["ws"] = connect_ws()
            ws_holder["ws"].send(texto)
    return send


def run_ptt(send):
    """Push-to-talk: graba mientras mantienes PTT_KEY, transcribe al soltar."""
    import keyboard
    print(f"🎙️  Push-to-talk listo. Mantén [{PTT_KEY.upper()}] para hablar, suelta para enviar. Ctrl+C para salir.")
    while True:
        keyboard.wait(PTT_KEY)
        print("🔴 Grabando...")
        frames = []
        with sd.RawInputStream(samplerate=SAMPLE_RATE, blocksize=FRAME_SAMPLES,
                               device=MIC_DEVICE, dtype="int16", channels=1) as stream:
            while keyboard.is_pressed(PTT_KEY):
                data, _ = stream.read(FRAME_SAMPLES)
                frames.append(bytes(data))
        print("⏳ Transcribiendo...")
        send(b"".join(frames))


def run_vad(send):
    """Escucha continua: detecta voz con VAD y transcribe cada frase."""
    vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)
    audio_q: "queue.Queue[bytes]" = queue.Queue()

    def audio_callback(indata, frames, time_info, status):
        if status:
            print(f"⚠️ Audio: {status}", file=sys.stderr)
        audio_q.put(bytes(indata))

    preroll = collections.deque(maxlen=int(200 / FRAME_MS))
    triggered = False
    speech_frames = []
    silence_count = 0
    silence_limit = SILENCE_MS_TO_END // FRAME_MS

    print("🎤 Escuchando (VAD). Di \"oye bot ...\" para instrucciones libres. Ctrl+C para salir.")
    with sd.RawInputStream(samplerate=SAMPLE_RATE, blocksize=FRAME_SAMPLES,
                           device=MIC_DEVICE, dtype="int16", channels=1,
                           callback=audio_callback):
        while True:
            frame = audio_q.get()
            if len(frame) < FRAME_SAMPLES * 2:
                continue
            is_speech = vad.is_speech(frame, SAMPLE_RATE)
            if not triggered:
                preroll.append(frame)
                if is_speech:
                    triggered = True
                    speech_frames = list(preroll)
                    preroll.clear()
                    silence_count = 0
            else:
                speech_frames.append(frame)
                if is_speech:
                    silence_count = 0
                else:
                    silence_count += 1
                    if silence_count >= silence_limit:
                        send(b"".join(speech_frames))
                        triggered = False
                        speech_frames = []


def make_speaker():
    """Devuelve speak(texto) que reproduce el texto con ElevenLabs, o None si no hay key."""
    if not ELEVEN_KEY:
        return None
    try:
        from elevenlabs.client import ElevenLabs
        import miniaudio
    except ImportError:
        print("⚠️ Falta instalar 'elevenlabs' y 'miniaudio' para el TTS.")
        return None

    client = ElevenLabs(api_key=ELEVEN_KEY)
    print(f"🔊 TTS ElevenLabs activado (voz {ELEVEN_VOICE}).")

    def speak(texto):
        try:
            chunks = client.text_to_speech.convert(
                voice_id=ELEVEN_VOICE,
                model_id=ELEVEN_MODEL,
                text=texto,
                output_format="mp3_44100_128",
            )
            mp3 = b"".join(chunks)
            decoded = miniaudio.decode(mp3)  # PCM int16
            samples = np.array(decoded.samples, dtype=np.int16)
            if decoded.nchannels > 1:
                samples = samples.reshape(-1, decoded.nchannels)
            sd.play(samples, decoded.sample_rate)
            sd.wait()
        except Exception as e:
            print(f"⚠️ Error TTS: {e}")

    return speak


def run_receiver(ws_holder, speak):
    """Hilo en segundo plano: lee lo que el bot responde y lo lee en voz alta."""
    while True:
        try:
            msg = ws_holder["ws"].recv()
        except Exception:
            time.sleep(0.5)
            continue
        if not msg:
            continue
        texto = msg if isinstance(msg, str) else msg.decode("utf-8", "ignore")
        texto = texto.strip()
        if texto:
            print(f"💬 Bot: {texto}")
            speak(texto)


def main():
    if "--list" in sys.argv:
        list_devices()
        return

    transcribe = make_transcriber()
    ws_holder = {"ws": connect_ws()}
    send = make_sender(transcribe, ws_holder)

    speak = make_speaker()
    if speak:
        threading.Thread(target=run_receiver, args=(ws_holder, speak), daemon=True).start()

    if INPUT_MODE == "ptt":
        run_ptt(send)
    else:
        run_vad(send)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Cerrando cliente de voz.")
