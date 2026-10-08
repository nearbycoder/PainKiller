#!/usr/bin/env python3
"""Build the store-page trailer, README poster/teaser and screenshots from scripted gameplay.

    python3 tools/make_trailer.py                 # capture, mix, encode everything
    python3 tools/make_trailer.py --skip-capture  # reuse captures/clips, redo audio + edit

Requires Node dependencies (Electron, Vite), ffmpeg with libx264/libwebp, and ImageMagick.
Gameplay is rendered offscreen in virtual time by tools/media/capture.cjs, so the result is
identical on every run and independent of machine load. Outputs land in docs/media/;
intermediate captures go to captures/ (git-ignored).
"""
import argparse, json, os, shutil, signal, socket, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAP = ROOT / "captures"
CLIPS = CAP / "clips"
MEDIA = ROOT / "docs/media"
PORT = 5199  # --port overrides
FPS = 30
NICE = ["nice", "-n", "10"]

# (shot, transition into the next shot, transition seconds)
EDIT = [
    ("open-horde", "cut", 0), ("open-storm", "cut", 0), ("open-general", "fadewhite", 0.35),
    ("title", "fadeblack", 0.6),
    ("sectors", "fade", 0.4), ("thresher", "smoothleft", 0.45), ("freezer", "smoothleft", 0.45),
    ("stakes", "smoothleft", 0.45), ("rockets", "smoothleft", 0.45), ("tempest", "fadeblack", 0.5),
    ("roster", "fade", 0.4), ("general", "fade", 0.4), ("wraith", "fade", 0.4), ("supplies", "fade", 0.4),
    ("tarot-menu", "fade", 0.35), ("tarot", "fade", 0.4), ("physics", "fade", 0.4), ("progress", "fadeblack", 0.5),
    ("levels", "fade", 0.4), ("campaign", "fade", 0.4), ("fidelity", "fade", 0.4), ("options", "fadeblack", 0.5),
    ("m-chaingun", "cut", 0), ("m-storm", "cut", 0), ("m-shatter", "cut", 0), ("m-volley", "cut", 0),
    ("m-rockets", "cut", 0), ("m-wraith", "cut", 0), ("m-lightning", "cut", 0), ("m-finale", "fadewhite", 0.35),
    ("end", None, 0),
]
SCREENSHOTS = {
    # output name: (shot, frame)
    "01-title.jpg": ("ss-title", 70),
    "02-cemetery-horde.jpg": ("ss-horde", 20),
    "03-freeze-shatter.jpg": ("ss-shatter", 61),
    "04-chain-lightning.jpg": ("ss-lightning", 66),
    "05-general.jpg": ("ss-general", 40),
    "06-wraith-form.jpg": ("ss-wraith", 100),
    "07-the-abyss.jpg": ("ss-abyss", 16),
    "08-level-select.jpg": ("ss-levels", 60),
    "09-grave-tarot.jpg": ("ss-tarot", 60),
}
TEASER = [("open-horde", 0.35, 2.3), ("open-storm", 0.3, 2.1), ("m-shatter", 0.0, 1.15), ("m-storm", 0.0, 1.15), ("open-general", 0.3, 1.9)]


def run(cmd, **kw):
    print("+", " ".join(str(c) for c in cmd), flush=True)
    return subprocess.run([str(c) for c in cmd], check=True, cwd=ROOT, **kw)


