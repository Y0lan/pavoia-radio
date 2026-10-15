#!/usr/bin/env python3
"""Create one reviewable 60-second PyChorus candidate. Originals are read-only."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
from datetime import datetime, timezone

METHOD = 'pychorus-e8daf597-2hz-15s-v1'

def window(candidate, duration, lead):
    if not all(math.isfinite(v) for v in (candidate, duration, lead)) or duration < 60 or lead < 0 or not 0 <= candidate < duration:
        raise ValueError('Invalid highlight bounds')
    return round(min(max(0, candidate - lead), duration - 60), 3)

def select(args):
    import librosa
    import numpy as np
    from pychorus import find_chorus
    duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(args.input)],text=True,timeout=20))
    if not 60 <= duration <= 1200:
        raise ValueError('Trial supports tracks from 1 to 20 minutes')
    # ponytail: PyChorus is quadratic; cap at 2 frames/sec, use another method for longer audio.
    y,sr=librosa.load(args.input,sr=22050,mono=True)
    power=np.abs(librosa.stft(y,n_fft=16384,hop_length=4096))**2
    chroma=librosa.feature.chroma_stft(S=power,sr=sr,n_fft=16384)
    frames=min(chroma.shape[1],math.ceil(duration*2))
    chroma=np.stack([np.interp(np.linspace(0,1,frames),np.linspace(0,1,len(row)),row) for row in chroma]).astype(np.float32)
    candidate=find_chorus(chroma,sr,duration,15)
    if candidate is None:
        raise ValueError('No repeated section detected; no clip published')
    start=window(candidate,duration,args.lead)
    args.output.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd,name=tempfile.mkstemp(suffix='.mp3',dir=args.output);os.close(fd)
    try:
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-ss',str(start),'-i',str(args.input),'-t','60','-vn','-map_metadata','-1','-c:a','libmp3lame','-b:a','192k',name],check=True,timeout=60)
        os.replace(name,args.output/(args.track_id+'.mp3'))
    finally:
        Path(name).unlink(missing_ok=True)
    result={'schemaVersion':1,'trackId':args.track_id,'plexRatingKey':args.plex_id,'startSeconds':start,'durationSeconds':60,'candidateSeconds':round(candidate,3),'leadSeconds':args.lead,'method':METHOD,'status':'candidate','generatedAt':datetime.now(timezone.utc).isoformat(),'sourceSHA256':hashlib.sha256(args.input.read_bytes()).hexdigest()}
    (args.output/(args.track_id+'.json')).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--track-id',required=True)
    parser.add_argument('--plex-id',required=True)
    parser.add_argument('--lead',type=float,default=20,help='Seconds before the repeated section; trial parameter, not a detected drop')
    args=parser.parse_args()
    if not re.fullmatch(r'trk_[a-f0-9]{12}',args.track_id) or not re.fullmatch(r'[0-9]{1,32}',args.plex_id):parser.error('Invalid track identifier')
    select(args)
