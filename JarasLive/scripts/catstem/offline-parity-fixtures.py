import numpy as np,torch,soundfile as sf
from pathlib import Path
from demucs.states import load_model
from demucs.apply import apply_model
import argparse
parser=argparse.ArgumentParser(description='Generate offline separation reference files with the original desktop Demucs implementation.')
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--checkpoint',type=Path,required=True)
args=parser.parse_args()
out=args.output;out.mkdir(parents=True,exist_ok=True)
torch.set_num_threads(2);torch.set_num_interop_threads(1)
m=load_model(args.checkpoint).eval()
for length in [67,258001,358001]:
    t=torch.arange(length)/44100
    gen=torch.Generator().manual_seed(71)
    audio=torch.stack([.12*torch.sin(2*torch.pi*173*t)*(1+.7*torch.sin(2*torch.pi*2*t))+.03*torch.randn(length,generator=gen)+.02,.17*torch.sin(2*torch.pi*331*t)+.02*torch.randn(length,generator=gen)+.02])
    sf.write(out/f'input-{length}.wav',audio.T.numpy(),44100,subtype='FLOAT')
    ref=audio.mean(0);mean=ref.mean();std=ref.std(unbiased=False)
    with torch.inference_mode():
        result=apply_model(m,((audio-mean)/std)[None],device='cpu',shifts=0,split=True,overlap=.25,num_workers=0)[0]
        result.mul_(std).add_(mean/6)
    for index,name in zip([3,0,1,4],['Vocal','Drum','Bass','Guitar']):
        result[index].contiguous().numpy().tofile(out/f'{name}-{length}.f32')
    print('FIXTURE',length,flush=True)
