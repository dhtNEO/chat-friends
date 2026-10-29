"""Bounded spectral onset analysis of the same 48 kHz stereo PCM used for playback.

This detects audible attacks, not a metronome: no notes are invented between onsets.
FFT work is batched so five-minute tracks do not create a full-song spectrogram.
"""
import numpy as np

SAMPLE_RATE = 48000
WINDOW = 2048
HOP = 480
MAX_NOTES = 1200
MIN_GAP_MS = 210
BANDS = ((35, 200), (200, 1000), (1000, 4000), (4000, 16000))


def _features(pcm):
    stereo = np.frombuffer(pcm, dtype="<i2").reshape(-1, 2)
    count = max(0, 1 + (len(stereo) - WINDOW) // HOP)
    flux = np.zeros((count, 4), dtype=np.float32)
    rms = np.zeros(count, dtype=np.float32)
    window = np.hanning(WINDOW).astype(np.float32)
    frequencies = np.fft.rfftfreq(WINDOW, 1 / SAMPLE_RATE)
    masks = [(frequencies >= low) & (frequencies < high) for low, high in BANDS]
    previous = np.zeros(WINDOW // 2 + 1)
    for first in range(0, count, 128):
        size = min(128, count - first)
        chunk = stereo[first * HOP:(first + size - 1) * HOP + WINDOW]
        frames = np.lib.stride_tricks.sliding_window_view(chunk, WINDOW, axis=0)[::HOP].astype(np.float32) / 32768
        rms[first:first + size] = np.sqrt(np.mean(frames * frames, axis=(1, 2)))
        spectrum = np.fft.rfft(frames * window, axis=-1)
        # Combine channel powers: averaging L/R before the FFT cancels anti-phase percussion.
        magnitude = np.sqrt(np.mean(np.abs(spectrum) ** 2, axis=1)) / window.sum()
        compressed = np.log1p(1000 * magnitude)
        difference = np.maximum(0, np.diff(compressed, axis=0, prepend=previous[None, :]))
        for band, mask in enumerate(masks):
            flux[first:first + size, band] = difference[:, mask].mean(axis=1)
        previous = compressed[-1]
    return flux, rms


def _moving_mean(values, width):
    return np.convolve(np.pad(values, (width // 2, width // 2), mode="edge"), np.ones(width) / width, mode="valid")


def detect_notes(pcm):
    if not pcm or len(pcm) % 4:
        return []
    flux, rms = _features(pcm)
    if len(flux) < 401 or float(rms.max()) < 1e-5:
        return []
    scores = np.zeros_like(flux)
    for band in range(4):
        values = flux[:, band]
        mean = _moving_mean(values, 101)
        deviation = np.sqrt(np.maximum(0, _moving_mean(values * values, 101) - mean * mean))
        # Relative local thresholds retain quiet sections without treating stationary noise as beats.
        scores[:, band] = np.maximum(0, values - mean - 1.7 * deviation - .001) / np.maximum(mean + deviation, .003)
    strength = np.max(scores, axis=1)
    strength = np.convolve(strength, [.2, .6, .2], mode="same")
    floor = np.maximum(1e-5, _moving_mean(rms, 101) * .08)
    duration = len(pcm) / (SAMPLE_RATE * 4) * 1000
    candidates = []
    for i in range(1, len(strength) - 1):
        at = round((i * HOP + WINDOW / 2) / SAMPLE_RATE * 1000)
        if not 2000 <= at < duration - 2000:
            continue
        if strength[i] > .85 and strength[i] > strength[i - 1] and strength[i] >= strength[i + 1] and rms[i] > floor[i]:
            # New spectral energy assigns the lane; a sustained pad must not dominate a quiet kick.
            lane = int(np.argmax(flux[i]))
            candidates.append((at, lane, float(strength[i])))
    # Keep the clearest attack in a crowded neighbourhood, rather than the first one encountered.
    selected = []
    occupied = {}
    for note in sorted(candidates, key=lambda note: (-note[2], note[0])):
        bucket = note[0] // MIN_GAP_MS
        if all(abs(note[0] - occupied.get(key, float("inf"))) >= MIN_GAP_MS for key in (bucket - 1, bucket, bucket + 1)):
            selected.append(note)
            occupied[bucket] = note[0]
    selected.sort()
    # Spread an oversized chart across the full song instead of cutting off its ending.
    if len(selected) > MAX_NOTES:
        selected = [max(selected[i * len(selected) // MAX_NOTES:(i + 1) * len(selected) // MAX_NOTES], key=lambda note: note[2]) for i in range(MAX_NOTES)]
    return [{"at": at, "lane": lane} for at, lane, _ in selected]
