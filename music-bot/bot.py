"""Private music publisher. The browser only talks to the authenticated Java API."""
import asyncio
import array
import math
import sys
import contextlib
import hmac
import json
import os
import re
import signal
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from aiohttp import web

IDENTITY = "music-bot"
MAX_SECONDS = 20 * 60
MAX_QUEUE = 30
RHYTHM_SECONDS = 5 * 60
RHYTHM_MAX_NOTES = 1200
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
YTDLP = ["yt-dlp", "--ignore-config", "--no-plugin-dirs", "--no-cache-dir", "--no-playlist",
         "--no-warnings", "--socket-timeout", "15", "--retries", "1",
         "--js-runtimes", "node", "--use-extractors", "youtube.*"]


def query_target(value):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 200:
        raise ValueError("Digite um nome ou link do YouTube (até 200 caracteres).")
    value = value.strip()
    if any(ord(char) < 32 for char in value):
        raise ValueError("Busca inválida.")
    if VIDEO_ID.fullmatch(value):
        return "https://www.youtube.com/watch?v=" + value
    if "://" in value or value.startswith(("www.", "youtu.be/", "youtube.com/")):
        parsed = urlparse(value if "://" in value else "https://" + value)
        if parsed.scheme not in ("http", "https") or parsed.username or parsed.password or parsed.port:
            raise ValueError("Use um link público de vídeo do YouTube.")
        host = (parsed.hostname or "").lower()
        video = None
        if host == "youtu.be":
            video = parsed.path.strip("/")
        elif host in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"):
            if parsed.path == "/watch":
                video = parse_qs(parsed.query).get("v", [""])[0]
            elif parsed.path.startswith(("/shorts/", "/live/")):
                video = parsed.path.split("/")[2]
        if not video or not VIDEO_ID.fullmatch(video):
            raise ValueError("Use um link de vídeo do YouTube; playlists não são aceitas.")
        return "https://www.youtube.com/watch?v=" + video
    # The prefix prevents flags, URLs and alternate yt-dlp extractors from being interpreted.
    return "ytsearch5:" + value


def song(info, requested_by=""):
    video = info.get("id", "")
    if not isinstance(video, str) or not VIDEO_ID.fullmatch(video):
        raise ValueError("Vídeo indisponível.")
    duration = info.get("duration")
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
        raise ValueError("Transmissões ao vivo não são aceitas.")
    if duration is not None and (not isinstance(duration, (int, float)) or not 0 < duration <= MAX_SECONDS):
        raise ValueError("Escolha uma música de até 20 minutos.")
    return {"videoId": video, "title": str(info.get("title") or "Música")[:240],
            "duration": duration, "url": "https://www.youtube.com/watch?v=" + video,
            "requestedBy": str(requested_by)[:64]}


async def terminate(process):
    if process is not None and process.returncode is None:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGTERM)
        try:
            await asyncio.wait_for(process.wait(), 3)
        except asyncio.TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
            await process.wait()


async def metadata(target, flat=False):
    args = YTDLP + ["--dump-single-json", "--skip-download"]
    if flat:
        args += ["--flat-playlist", "--playlist-end", "5"]
    process = await asyncio.create_subprocess_exec(
        *args, "--", target, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        limit=2 * 1024 * 1024, start_new_session=True)
    try:
        # Bound output as well as wall clock; never echo extractor errors or media URLs.
        async with asyncio.timeout(40):
            try:
                data = await process.stdout.readexactly(2 * 1024 * 1024 + 1)
            except asyncio.IncompleteReadError as end:
                data = end.partial
            else:
                raise ValueError("Resposta do YouTube muito grande.")
            await process.wait()
        if process.returncode:
            raise ValueError("O YouTube não respondeu. Tente outra música ou tente novamente mais tarde.")
        return json.loads(data)
    finally:
        await terminate(process)