def duration(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v:0",
                                   "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(path)])
    return int(out.strip()) / FPS


def listening():
    for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        with socket.socket(family) as s:
            if s.connect_ex((host, PORT)) == 0:
                return True
    return False


def dev_server():
    # Never capture from a server this script did not start: it may be another checkout's.
    if listening():
        sys.exit(f"Port {PORT} is already in use; pass --port with a free one")
    proc = subprocess.Popen(NICE + ["npx", "vite", "--port", str(PORT), "--strictPort"], cwd=ROOT,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    for _ in range(100):
        time.sleep(0.2)
        if listening():
            return proc
    stop(proc)
    sys.exit("Vite dev server did not start")


def stop(proc):
    """Stop the dev server and its children (npx -> node -> esbuild): its own process group only."""
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=10)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        pass


def electron(*args):
    run(NICE + [ROOT / "node_modules/.bin/electron", "tools/media/capture.cjs", "--url", f"http://localhost:{PORT}/",
                "--out", CAP, *args])


def timeline():
    """Start time of every shot in the cut, honouring transition overlaps."""
    starts, cursor, previous = [], 0.0, 0.0
    for name, _, _ in EDIT:
        d = duration(CLIPS / f"{name}.mp4")
        start = cursor - previous
        starts.append((name, start, d))
        cursor = start + d
        previous = dict((n, t) for n, _, t in EDIT)[name]
    return starts, cursor


def score_plan(starts, total):
    """The music bed: the game's chapter themes (src/music.ts), one layer per section."""
    at = {name: (start, d) for name, start, d in starts}
    title, montage, end = at["title"][0], at["m-chaingun"][0], at["end"][0]
    weapons, roster, general, wraith = at["sectors"][0], at["roster"][0], at["general"][0], at["wraith"][0]
    ui = at["levels"][0]
    return {
        "seconds": total,
        "sections": [
            {"kind": "theme", "from": 0.0, "to": title, "chapter": 1, "layer": "fight", "gain": 0.9},
            {"kind": "hit", "from": title, "big": 1.2},
            {"kind": "theme", "from": title, "to": weapons, "chapter": 1, "layer": "calm", "gain": 1.6},
            {"kind": "theme", "from": weapons, "to": roster, "chapter": 1, "layer": "fight", "gain": 0.85},
            {"kind": "theme", "from": roster, "to": general, "chapter": 2, "layer": "fight", "gain": 0.9},
            {"kind": "theme", "from": general, "to": wraith, "chapter": 3, "layer": "general", "gain": 0.9},
            {"kind": "theme", "from": wraith, "to": ui, "chapter": 4, "layer": "fight", "gain": 0.9},
            {"kind": "theme", "from": ui, "to": montage - 2.2, "chapter": 5, "layer": "fight", "gain": 0.75},
            {"kind": "riser", "from": montage - 2.2, "to": montage},
            {"kind": "hit", "from": montage, "big": 0.8},
            {"kind": "theme", "from": montage, "to": end, "chapter": 5, "layer": "general", "gain": 1.0},
            {"kind": "hit", "from": end, "big": 1.6},
            {"kind": "theme", "from": end + 0.6, "to": total, "chapter": 5, "layer": "calm", "gain": 1.6},
        ],
    }


def assemble(starts, total):
    inputs, vf, af = [], [], []
    for k, (name, start, d) in enumerate(starts):
        inputs += ["-i", CLIPS / f"{name}.mp4"]
        vf.append(f"[{k}:v]fps={FPS},settb=1/{FPS},format=yuv420p[v{k}]")
    n = len(starts)
    for k, (name, start, d) in enumerate(starts):
        inputs += ["-i", CLIPS / f"{name}.sfx.wav"]
        fade_out = max(0.05, EDIT[k][2])
        af.append(f"[{n + k}:a]atrim=0:{d:.3f},afade=t=in:d=0.02,afade=t=out:st={d - fade_out:.3f}:d={fade_out:.3f},"
                  f"adelay={int(start * 1000)}:all=1[s{k}]")
    inputs += ["-i", CAP / "score.wav"]
    cur, length = "v0", starts[0][2]
    for k in range(1, n):
        kind, t = EDIT[k - 1][1], EDIT[k - 1][2]
        if kind == "cut":
            vf.append(f"[{cur}][v{k}]concat=n=2:v=1:a=0,settb=1/{FPS}[x{k}]")
            length += starts[k][2]
        else:
            vf.append(f"[{cur}][v{k}]xfade=transition={kind}:duration={t}:offset={length - t:.3f},settb=1/{FPS}[x{k}]")
            length += starts[k][2] - t
        cur = f"x{k}"
    af.append("".join(f"[s{k}]" for k in range(n)) + f"amix=inputs={n}:normalize=0:dropout_transition=0,"
              f"atrim=0:{total:.3f},volume=0.9[sfx]")
    af.append("[sfx]asplit=2[sfxmix][key]")
    af.append(f"[{2 * n}:a]atrim=0:{total:.3f},volume=2.6,afade=t=in:d=0.4,afade=t=out:st={total - 2.0:.3f}:d=2.0[music]")
    af.append("[music][key]sidechaincompress=threshold=0.02:ratio=5:attack=6:release=320:makeup=1[ducked]")
    af.append(f"[ducked][sfxmix]amix=inputs=2:normalize=0,alimiter=limit=0.9:level=disabled,"
              f"aformat=channel_layouts=stereo,afade=t=out:st={total - 1.0:.3f}:d=1.0[aout]")
    master = CAP / "trailer-master.mkv"
    graph = CAP / "trailer.filter"
    graph.write_text(";\n".join(vf + af))
    run(NICE + ["ffmpeg", "-y", "-loglevel", "error", "-stats", *inputs, "-/filter_complex", graph,
                "-map", f"[{cur}]", "-map", "[aout]", "-c:v", "libx264", "-preset", "fast", "-crf", "10",
                "-c:a", "flac", master])
    return master


def loudness(master, target="I=-15:TP=-1.5:LRA=11"):
    """Two-pass EBU R128 normalization: measure the master, then apply linearly."""
    log = subprocess.run(NICE + ["ffmpeg", "-hide_banner", "-i", str(master), "-vn", "-af",
                                 f"loudnorm={target}:print_format=json", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = json.loads(log[log.rindex("{"):log.rindex("}") + 1])
    return (f"loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
            f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,aresample=48000,"
            # Synthesized noise is bright; trim the top octave, and leave AAC room to overshoot
            # the limiter while staying under -1 dBTP.
            "lowpass=f=16000:poles=2,alimiter=limit=0.6:attack=4:release=60:level=disabled")


def encode(master, total, budget_mb=41):
    out = MEDIA / "trailer.mp4"
    audio_filter = loudness(master)
    audio_kbps = 160
    video_kbps = int(budget_mb * 8 * 1024 / total - audio_kbps)
    common = ["-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(FPS),
              "-b:v", f"{video_kbps}k", "-maxrate", f"{int(video_kbps * 2)}k", "-bufsize", f"{video_kbps * 3}k",
              "-g", str(FPS * 2), "-passlogfile", CAP / "x264"]
    run(NICE + ["ffmpeg", "-y", "-loglevel", "error", "-i", master, *common, "-pass", "1", "-an", "-f", "mp4", os.devnull])
    run(NICE + ["ffmpeg", "-y", "-loglevel", "error", "-i", master, *common, "-pass", "2", "-af", audio_filter, "-c:a", "aac",
                "-b:a", f"{audio_kbps}k", "-movflags", "+faststart", out])
    return out


def poster(starts):
    title = dict((n, s) for n, s, _ in starts)["title"]
    still = CAP / "poster-frame.png"
    run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{title + 4.2:.2f}", "-i", MEDIA / "trailer.mp4",
         "-frames:v", "1", still])
    run(["magick", still, "-fill", "#0a0807b8", "-stroke", "#d9c89c", "-strokewidth", "5",
         "-draw", "circle 960,812 960,742", "-stroke", "none", "-fill", "#efe4c9",
         "-draw", "polygon 940,778 940,846 996,812",
         "-quality", "88", MEDIA / "trailer-poster.jpg"])


def teaser():
    parts = []
    for i, (name, a, b) in enumerate(TEASER):
        part = CAP / f"teaser-{i}.mp4"
        run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(a), "-to", str(b), "-i", CLIPS / f"{name}.mp4",
             "-vf", "scale=960:540:flags=lanczos,fps=15", "-an", "-c:v", "libx264", "-crf", "12", part])
        parts.append(part)
    listing = CAP / "teaser.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in parts))
    run(NICE + ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listing,
                "-c:v", "libwebp_anim", "-lossless", "0", "-q:v", "62", "-compression_level", "6", "-loop", "0",
                "-preset", "picture", MEDIA / "teaser.webp"])


