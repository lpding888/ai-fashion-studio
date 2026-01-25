"use client";

let audioCtx: AudioContext | null = null;
type WindowWithWebkitAudioContext = Window & { webkitAudioContext?: typeof AudioContext };
const getCtx = () => {
    if (typeof window === 'undefined') return null;
    if (!audioCtx) {
        const Ctx = window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
        if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
};

export type SoundType = 'click' | 'hover' | 'success' | 'complete' | 'error' | 'delete' | 'start';

export const playSynthSound = (type: SoundType) => {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;

    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
        case 'click': // Sharp, short high tick
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(400, t + 0.05);
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
            osc.start(t);
            osc.stop(t + 0.05);
            break;
        case 'hover': // Very subtle soft tick
            osc.frequency.setValueAtTime(600, t);
            gain.gain.setValueAtTime(0.015, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
            osc.start(t);
            osc.stop(t + 0.03);
            break;
        case 'start': // Rising futuristic swipe
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.linearRampToValueAtTime(600, t + 0.3);
            gain.gain.setValueAtTime(0.0, t);
            gain.gain.linearRampToValueAtTime(0.1, t + 0.1);
            gain.gain.linearRampToValueAtTime(0.0, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
            break;
        case 'success': // Major chord arpeggio
        case 'complete':
            const now = t;
            [523.25, 659.25, 783.99].forEach((freq, i) => { // C Major
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.connect(g);
                g.connect(ctx.destination);
                o.type = 'sine';
                o.frequency.value = freq;
                g.gain.setValueAtTime(0, now);
                g.gain.linearRampToValueAtTime(0.05, now + i * 0.05 + 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                o.start(now + i * 0.05);
                o.stop(now + 0.6);
            });
            break;
        case 'error': // Low buzz
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.linearRampToValueAtTime(100, t + 0.2);
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
            break;
        case 'delete': // Quick descending zip
            osc.frequency.setValueAtTime(600, t);
            osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.1);
            osc.start(t);
            osc.stop(t + 0.1);
            break;
    }
};