class Player:
    def __init__(self):
        self.queue = []
        self.current = None
        self.status = "idle"
        self.error = None
        self.task = None
        self.lock = asyncio.Lock()
        self.resolvers = asyncio.Semaphore(2)
        self.playing = asyncio.Event()
        self.playing.set()
        self.token = ""
        self.room = None
        self.source = None
        self.closed = False
        self.elapsed = 0.0
        self.last_listeners = time.monotonic()
        self.catalog = {}
        self.rhythm_id = None
        self.rhythm_phase = "idle"
        self.rhythm_data = None
        self.rhythm_pcm = b""
        self.rhythm_task = None
        self.rhythm_expires = 0.0
        self.rhythm_starts = 0


    def snapshot(self):
        return {"status": self.status, "current": self.current,
                "queue": list(self.queue), "error": self.error, "elapsed": int(self.elapsed),
                "rhythm": None if not self.rhythm_id else {"id": self.rhythm_id, "phase": self.rhythm_phase,
                  "startsAt": self.rhythm_starts, "durationMs": (self.rhythm_data or {}).get("durationMs", 0)}}

    async def search(self, query):
        target = query_target(query)
        async with asyncio.timeout(42):
            async with self.resolvers:
                data = await metadata(target, flat=target.startswith("ytsearch"))
        result = []
        for entry in data.get("entries", [data]):
            if entry:
                try:
                    result.append(song(entry))
                except ValueError:
                    pass
        for entry in result:
            self.catalog[entry["videoId"]] = (time.monotonic(), entry)
        while len(self.catalog) > 100:
            self.catalog.pop(next(iter(self.catalog)))
        return result[:5]

    def spawn(self):
        self.task = asyncio.create_task(self.run())
        # Enqueue may arrive while the previous runner awaits disconnect. Recheck under
        # the command lock after its finalizer, rather than stranding that new queue.
        self.task.add_done_callback(lambda task: asyncio.create_task(self.ensure_running()))

    async def ensure_running(self):
        async with self.lock:
            if self.queue and not self.closed and (not self.task or self.task.done()):
                self.spawn()

    async def enqueue(self, video, who, token):
        if not isinstance(video, str) or not VIDEO_ID.fullmatch(video):
            raise ValueError("Vídeo inválido.")
        async with self.lock:
            if self.rhythm_id:
                raise ValueError("O bot está reservado para uma partida de ritmo.")
            if len(self.queue) >= MAX_QUEUE:
                raise ValueError("A fila está cheia (30 músicas).")
            # Metadata is resolved by the playback task; enqueue never leaves stale pending work
            # behind when another listener stops the player during a network request.
            item = song({"id": video, "title": "Carregando música…"}, who)
            cached = self.catalog.get(video)
            if cached and time.monotonic() - cached[0] < 600:
                item.update(cached[1], requestedBy=str(who)[:64])
            item["id"] = str(uuid.uuid4())
            self.queue.append(item)
            self.token = token
            self.error = None
            if not self.task or self.task.done():
                self.spawn()
            return self.snapshot()

    async def disconnect(self):
        if self.source:
            self.source.clear_queue()
            await self.source.aclose()
            self.source = None
        if self.room:
            await self.room.disconnect()
            self.room = None

    async def connect(self):
        from livekit import rtc
        if self.room and self.room.isconnected():
            return
        await self.disconnect()
        self.room = rtc.Room()
        await asyncio.wait_for(self.room.connect(
            os.getenv("LIVEKIT_URL", "ws://livekit:7880"), self.token,
            options=rtc.RoomOptions(auto_subscribe=False)), 20)
        self.source = rtc.AudioSource(48000, 2, queue_size_ms=100)
        track = rtc.LocalAudioTrack.create_audio_track("Música", self.source)
        options = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
        options.audio_encoding.max_bitrate = 128000
        await self.room.local_participant.publish_track(track, options)
        self.last_listeners = time.monotonic()

    async def play(self, item):
        from livekit import rtc
        async with asyncio.timeout(45):
            async with self.resolvers:
                info = await metadata(item["url"])
        resolved = song(info, item["requestedBy"])
        # Full metadata must have finite duration; live/unbounded media fails closed.
        if resolved["duration"] is None:
            raise ValueError("Não foi possível confirmar a duração desta música.")
        item.update(resolved)
        await self.connect()
        read_fd, write_fd = os.pipe()
        extractor = decoder = None
        try:
            extractor = await asyncio.create_subprocess_exec(
                *YTDLP, "-f", "bestaudio", "-o", "-", "--", item["url"],
                stdout=write_fd, stderr=asyncio.subprocess.DEVNULL, start_new_session=True)
            decoder = await asyncio.create_subprocess_exec(
                "ffmpeg", "-nostdin", "-loglevel", "error", "-protocol_whitelist", "pipe",
                "-i", "pipe:0", "-vn", "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1",
                stdin=read_fd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                start_new_session=True)
        except BaseException:
            await terminate(extractor)
            raise
        finally:
            os.close(read_fd)
            os.close(write_fd)
        try:
            # Pausing backpressures ffmpeg and yt-dlp; no disk cache or full-song download.
            while self.elapsed < MAX_SECONDS:
                await self.playing.wait()
                try:
                    data = await asyncio.wait_for(decoder.stdout.readexactly(960 * 2 * 2), 30)
                except asyncio.IncompleteReadError:
                    break
                await self.playing.wait()
                self.status = "playing"
                await self.source.capture_frame(rtc.AudioFrame(data, 48000, 2, 960))
                self.elapsed += .02
                if self.room.remote_participants:
                    self.last_listeners = time.monotonic()
                elif time.monotonic() - self.last_listeners > 30:
                    self.queue.clear()
                    break
            if self.elapsed == 0:
                raise ValueError("Não foi possível reproduzir esta música. O YouTube pode estar bloqueando o acesso.")
            await self.source.wait_for_playout()
        finally:
            await terminate(decoder)
            await terminate(extractor)
            if self.source:
                self.source.clear_queue()

    async def run(self):
        try:
            while self.queue:
                self.current = self.queue.pop(0)
                self.elapsed = 0.0
                self.status = "loading"
                self.playing.set()
                try:
                    await self.play(self.current)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    self.error = "Não foi possível tocar a música; o YouTube pode estar indisponível ou bloquear o servidor."
                finally:
                    self.current = None
            self.status = "idle"
        finally:
            await self.disconnect()
            self.status = "idle"
            self.current = None

    async def control(self, action):
        async with self.lock:
            if self.rhythm_id:
                raise ValueError("O bot está reservado para uma partida de ritmo.")
            if action in ("pause", "resume"):
                if not self.current or self.status == "loading":
                    raise ValueError("Aguarde uma música começar a tocar.")
                if action == "pause":
                    self.playing.clear()
                    if self.source:
                        self.source.clear_queue()
                    self.status = "paused"
                else:
                    self.playing.set()
                    self.status = "playing"
            elif action in ("skip", "stop"):
                if action == "stop":
                    self.queue.clear()
                if self.task and not self.task.done():
                    self.task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await self.task
                self.task = None
                self.current = None
                self.status = "idle"
                self.elapsed = 0.0
                if self.queue and action == "skip":
                    self.spawn()
            else:
                raise ValueError("Controle inválido.")
            return self.snapshot()

    async def remove(self, item_id):
        async with self.lock:
            self.queue = [item for item in self.queue if item["id"] != item_id]
            return self.snapshot()

    async def check_idle(self):
        if self.rhythm_id:
            if time.monotonic() > self.rhythm_expires:
                await self.release_rhythm(self.rhythm_id)
            return
        if self.room:
            if self.room.remote_participants:
                self.last_listeners = time.monotonic()
            elif time.monotonic() - self.last_listeners > 30:
                await self.control("stop")


    async def prepare_rhythm(self, session, video, who, token):
        try:
            uuid.UUID(session)
        except (ValueError, TypeError, AttributeError):
            raise ValueError("Sessão inválida.")
        if not isinstance(video, str) or not VIDEO_ID.fullmatch(video):
            raise ValueError("Vídeo inválido.")
        async with self.lock:
            if self.rhythm_id == session and self.rhythm_data:
                return self.rhythm_data
            if self.rhythm_id or self.current or self.queue or (self.task and not self.task.done()):
                raise ValueError("O bot precisa estar livre para a partida de ritmo.")
            self.rhythm_id = session
            self.rhythm_phase = "preparing"
            self.rhythm_expires = time.monotonic() + 180
            self.token = token
            self.error = None
            self.elapsed = 0.0
        extractor = decoder = None
        read_fd = write_fd = None
        try:
            async with self.resolvers:
                async with asyncio.timeout(100):
                    info = await metadata(query_target(video))
                    item = song(info, who)
                    if item["duration"] is None or item["duration"] < 15:
                        raise ValueError("Escolha uma música com pelo menos 15 segundos.")
                    if self.rhythm_id != session:
                        raise ValueError("Preparação cancelada.")
                    self.current = item
                    self.status = "loading"
                    read_fd, write_fd = os.pipe()
                    extractor = await asyncio.create_subprocess_exec(
                        *YTDLP, "-f", "bestaudio", "-o", "-", "--", item["url"],
                        stdout=write_fd, stderr=asyncio.subprocess.DEVNULL, start_new_session=True)
                    decoder = await asyncio.create_subprocess_exec(
                        "ffmpeg", "-nostdin", "-loglevel", "error", "-protocol_whitelist", "pipe",
                        "-i", "pipe:0", "-t", str(RHYTHM_SECONDS), "-vn", "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1",
                        stdin=read_fd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, start_new_session=True)
                    os.close(read_fd); read_fd = None
                    os.close(write_fd); write_fd = None
                    chunks = []
                    count = 0
                    maximum = RHYTHM_SECONDS * 48000 * 2 * 2
                    while count < maximum:
                        chunk = await decoder.stdout.read(min(65536, maximum-count))
                        if not chunk:
                            break
                        chunks.append(chunk); count += len(chunk)
                    pcm = b"".join(chunks)
                    chunks.clear()  # Do not retain a second full PCM buffer during analysis.
                    pcm = pcm[:len(pcm)//3840*3840]
                    notes = await asyncio.to_thread(detect_notes, pcm)
                    if len(pcm) < 15*192000 or len(notes) < 8:
                        raise ValueError("Não foi possível identificar batidas suficientes. Escolha outra música.")
            if self.rhythm_id != session:
                raise ValueError("Preparação cancelada.")
            self.rhythm_pcm = pcm
            self.rhythm_data = {"id": session, "title": item["title"], "videoId": video,
                                "durationMs": len(pcm)//192, "notes": notes}
            await self.connect()
            self.rhythm_phase = "ready"
            return self.rhythm_data
        except BaseException:
            if self.rhythm_id == session:
                await self.release_rhythm(session)
            raise
        finally:
            for fd in (read_fd, write_fd):
                if fd is not None:
                    os.close(fd)
            await terminate(decoder)
            await terminate(extractor)

    async def start_rhythm(self, session, starts):
        async with self.lock:
            if self.rhythm_id != session or not self.rhythm_data:
                raise ValueError("Partida não preparada.")
            if self.rhythm_phase in ("playing", "scheduled", "finished"):
                return self.snapshot()
            if not isinstance(starts, int) or not 500 <= starts-time.time()*1000 <= 15000:
                raise ValueError("Horário de início inválido.")
            self.rhythm_starts = starts
            self.rhythm_phase = "scheduled"
            self.rhythm_expires = time.monotonic() + self.rhythm_data["durationMs"] / 1000 + 45
            self.rhythm_task = asyncio.create_task(self.play_rhythm(session, starts))
            return self.snapshot()

    async def play_rhythm(self, session, starts):
        from livekit import rtc
        try:
            await asyncio.sleep(max(0, starts/1000-time.time()))
            self.elapsed = 0.0
            self.rhythm_phase = "playing"
            self.status = "playing"
            for offset in range(0, len(self.rhythm_pcm), 3840):
                if self.rhythm_id != session:
                    return
                data = self.rhythm_pcm[offset:offset+3840]
                await self.source.capture_frame(rtc.AudioFrame(data, 48000, 2, 960))
                self.elapsed += .02
            await self.source.wait_for_playout()
            self.rhythm_phase = "finished"
            self.status = "idle"
        except asyncio.CancelledError:
            raise
        except Exception:
            self.rhythm_phase = "failed"
            self.error = "A reprodução da partida foi interrompida."
            self.status = "idle"

    async def release_rhythm(self, session):
        async with self.lock:
            if not self.rhythm_id or self.rhythm_id != session:
                return self.snapshot()
            if self.rhythm_task and not self.rhythm_task.done():
                self.rhythm_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self.rhythm_task
            self.rhythm_task = None
            self.rhythm_id = None
            self.rhythm_phase = "idle"
            self.rhythm_data = None
            self.rhythm_pcm = b""
            self.current = None
            self.status = "idle"
            self.elapsed = 0
            await self.disconnect()
            return self.snapshot()


def detect_notes(pcm):
    """Transient-energy onset detection on the exact PCM later published by the bot."""
    if sys.byteorder == "little":
        samples = memoryview(pcm).cast("h")
    else:
        samples = array.array("h"); samples.frombytes(pcm)
        samples.byteswap()
    energies = []
    for pos in range(0, len(samples)-1919, 1920):
        energies.append(math.sqrt(sum(v*v for v in samples[pos:pos+1920])/1920)/32768)
    flux = [max(0, value-sum(energies[max(0,i-8):i])/max(1,min(i,8))) for i,value in enumerate(energies)]
    notes = []
    for i in range(100, len(flux)-100):
        local = flux[max(0,i-25):i+26]
        threshold = max(.002, sum(local)/len(local)*1.6)
        if flux[i] > threshold and flux[i] >= flux[i-1] and flux[i] > flux[i+1]:
            at = i*20
            if not notes or at-notes[-1]["at"] >= 260:
                notes.append({"at": at, "lane": [0, 2, 1, 3, 0, 1, 2, 3][len(notes)%8]})
    return notes[:RHYTHM_MAX_NOTES]


def create_app(secret, player=None):
    player = player or Player()

    @web.middleware
    async def auth(request, handler):
        supplied = request.headers.get("Authorization", "")
        if not hmac.compare_digest(supplied.encode(), ("Bearer " + secret).encode()):
            raise web.HTTPUnauthorized()
        try:
            return await handler(request)
        except (ValueError, asyncio.TimeoutError, json.JSONDecodeError):
            return web.json_response({"error": "Não foi possível concluir. Confira o link e tente novamente."}, status=400)

    app = web.Application(middlewares=[auth], client_max_size=16384)
    monitor_key = web.AppKey("monitor", asyncio.Task)

    async def state(request):
        return web.json_response(player.snapshot())

    async def search(request):
        return web.json_response(await player.search(request.query.get("q", "")))

    async def enqueue(request):
        data = await request.json()
        return web.json_response(await player.enqueue(data.get("videoId"), data.get("requestedBy", ""), data.get("token", "")))

    async def control(request):
        return web.json_response(await player.control((await request.json()).get("action")))

    async def remove(request):
        return web.json_response(await player.remove(request.match_info["id"]))

    async def monitor():
        while True:
            await asyncio.sleep(5)
            await player.check_idle()

    async def startup(app):
        app[monitor_key] = asyncio.create_task(monitor())

    async def cleanup(app):
        player.closed = True
        app[monitor_key].cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await app[monitor_key]
        if player.rhythm_id:
            await player.release_rhythm(player.rhythm_id)
        await player.control("stop")

    async def rhythm_prepare(request):
        data = await request.json()
        return web.json_response(await player.prepare_rhythm(data.get("id"), data.get("videoId"), data.get("requestedBy", ""), data.get("token", "")))

    async def rhythm_start(request):
        data = await request.json()
        return web.json_response(await player.start_rhythm(data.get("id"), data.get("startsAt")))

    async def rhythm_release(request):
        return web.json_response(await player.release_rhythm((await request.json()).get("id")))

    app.router.add_post("/rhythm/prepare", rhythm_prepare)
    app.router.add_post("/rhythm/start", rhythm_start)
    app.router.add_post("/rhythm/release", rhythm_release)
    app.router.add_get("/state", state)
    app.router.add_get("/search", search)
    app.router.add_post("/queue", enqueue)
    app.router.add_post("/control", control)
    app.router.add_delete("/queue/{id}", remove)
    app.on_startup.append(startup)
    app.on_cleanup.append(cleanup)
    return app


if __name__ == "__main__":
    key = Path(os.getenv("MUSIC_SECRET_FILE", "/run/secrets/music")).read_text().strip()
    if len(key) < 32:
        raise RuntimeError("Segredo interno do bot ausente")
    web.run_app(create_app(key), host="0.0.0.0", port=8090, access_log=None, print=None)
