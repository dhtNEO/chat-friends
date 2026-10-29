import array
import asyncio
import functools
import time
import unittest
from unittest.mock import AsyncMock, patch
from aiohttp.test_utils import TestClient, TestServer
from bot import Player, create_app, detect_notes

@functools.lru_cache(maxsize=1)
def pulses():
    loud = array.array('h', [12000] * 1920).tobytes()
    quiet = b'\0' * 3840
    return b''.join(loud if i % 25 < 3 else quiet for i in range(1000))

class Detection(unittest.TestCase):
    def test_notes_follow_transients_are_bounded_and_use_four_lanes(self):
        notes = detect_notes(pulses())
        self.assertGreaterEqual(len(notes), 20)
        self.assertEqual({0, 1, 2, 3}, {n['lane'] for n in notes})
        self.assertTrue(all(2000 <= n['at'] < 18000 for n in notes))
        self.assertTrue(all(b['at']-a['at'] >= 260 for a,b in zip(notes,notes[1:])))
        self.assertTrue(all(n['at'] % 500 == 0 for n in notes))
    def test_silence_does_not_invent_beats(self):
        self.assertEqual([], detect_notes(b'\0' * (16*192000)))

class RhythmLifecycle(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self): self.player=Player()
    async def asyncTearDown(self):
        if self.player.rhythm_id: await self.player.release_rhythm(self.player.rhythm_id)
        self.player.closed=True
        await self.player.control('stop')
    async def test_reserved_bot_rejects_queue_and_controls(self):
        self.player.rhythm_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        self.player.token='private-secret-not-for-clients'
        self.player.rhythm_pcm=b'private-pcm'
        with self.assertRaises(ValueError): await self.player.enqueue('aqz-KE-bpKQ','Ana','token')
        with self.assertRaises(ValueError): await self.player.control('stop')
        before=self.player.rhythm_id
        await self.player.release_rhythm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
        self.assertEqual(before,self.player.rhythm_id)
        self.assertNotIn('private',str(self.player.snapshot()))
        await self.player.release_rhythm(before)
        self.assertIsNone(self.player.rhythm_id)
        self.assertEqual(b'',self.player.rhythm_pcm)
    async def test_start_is_idempotent_and_release_cancels_publisher(self):
        session='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        self.player.rhythm_id=session;self.player.rhythm_phase='ready';self.player.rhythm_data={'durationMs':20000}
        gate=asyncio.Event()
        async def play(*args): await gate.wait()
        self.player.play_rhythm=AsyncMock(side_effect=play)
        starts=int(time.time()*1000)+6000
        await self.player.start_rhythm(session,starts)
        task=self.player.rhythm_task
        await self.player.start_rhythm(session,starts)
        self.assertIs(task,self.player.rhythm_task)
        await asyncio.sleep(0)
        self.assertEqual(1,self.player.play_rhythm.call_count)
        await self.player.release_rhythm(session)
        self.assertTrue(task.cancelled())
    async def test_prepare_analyzes_exact_pcm_then_reuses_reservation(self):
        session='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        raw=pulses(); position=0
        async def read(size):
            nonlocal position
            result=raw[position:position+size];position+=len(result);return result
        extractor=type('Process',(),{'stdout':None})()
        decoder=type('Process',(),{'stdout':type('Reader',(),{'read':staticmethod(read)})()})()
        self.player.connect=AsyncMock()
        with patch('bot.metadata',new=AsyncMock(return_value={'id':'aqz-KE-bpKQ','duration':20,'title':'Pulsos'})), patch('bot.asyncio.create_subprocess_exec',new=AsyncMock(side_effect=[extractor,decoder])),patch('bot.terminate',new=AsyncMock()):
            result=await self.player.prepare_rhythm(session,'aqz-KE-bpKQ','Ana','private-token')
            again=await self.player.prepare_rhythm(session,'aqz-KE-bpKQ','Ana','private-token')
        self.assertEqual(result,again)
        self.assertEqual(raw,self.player.rhythm_pcm)
        self.assertEqual(20000,result['durationMs'])
        self.assertGreater(len(result['notes']),20)
        self.assertNotIn('private',str(result))
    async def test_empty_release_does_not_interrupt_normal_music(self):
        self.player.current = {"title":"Normal playback"}
        self.player.status = "playing"
        await self.player.release_rhythm(None)
        self.assertEqual("playing", self.player.status)
        self.assertEqual("Normal playback", self.player.current["title"])

    async def test_private_rhythm_routes_require_secret(self):
        client=TestClient(TestServer(create_app('s'*64,self.player)));await client.start_server()
        try:
            response=await client.post('/rhythm/prepare',json={'id':'invalid','videoId':'file:///etc/passwd'})
            self.assertEqual(401,response.status)
            response=await client.post('/rhythm/prepare',headers={'Authorization':'Bearer '+'s'*64},json={'id':'invalid','videoId':'file:///etc/passwd'})
            self.assertEqual(400,response.status)
            self.assertNotIn('passwd',await response.text())
        finally: await client.close()
