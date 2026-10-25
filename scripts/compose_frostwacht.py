"""
„Frostwacht“ – eigenes, kaltes Menü-Stück (Orientierung: düstere, eisige Fantasy-RTS-Menümusik; keine Kopie).
d-Moll, 60 BPM, 24 Takte (~96 s), nahtlos: Wind, tiefer Chor, Streicher-Tremolo, Glocken-Motiv, tiefe Trommeln, Hall.
"""
import sys
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
from scipy.io import wavfile

SR = 32000
BPM = 60
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 24
N = int(SR * BAR * BARS) + SR * 5
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(11)
NOTES = {'C': 0, 'C#': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}


def hz(name):
    n, o = name[:-1], int(name[-1])
    return 440 * 2 ** ((NOTES[n] + 12 * (o + 1) - 69) / 12)


def env(n, a, r):
    e = np.ones(n)
    ai = min(n, int(a * SR))
    ri = min(n - ai, int(r * SR))
    if ai:
        e[:ai] = np.linspace(0, 1, ai) ** 1.5
    if ri:
        e[n - ri:] *= np.linspace(1, 0, ri) ** 2
    return e


def add(sig, t0, pan=0.0, gain=1.0):
    i = int(t0 * SR)
    j = min(N, i + len(sig))
    s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt(0.5 * (1 - pan))
    R[i:j] += s * np.sqrt(0.5 * (1 + pan))


