"""
Eigenes Orchester-Stück im Geist klassischer Fantasy-RTS-Soundtracks (keine Kopie): d-Moll, 76 BPM,
Streicher-Flächen, Horn-Melodie, Chor, Harfe, Pauken, Marschtrommel, Hall. Rein additiv/numerisch erzeugt.
"""
import numpy as np
from scipy.signal import fftconvolve
import sys

SR = 32000
BPM = 76
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 32
N = int(SR * BAR * BARS) + SR * 4
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)

NOTES = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def hz(name):
    n, o = name[:-1], int(name[-1])
    return 440 * 2 ** ((NOTES[n] + 12 * (o + 1) - 69) / 12)


def env(n, a, r, sus=1.0):
    e = np.ones(n) * sus
    ai = min(n, int(a * SR))
    ri = min(n - ai, int(r * SR))
    if ai:
        e[:ai] = np.linspace(0, sus, ai) ** 1.5
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
    ph_mod = vib * np.sin(2 * np.pi * vibrate * t) * np.clip(t / 0.4, 0, 1)
    out = np.zeros(n)
    for k, amp in harms:
        fk = f * k * (1 + detune)
        if fk > SR / 2 - 500:
            break
        out += amp * np.sin(2 * np.pi * fk * t + ph_mod * k + rng.uniform(0, 6.28))
    return out


def strings(f, dur, gain=0.12, pan=0.0):
    harms = [(k, 1 / k ** 1.25) for k in range(1, 18)]
    s = sum(additive(f, dur, harms, vib=0.004 * 2 * np.pi, vibrate=5.2, detune=d) for d in (-0.003, 0, 0.0035))
    return s * env(len(s), 0.55, 0.7) * gain


def horn(f, dur, gain=0.2):
    harms = [(1, 1), (2, 0.55), (3, 0.38), (4, 0.22), (5, 0.12), (6, 0.07), (7, 0.04)]
    s = additive(f, dur, harms, vib=0.006 * 2 * np.pi, vibrate=5.5)
    n = len(s)
    # Anblasen: Helligkeit steigt mit der Lautstärke (Obertöne verstärken)
    e = env(n, 0.09, min(0.35, dur * 0.4))
    return s * e * gain


def choir(f, dur, gain=0.07):
    out = 0
    for d in (-0.004, 0.0, 0.005):
        harms = []
        for k in range(1, 22):
            fk = f * k
            form = np.exp(-((fk - 750) / 260) ** 2) + 0.6 * np.exp(-((fk - 1150) / 300) ** 2) + 0.25 * np.exp(-((fk - 2600) / 400) ** 2)
            harms.append((k, (0.15 + form) / k ** 0.6))
        out = out + additive(f, dur, harms, vib=0.008 * 2 * np.pi, vibrate=4.6, detune=d)
    return out * env(len(out), 0.9, 1.2) * gain


def harp(f, dur=2.2, gain=0.2):
    # Karplus-Strong
    n = int(dur * SR)
    p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        v = buf[i % p]
        out[i] = v
        buf[i % p] = 0.996 * 0.5 * (v + buf[(i + 1) % p])
    return out * gain * np.exp(-np.arange(n) / SR * 1.2)


def timpani(f, gain=0.6, dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    fr = f * (1 + 0.06 * np.exp(-t * 18))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    body = np.sin(ph) + 0.35 * np.sin(1.5 * ph) + 0.2 * np.sin(2 * ph)
    noise = rng.normal(0, 1, n) * np.exp(-t * 40) * 0.5
    return (body * np.exp(-t * 2.6) + noise) * gain


def snare(gain=0.12):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    s = rng.normal(0, 1, n) * np.exp(-t * 16) + 0.4 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)
    return s * gain


def chord(names, t0, dur, gain=0.11):
    for k, nm in enumerate(names):
        add(strings(hz(nm), dur, gain), t0, pan=(k - len(names) / 2) * 0.25)


# Akkorde je Takt (Grundton tief für Celli/Bässe)
PROG_A = [['D2', 'D3', 'A3', 'F4'], ['Bb1', 'Bb2', 'F3', 'D4'], ['F2', 'C3', 'A3', 'F4'], ['C2', 'C3', 'G3', 'E4']]
PROG_B = [['G1', 'G2', 'D3', 'Bb3'], ['D2', 'D3', 'F3', 'A3'], ['Bb1', 'Bb2', 'F3', 'D4'], ['A1', 'A2', 'E3', 'C#4']]

bar = 0
plan = []
plan += [('intro', PROG_A[0]), ('intro', PROG_A[1]), ('intro', PROG_A[2]), ('intro', PROG_A[3])]
plan += [('A', c) for c in PROG_A * 2]
plan += [('B', c) for c in PROG_B * 2]
plan += [('A2', c) for c in PROG_A * 2]
plan += [('outro', PROG_A[0]), ('outro', PROG_A[1]), ('outro', PROG_A[3]), ('outro', PROG_A[0])]

