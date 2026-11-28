"""Attribute schema and macro CA. CA is never an input to match dynamics."""
import random
from engine import clip
from legacy_rally import ATTR
from season import seed

GROUPS=(ATTR[:7],ATTR[7:12],ATTR[12:])
WEIGHTS=(.45,.35,.20)
def ability(attrs):
    return round(sum(w*sum(attrs[k] for k in g)/len(g) for w,g in zip(WEIGHTS,GROUPS)),4)

# Synthetic archetypes, NOT scouting claims about named athletes.
ARCHETYPES={
    'attack':{'杀球进攻':9,'爆发力':8,'后场技术':5,'移动速度':3,'防守能力':-5,'体能耐力':-5,'击球稳定性':-4},
    'defense':{'防守能力':9,'移动速度':5,'判断与预判':6,'体能耐力':8,'杀球进攻':-7,'爆发力':-5},
    'control':{'拉吊控球':9,'击球稳定性':6,'战术意识':6,'判断与预判':4,'杀球进攻':-5,'爆发力':-5},
    'net':{'网前技术':9,'接发球':7,'灵活性':7,'判断与预判':3,'后场技术':-5,'杀球进攻':-4},
    'allround':{}
}
def normalize(raw, reference):
    lo,hi=-100.,100.
    for _ in range(40):
        mid=(lo+hi)/2
        vals={k:clip(raw[k]+mid,35,99) for k in ATTR}
        if ability(vals)<reference:lo=mid
        else:hi=mid
    return {k:round(clip(raw[k]+(lo+hi)/2,35,99),4) for k in ATTR}

def synthetic_profile(identity,reference):
    r=random.Random(seed('SMASH_ATTR_V70',identity))
    style=r.choice(tuple(ARCHETYPES)); offsets=ARCHETYPES[style]
    raw={k:reference+offsets.get(k,0)+r.gauss(0,2.2) for k in ATTR}
    return normalize(raw,reference),style