def additive(f, dur, harms, vib=0.0, vibrate=5.0, detune=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    pm = vib * np.sin(2 * np.pi * vibrate * t)
    out = np.zeros(n)
    for k, amp in harms:
        fk = f * k * (1 + detune)
        if fk > SR / 2 - 500:
            break
        out += amp * np.sin(2 * np.pi * fk * t + pm * k + rng.uniform(0, 6.28))
    return out


def choir(f, dur, gain, bright=False):
    out = 0
    f1, f2 = (700, 1150) if bright else (430, 820)  # „aah“ hell, „ooh“ dunkel
    for d in (-0.005, 0.0, 0.006):
        harms = []
        for k in range(1, 24):
            fk = f * k
            form = np.exp(-((fk - f1) / 200) ** 2) + 0.6 * np.exp(-((fk - f2) / 260) ** 2) + 0.2 * np.exp(-((fk - 2500) / 400) ** 2)
            harms.append((k, (0.1 + form) / k ** 0.7))
        out = out + additive(f, dur, harms, vib=0.05, vibrate=4.3, detune=d)
    return out * env(len(out), 1.4, 2.0) * gain


def tremolo_strings(f, dur, gain):
    harms = [(k, 1 / k ** 1.3) for k in range(1, 16)]
    s = sum(additive(f, dur, harms, detune=d) for d in (-0.003, 0.003))
    t = np.arange(len(s)) / SR
    trem = 0.6 + 0.4 * np.abs(np.sin(np.pi * 11.5 * t))
    return s * trem * env(len(s), 1.2, 1.5) * gain


def bell(f, gain=0.18, dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for ratio, amp, dec in ((1, 1, 0.9), (2.76, 0.5, 1.6), (5.4, 0.25, 2.6), (8.9, 0.12, 4)):
        s += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return s * gain * np.minimum(1, t / 0.003)


def drum(gain=0.7, dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    fr = 55 * (1 + 0.8 * np.exp(-t * 25))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    body = np.sin(ph) * np.exp(-t * 2.2)
    hit = rng.normal(0, 1, n) * np.exp(-t * 60) * 0.4
    return (body + hit) * gain


# Wind über die ganze Länge: Rauschen durch wandernden Bandpass, langsam an- und abschwellend
def wind():
    n = N
    noise = rng.normal(0, 1, n)
    out = np.zeros(n)
    block = SR // 4
    for i in range(0, n, block):
        center = max(220, 620 + 320 * np.sin(i / SR * 0.21) + 160 * np.sin(i / SR * 0.53))
        sos = butter(2, [max(80, center * 0.6), center * 1.5], btype='band', fs=SR, output='sos')
        seg = noise[max(0, i - block): i + block]
        f = sosfilt(sos, seg)[-min(block, n - i):] if i else sosfilt(sos, seg)[:block]
        out[i:i + len(f)] = f
    lfo = 0.5 + 0.5 * np.sin(np.arange(n) / SR * 0.35) ** 2
    return out * lfo * 0.05


w = wind()
L += w * 1.0
R += np.roll(w, SR // 3) * 1.0

PROG = [('D2', 'A2', 'D3', 'F3'), ('Bb1', 'F2', 'D3', 'F3'), ('G1', 'D2', 'Bb2', 'D3'), ('A1', 'E2', 'C#3', 'E3')]
for i in range(BARS):
    t0 = i * BAR
    ch = PROG[(i // 2) % 4]
    part = 0 if i < 4 else 1 if i < 12 else 2 if i < 20 else 3
    if i % 2 == 0:
        dur = 2 * BAR + 2.4
        # tiefer Chor (ooh)
        for k, nm in enumerate(ch[:3]):
            add(choir(hz(nm) * (2 if k else 1), dur, 0.05 if part else 0.035), max(0, t0 - 1.2), pan=(k - 1) * 0.3)
        # Streicher-Tremolo ab Teil 1
        if part in (1, 2):
            for k, nm in enumerate(ch[1:]):
                add(tremolo_strings(hz(nm) * 2, dur, 0.035), max(0, t0 - 1.2), pan=(k - 1) * 0.4)
        # heller Chor (aah) im Höhepunkt
        if part == 2:
            add(choir(hz(ch[3]) * 2, dur, 0.04, bright=True), max(0, t0 - 1.2), pan=0.15)
            add(choir(hz(ch[2]) * 2, dur, 0.035, bright=True), max(0, t0 - 1.2), pan=-0.15)
        # Trommeln
        if part == 2 or (part == 1 and i % 4 == 0):
            add(drum(0.55), t0, pan=-0.05)
            add(drum(0.3), t0 + 2.5 * BEAT, pan=0.05)

# Glocken-Motiv (eigenes): jeweils über zwei Takte
MOTIF = [('A5', 0), ('F5', 1), ('E5', 1.5), ('D5', 2), ('C#5', 4), ('E5', 5), ('A4', 6)]
MOTIF2 = [('D6', 0), ('C6', 1), ('Bb5', 1.5), ('A5', 2), ('G5', 4), ('F5', 5), ('E5', 6)]
for start in (4, 8, 12, 16, 20):
    mot = MOTIF2 if start in (12, 16) else MOTIF
    for nm, b in mot:
        add(bell(hz(nm), 0.12 if start != 20 else 0.08), start * BAR + b * BEAT, pan=0.35)

# Hall: lang und kalt (4 s)
irn = int(4.0 * SR)
tt = np.arange(irn) / SR
irL = rng.normal(0, 1, irn) * np.exp(-tt * 1.6)
irR = rng.normal(0, 1, irn) * np.exp(-tt * 1.6)
for ir in (irL, irR):
    ir[: int(0.03 * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
wetL = fftconvolve(L, irL)[:N]
wetR = fftconvolve(R, irR)[:N]
outL = 0.65 * L + 0.7 * wetL
outR = 0.65 * R + 0.7 * wetR
loop = int(SR * BAR * BARS)
tl, tr = outL[loop:], outR[loop:]
outL, outR = outL[:loop].copy(), outR[:loop].copy()
outL[: len(tl)] += tl
outR[: len(tr)] += tr
st = np.stack([outL, outR], 1)
st = st / np.max(np.abs(st)) * 0.9
st = np.tanh(st * 1.15) / np.tanh(1.15)
wavfile.write(sys.argv[1], SR, (st * 32767).astype(np.int16))
print('Länge', loop / SR)