# Melodie (eigene): (Note, Schläge); A-Teil 8 Takte
MEL_A = [
    ('D4', 1.5), ('A4', 0.5), ('A4', 1), ('G4', 1),
    ('F4', 1.5), ('G4', 0.5), ('F4', 1), ('D4', 1),
    ('C4', 1.5), ('F4', 0.5), ('A4', 1), ('C5', 1),
    ('Bb4', 2), ('A4', 1), ('G4', 1),
    ('D4', 1.5), ('A4', 0.5), ('A4', 1), ('D5', 1),
    ('C5', 1.5), ('Bb4', 0.5), ('A4', 1), ('F4', 1),
    ('G4', 1), ('A4', 1), ('C5', 1), ('Bb4', 1),
    ('A4', 3), ('E4', 1),
]
MEL_B = [  # Chor-Linie über G-d-B-A, ruhiger
    ('Bb4', 4), ('A4', 4), ('F4', 2), ('D5', 2), ('C#5', 4),
    ('D5', 4), ('F5', 2), ('E5', 2), ('D5', 2), ('Bb4', 2), ('A4', 4),
]

t = 0.0
mel_a_bars = 0
for i, (part, ch) in enumerate(plan):
    t0 = i * BAR
    g = {'intro': 0.07, 'A': 0.09, 'B': 0.1, 'A2': 0.12, 'outro': 0.07}[part]
    chord(ch, max(0, t0 - 0.35), BAR + 0.9, gain=g)
    # Harfe: Arpeggio in Achteln
    if part in ('intro', 'A', 'outro', 'A2'):
        arp = ch[1:] + [ch[2][:-1] + str(int(ch[2][-1]) + 1)]
        for k in range(8):
            nm = arp[k % len(arp)]
            add(harp(hz(nm) * (2 if part == 'A2' else 1)), t0 + k * BEAT / 2, pan=0.4, gain=0.6 if part != 'A2' else 0.45)
    # Pauken
    if part in ('A', 'B', 'A2') or (part == 'intro' and i == 3):
        add(timpani(hz(ch[0]) * (2 if hz(ch[0]) < 60 else 1)), t0, pan=-0.1, gain=0.55 if part != 'A2' else 0.75)
        if part == 'A2' or (i % 4 == 3):
            add(timpani(hz(ch[0]) * (2 if hz(ch[0]) < 60 else 1), gain=0.35), t0 + 3 * BEAT, pan=-0.1)
    # Marschtrommel im B- und A2-Teil
    if part in ('B', 'A2'):
        for k, (b, a) in enumerate([(0, 1), (1, 0.6), (1.5, 0.4), (2, 0.8), (3, 0.6), (3.5, 0.4)]):
            add(snare(0.08 * a), t0 + b * BEAT, pan=0.2)
    # Pauken-Wirbel vor A2 und am Ende
    if i in (19, 31):
        for k in range(16):
            add(timpani(hz('A2'), gain=0.12 + 0.02 * k, dur=0.6), t0 + 2 * BEAT + k * BEAT / 8, pan=-0.1)

# Melodie A (Horn) in Takt 4..11, A2 in 20..27 eine Oktave höher mit zweitem Horn in der Unterterz
def play_melody(mel, start_bar, octave=1.0, gain=0.2, inst='horn', pan=-0.15):
    tt = start_bar * BAR
    for nm, beats in mel:
        dur = beats * BEAT
        f = hz(nm) * octave
        if inst == 'horn':
            add(horn(f, dur * 1.05, gain), tt, pan=pan)
        else:
            add(choir(f, dur * 1.1, gain), tt, pan=pan)
        tt += dur


play_melody(MEL_A, 4, 0.5, 0.26)
play_melody(MEL_B, 12, 1.0, 0.09, inst='choir', pan=0.1)
play_melody(MEL_B, 12, 0.5, 0.07, inst='choir', pan=-0.2)
play_melody(MEL_A, 20, 1.0, 0.2, pan=-0.1)
play_melody(MEL_A, 20, 0.5, 0.18, pan=0.15)
play_melody(MEL_A[:8], 28, 0.5, 0.14)

# Hall: Faltung mit abklingendem Rauschen (2,6 s)
irn = int(2.6 * SR)
tt = np.arange(irn) / SR
irL = rng.normal(0, 1, irn) * np.exp(-tt * 2.4)
irR = rng.normal(0, 1, irn) * np.exp(-tt * 2.4)
irL[: int(0.02 * SR)] = 0
irR[: int(0.025 * SR)] = 0
irL /= np.sqrt(np.sum(irL ** 2))
irR /= np.sqrt(np.sum(irR ** 2))
wetL = fftconvolve(L, irL)[:N]
wetR = fftconvolve(R, irR)[:N]
outL = 0.72 * L + 0.55 * wetL
outR = 0.72 * R + 0.55 * wetR

# Schleife: Ende auf Länge BARS kürzen und den Hall-Schwanz auf den Anfang legen, damit es nahtlos läuft
loop = int(SR * BAR * BARS)
tailL, tailR = outL[loop:], outR[loop:]
outL, outR = outL[:loop].copy(), outR[:loop].copy()
outL[: len(tailL)] += tailL
outR[: len(tailR)] += tailR
peak = max(np.max(np.abs(outL)), np.max(np.abs(outR)))
st = np.stack([outL, outR], axis=1) / peak * 0.89
# sanfte Sättigung
st = np.tanh(st * 1.2) / np.tanh(1.2)
from scipy.io import wavfile
wavfile.write(sys.argv[1], SR, (st * 32767).astype(np.int16))
print('Länge', loop / SR, 's')
