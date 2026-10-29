import asyncio
import time
import unittest
import tempfile
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import TestClient, TestServer
from bot import control_key, Player, create_app, metadata, query_target, song


class Validation(unittest.TestCase):
    def test_only_youtube_video_links_or_prefixed_search(self):
        expected = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
        for value in ("https://youtu.be/aqz-KE-bpKQ?t=5", "https://www.youtube.com/watch?v=aqz-KE-bpKQ&list=abc",
                      "https://music.youtube.com/watch?v=aqz-KE-bpKQ", "https://youtube.com/shorts/aqz-KE-bpKQ"):
            self.assertEqual(expected, query_target(value))
        for value in ("http://127.0.0.1/foo", "file:///etc/passwd", "https://youtube.com.evil/watch?v=aqz-KE-bpKQ",
                      "https://user@youtube.com/watch?v=aqz-KE-bpKQ", "https://youtube.com:443/watch?v=aqz-KE-bpKQ",
                      "https://youtube.com/playlist?list=abc", "a\nb", ""):
            with self.assertRaises(ValueError):
                query_target(value)
        self.assertEqual("ytsearch5:--exec bad; $(bad)", query_target("--exec bad; $(bad)"))

    def test_live_and_long_videos_rejected(self):
        for data in ({"duration": 1201}, {"is_live": True}, {"live_status": "is_upcoming"}, {"duration": -1}):
            with self.assertRaises(ValueError):
                song({"id": "aqz-KE-bpKQ", **data})