def screenshots():
    shots = sorted({shot for shot, _ in SCREENSHOTS.values()})
    shutil.rmtree(CAP / "stills", ignore_errors=True)
    electron("--stills", ",".join(shots))
    for out, (shot, frame) in SCREENSHOTS.items():
        src = CAP / "stills" / f"{shot}-{frame:04d}.png"
        run(["magick", src, "-strip", "-quality", "90", "-sampling-factor", "4:2:0", MEDIA / "screenshots" / out])


def quality_check(starts, total):
    trailer = MEDIA / "trailer.mp4"
    frames = CAP / "qc"
    shutil.rmtree(frames, ignore_errors=True)
    frames.mkdir(parents=True)
    for k, (name, start, d) in enumerate(starts):
        at = start + min(d - 0.6, 2.4 if d > 3 else d / 2)
        run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{at:.2f}", "-i", trailer, "-frames:v", "1",
             "-vf", f"scale=640:-1,drawtext=text='{k:02d} {name} {at:.1f}s':x=8:y=8:fontcolor=yellow:fontsize=18:box=1:boxcolor=black@0.6",
             frames / f"{k:02d}.png"])
    run(["magick", "montage", *sorted(frames.glob("*.png")), "-tile", "5x", "-geometry", "+2+2", CAP / "qc.jpg"])
    report = subprocess.run(["ffmpeg", "-hide_banner", "-i", trailer, "-vf", "blackdetect=d=0.5:pix_th=0.06,freezedetect=n=0.001:d=1.5",
                             "-af", "volumedetect,ebur128=framelog=quiet", "-f", "null", "-"],
                            cwd=ROOT, capture_output=True, text=True).stderr
    keep = [l for l in report.splitlines() if any(k in l for k in ("black_start", "freeze_start", "freeze_duration",
                                                                  "mean_volume", "max_volume", "I:", "LRA:", "Peak"))]
    (CAP / "qc.txt").write_text("\n".join(keep) + "\n")
    print("\n".join(keep))


def main():
    global PORT
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--skip-capture", action="store_true", help="reuse captures/clips")
    p.add_argument("--skip-screenshots", action="store_true")
    p.add_argument("--port", type=int, default=PORT, help=f"port for this run's Vite dev server (default {PORT})")
    a = p.parse_args()
    PORT = a.port
    for tool in ("ffmpeg", "ffprobe", "magick"):
        if not shutil.which(tool):
            sys.exit(f"{tool} is required")
    (MEDIA / "screenshots").mkdir(parents=True, exist_ok=True)
    CLIPS.mkdir(parents=True, exist_ok=True)
    server = dev_server()
    try:
        if not a.skip_capture:
            electron("--video", ",".join(name for name, _, _ in EDIT))
        starts, total = timeline()
        (CAP / "score.json").write_text(json.dumps(score_plan(starts, total), indent=1))
        electron("--audio")
        master = assemble(starts, total)
        encode(master, total)
        poster(starts)
        teaser()
        if not a.skip_screenshots:
            screenshots()
        quality_check(starts, total)
        print(f"trailer {total:.1f}s -> {MEDIA / 'trailer.mp4'}")
    finally:
        stop(server)


if __name__ == "__main__":
    main()
