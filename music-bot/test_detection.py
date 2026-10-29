"""Ground-truth audio fixtures: test timing against audible attacks, not FFT implementation."""
import unittest
import numpy as np
from rhythm import detect_notes, MAX_NOTES

RATE = 48000


def synthesize(attacks, seconds=20, frequencies=(80,), amplitudes=(.5,), antiphase=False, bed=None):
    pcm = np.zeros((seconds * RATE, 2), dtype="<i2")
    if bed is not None:
        for start in range(0, len(pcm), 8192):
            stop = min(start + 8192, len(pcm))
            values = np.round(bed(np.arange(start, stop) / RATE) * 32767).astype("<i2")
            pcm[start:stop] = values[:, None]
    t = np.arange(round(.08 * RATE)) / RATE
    for i, at in enumerate(attacks):
        wave = amplitudes[i % len(amplitudes)] * np.sin(2 * np.pi * frequencies[i % len(frequencies)] * t) * np.exp(-60 * t)
        start = round(at * RATE)
        size = min(len(t), len(pcm) - start)
        for channel in range(2):
            sign = -1 if antiphase and channel == 1 else 1
            pcm[start:start + size, channel] = np.clip(pcm[start:start + size, channel].astype(np.int32) + np.round(sign * wave[:size] * 32767), -32768, 32767).astype("<i2")
    return pcm.tobytes()


class SpectralDetection(unittest.TestCase):
    def assert_chart_matches(self, notes, expected, tolerance=25):
        eligible = [round(t * 1000) for t in expected if 2025 <= t * 1000 < 17975]
        self.assertTrue(eligible)
        # Every detected note must correspond to a real sound; at least 90% must be found.
        self.assertGreaterEqual(len(notes), len(eligible) * .9)
        for note in notes:
            self.assertLessEqual(min(abs(note["at"] - round(t * 1000)) for t in expected), tolerance)
        self.assertGreaterEqual(sum(any(abs(note["at"] - t) <= tolerance for note in notes) for t in eligible), len(eligible) * .9)

    def test_quiet_percussion_is_retained_under_a_sustained_instrument(self):
        times = np.arange(1, 19, .5)
        notes = detect_notes(synthesize(times, amplitudes=(.02,), bed=lambda t: .2 * np.sin(2 * np.pi * 440 * t)))
        self.assert_chart_matches(notes, times)
        self.assertEqual({0}, {note["lane"] for note in notes})

    def test_gain_changes_preserve_soft_attacks_and_timing(self):
        times = np.arange(1, 19, .5)
        for amplitudes in ((.0008,), (.001,) * 12 + (.6,) * 12 + (.005,) * 12):
            with self.subTest(amplitudes=amplitudes):
                self.assert_chart_matches(detect_notes(synthesize(times, amplitudes=amplitudes)), times)

    def test_stereo_phase_does_not_cancel_attacks(self):
        times = np.arange(1, 19, .5)
        normal = detect_notes(synthesize(times))
        self.assertEqual(normal, detect_notes(synthesize(times, antiphase=True)))
        self.assert_chart_matches(normal, times)

    def test_lanes_follow_frequency_content(self):
        times = np.arange(1, 19, .5)
        notes = detect_notes(synthesize(times, frequencies=(80, 600, 2500, 8000)))
        self.assert_chart_matches(notes, times)
        for note in notes:
            nearest = min(range(len(times)), key=lambda i: abs(times[i] * 1000 - note["at"]))
            self.assertEqual(nearest % 4, note["lane"])

    def test_nearby_weak_pre_attack_does_not_steal_a_strong_beat(self):
        beats = np.arange(2, 18, 1)
        attacks = [t + offset for t in beats for offset in (0, .12)]
        notes = detect_notes(synthesize(attacks, amplitudes=(.01, .6)))
        self.assertEqual(len(beats), len(notes))
        self.assert_chart_matches(notes, beats + .12)

    def test_syncopation_and_changing_tempo_follow_the_audio(self):
        times = [2.1, 2.6, 2.85, 3.6, 4.1, 4.35, 4.85, 5.6, 6.1, 6.35, 7.1, 7.85, 8.1, 8.4, 8.7, 9, 9.3, 9.6]
        self.assert_chart_matches(detect_notes(synthesize(times)), times)

    def test_stationary_noise_tone_silence_and_slow_swell_do_not_invent_beats(self):
        rng = np.random.default_rng(4)
        beds = [lambda t: rng.normal(0, .02, len(t)), lambda t: .2 * np.sin(2 * np.pi * 440 * t), lambda t: .2 * (t / 20) * np.sin(2 * np.pi * 440 * t)]
        for bed in beds:
            with self.subTest(bed=bed):
                self.assertEqual([], detect_notes(synthesize([], bed=bed)))
        self.assertEqual([], detect_notes(bytes(20 * RATE * 4)))
        self.assertEqual([], detect_notes(b"bad"))

    def test_dense_five_minute_chart_keeps_ending_and_bounds(self):
        times = np.arange(1, 299, .22)
        notes = detect_notes(synthesize(times, seconds=300))
        self.assertEqual(MAX_NOTES, len(notes))
        self.assertGreater(notes[-1]["at"], 297000)
        self.assertLess(notes[-1]["at"], 298000)
        self.assertTrue(all(b["at"] - a["at"] >= 210 for a, b in zip(notes, notes[1:])))
        self.assertTrue(all(min(abs(note["at"] - t * 1000) for t in times) <= 25 for note in notes))
        self.assertEqual(notes, detect_notes(synthesize(times, seconds=300)))