class Lifecycle(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.player = Player()

    async def asyncTearDown(self):
        self.player.closed = True
        await self.player.control("stop")
        await asyncio.sleep(0)

    async def test_skip_cancels_current_before_next_and_stop_clears(self):
        started, finished = [], []
        gate = asyncio.Event()

        async def play(item):
            started.append(item["videoId"])
            self.player.status = "playing"
            try:
                await gate.wait()
            finally:
                finished.append(item["videoId"])
        self.player.play = play
        await self.player.enqueue("aqz-KE-bpKQ", "Ana", "token")
        await asyncio.sleep(0)
        await self.player.enqueue("M7lc1UVf-VE", "Bia", "token")
        await self.player.control("pause")
        self.assertEqual("paused", self.player.status)
        await self.player.control("resume")
        await self.player.control("skip")
        await asyncio.sleep(0)
        self.assertEqual(["aqz-KE-bpKQ"], finished)
        self.assertEqual(["aqz-KE-bpKQ", "M7lc1UVf-VE"], started)
        await self.player.control("stop")
        self.assertEqual("idle", self.player.status)
        self.assertEqual([], self.player.queue)
        self.assertIsNone(self.player.current)

    async def test_enqueue_during_disconnect_is_not_stranded(self):
        entered, leave = asyncio.Event(), asyncio.Event()
        songs = []

        async def play(item):
            songs.append(item["videoId"])

        async def disconnect():
            entered.set()
            await leave.wait()

        self.player.play = play
        self.player.disconnect = disconnect
        await self.player.enqueue("aqz-KE-bpKQ", "Ana", "token")
        await entered.wait()
        await self.player.enqueue("M7lc1UVf-VE", "Bia", "token")
        leave.set()
        for _ in range(20):
            await asyncio.sleep(0)
        self.assertEqual(["aqz-KE-bpKQ", "M7lc1UVf-VE"], songs)

    async def test_failed_song_advances_and_queue_is_bounded(self):
        finished = asyncio.Event()

        async def play(item):
            if item["videoId"] == "aqz-KE-bpKQ":
                raise ValueError("network failed with private diagnostic")
            finished.set()
        self.player.play = play
        await self.player.enqueue("aqz-KE-bpKQ", "Ana", "token")
        await self.player.enqueue("M7lc1UVf-VE", "Bia", "token")
        await finished.wait()
        self.assertNotIn("private", self.player.snapshot()["error"])
        self.player.queue = [{}] * 30
        with self.assertRaises(ValueError):
            await self.player.enqueue("aqz-KE-bpKQ", "Ana", "token")
        self.player.queue = []

    async def test_rotated_control_key_is_reloaded_and_missing_key_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            key = Path(temp) / "control.key"
            before, after = "a" * 64, "b" * 64
            key.write_text(before)
            client = TestClient(TestServer(create_app(lambda: control_key(key), self.player)))
            await client.start_server()
            try:
                response = await client.get('/state', headers={'Authorization': 'Bearer ' + before})
                self.assertEqual(200, response.status)
                replacement = key.with_suffix('.new'); replacement.write_text(after); os.replace(replacement, key)
                response = await client.get('/state', headers={'Authorization': 'Bearer ' + after})
                self.assertEqual(200, response.status)
                response = await client.get('/state', headers={'Authorization': 'Bearer ' + before})
                self.assertEqual(401, response.status)
                key.unlink()
                response = await client.get('/state', headers={'Authorization': 'Bearer ' + after})
                self.assertEqual(503, response.status)
                self.assertNotIn(temp, await response.text())
            finally:
                await client.close()

    async def test_private_api_requires_scoped_key_and_never_returns_token(self):
        client = TestClient(TestServer(create_app("a" * 64, self.player)))
        await client.start_server()
        try:
            response = await client.get("/state")
            self.assertEqual(401, response.status)
            response = await client.get("/state", headers={"Authorization": "Bearer " + "a" * 64})
            self.assertEqual(200, response.status)
            self.assertNotIn("token", await response.text())
        finally:
            await client.close()

    async def test_metadata_reads_fragmented_output_until_eof(self):
        stream = asyncio.StreamReader()
        process = AsyncMock()
        process.stdout = stream
        process.returncode = 0

        async def feed():
            stream.feed_data(b'{"title":')
            await asyncio.sleep(.01)
            stream.feed_data(b'"complete"}')
            stream.feed_eof()
        feeder = asyncio.create_task(feed())
        with patch("asyncio.create_subprocess_exec", return_value=process):
            self.assertEqual({"title": "complete"}, await metadata("ignored"))
        await feeder

    async def test_search_metadata_is_retained_only_in_bounded_fresh_catalog(self):
        async def play(item):
            await asyncio.Event().wait()
        self.player.play = play
        metadata_result = {"entries": [{"id": "aqz-KE-bpKQ", "title": "Título conhecido", "duration": 180}]}
        with patch("bot.metadata", return_value=metadata_result):
            await self.player.search("jazz")
        state = await self.player.enqueue("aqz-KE-bpKQ", "Ana", "token")
        self.assertEqual("Título conhecido", state["queue"][0]["title"])
        self.assertEqual("Ana", state["queue"][0]["requestedBy"])
        state = await self.player.enqueue("M7lc1UVf-VE", "Ana", "token")
        self.assertEqual("Carregando música…", state["queue"][-1]["title"])
        # monotonic() counts from boot, so "0" is not stale on a fresh CI runner.
        stale = time.monotonic() - 601
        self.player.catalog["aqz-KE-bpKQ"] = (stale, metadata_result["entries"][0])
        state = await self.player.enqueue("aqz-KE-bpKQ", "Ana", "token")
        self.assertEqual("Carregando música…", state["queue"][-1]["title"])

    async def test_paused_player_leaves_an_empty_room_and_clears_queue(self):
        async def play(item):
            self.player.status = "playing"
            await asyncio.Event().wait()
        self.player.play = play
        await self.player.enqueue("aqz-KE-bpKQ", "Ana", "token")
        await self.player.enqueue("M7lc1UVf-VE", "Bia", "token")
        await asyncio.sleep(0)
        self.player.room = SimpleNamespace(remote_participants={}, disconnect=AsyncMock())
        await self.player.control("pause")
        self.player.last_listeners = time.monotonic() - 31
        await self.player.check_idle()
        self.assertEqual("idle", self.player.status)
        self.assertIsNone(self.player.current)
        self.assertEqual([], self.player.queue)
        self.assertIsNone(self.player.room)

    async def test_publish_options_are_compatible_with_pinned_rtc_sdk(self):
        from livekit import rtc
        room = SimpleNamespace(connect=AsyncMock(), disconnect=AsyncMock(),
                               local_participant=SimpleNamespace(publish_track=AsyncMock()))
        source = SimpleNamespace(clear_queue=MagicMock(), aclose=AsyncMock())
        with patch("livekit.rtc.Room", return_value=room), \
                patch("livekit.rtc.AudioSource", return_value=source), \
                patch("livekit.rtc.LocalAudioTrack.create_audio_track", return_value=object()):
            await self.player.connect()
        options = room.local_participant.publish_track.call_args.args[1]
        self.assertEqual(rtc.TrackSource.SOURCE_MICROPHONE, options.source)
        self.assertEqual(128000, options.audio_encoding.max_bitrate)
        self.assertFalse(room.connect.call_args.kwargs["options"].auto_subscribe)


if __name__ == "__main__":
    unittest.main()
