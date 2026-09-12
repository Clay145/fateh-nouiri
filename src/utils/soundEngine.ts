// Web Audio API ambient relaxation sound generator
// Generates soothing pink noise filtered into ocean waves, rain, and meditation singing bowls

class RelaxSoundEngine {
  private ctx: AudioContext | null = null;
  private currentMode: 'waves' | 'rain' | 'binaural' | 'none' = 'none';
  private gainNode: GainNode | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private filterNode: BiquadFilterNode | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public play(mode: 'waves' | 'rain' | 'binaural') {
    this.stop();
    this.initContext();
    if (!this.ctx) return;

    this.currentMode = mode;
    const ctx = this.ctx;

    // Create 3 seconds of looping pink-like noise buffer
    const bufferSize = ctx.sampleRate * 3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    this.noiseNode = ctx.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;

    this.filterNode = ctx.createBiquadFilter();
    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(0.01, ctx.currentTime);
    this.gainNode.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 1.2);

    if (mode === 'waves') {
      // Modulated filter for ocean ebb and flow
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(320, ctx.currentTime);

      this.lfoOsc = ctx.createOscillator();
      this.lfoOsc.frequency.setValueAtTime(0.18, ctx.currentTime); // wave swell every ~5s
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(220, ctx.currentTime);

      this.lfoOsc.connect(lfoGain);
      lfoGain.connect(this.filterNode.frequency);
      this.lfoOsc.start();
    } else if (mode === 'rain') {
      // Rain high pass / band pass
      this.filterNode.type = 'bandpass';
      this.filterNode.frequency.setValueAtTime(800, ctx.currentTime);
      this.filterNode.Q.setValueAtTime(1.2, ctx.currentTime);
    } else {
      // Binaural calming drone
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(432, ctx.currentTime);
      
      const droneOsc = ctx.createOscillator();
      droneOsc.type = 'sine';
      droneOsc.frequency.setValueAtTime(216, ctx.currentTime);
      const droneGain = ctx.createGain();
      droneGain.gain.setValueAtTime(0.08, ctx.currentTime);
      droneOsc.connect(droneGain);
      droneGain.connect(this.gainNode);
      droneOsc.start();
    }

    this.noiseNode.connect(this.filterNode);
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);
    this.noiseNode.start();
  }

  public stop() {
    if (this.gainNode && this.ctx) {
      try {
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.ctx.currentTime);
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.5);
        setTimeout(() => {
          this.cleanup();
        }, 550);
      } catch {
        this.cleanup();
      }
    } else {
      this.cleanup();
    }
    this.currentMode = 'none';
  }

  private cleanup() {
    try {
      this.noiseNode?.stop();
      this.noiseNode?.disconnect();
      this.lfoOsc?.stop();
      this.lfoOsc?.disconnect();
      this.filterNode?.disconnect();
      this.gainNode?.disconnect();
    } catch {
      // ignore already stopped nodes
    }
    this.noiseNode = null;
    this.lfoOsc = null;
    this.filterNode = null;
    this.gainNode = null;
  }

  public getMode() {
    return this.currentMode;
  }
}

export const relaxAudio = new RelaxSoundEngine();
