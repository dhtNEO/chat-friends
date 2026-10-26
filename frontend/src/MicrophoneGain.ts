import {
  Track,
  type AudioProcessorOptions,
  type TrackProcessor,
} from "livekit-client";

/** Gain is applied before publication, without a local monitor/echo path. */
export class MicrophoneGain
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name = "microphone-gain";
  processedTrack?: MediaStreamTrack;
  private source?: MediaStreamAudioSourceNode;
  private gain?: GainNode;
  private limiter?: DynamicsCompressorNode;
  private destination?: MediaStreamAudioDestinationNode;
  private volume: number;
  constructor(volume: number) {
    this.volume = volume;
  }
  setVolume(volume: number) {
    this.volume = volume;
    if (this.gain)
      this.gain.gain.setTargetAtTime(
        volume / 100,
        this.gain.context.currentTime,
        0.02,
      );
  }
  async init({ track, audioContext }: AudioProcessorOptions) {
    this.source = audioContext.createMediaStreamSource(
      new MediaStream([track]),
    );
    this.gain = audioContext.createGain();
    this.gain.gain.value = this.volume / 100;
    this.limiter = audioContext.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.destination = audioContext.createMediaStreamDestination();
    this.source
      .connect(this.gain)
      .connect(this.limiter)
      .connect(this.destination);
    this.processedTrack = this.destination.stream.getAudioTracks()[0];
  }
  async restart(options: AudioProcessorOptions) {
    await this.destroy();
    await this.init(options);
  }
  async destroy() {
    this.source?.disconnect();
    this.gain?.disconnect();
    this.limiter?.disconnect();
    this.destination?.stream.getTracks().forEach((track) => track.stop());
    this.source = undefined;
    this.gain = undefined;
    this.limiter = undefined;
    this.destination = undefined;
    this.processedTrack = undefined;
  }
}
