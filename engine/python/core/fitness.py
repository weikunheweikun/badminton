"""Persistent match fitness and correlated form. Units are simulation indices, not physiological measures."""
import random, math
from season import seed
from engine import clip

def initialize(p,world):
    f=p['fitness'];f.update(residual=0.,chronic=0.,form=round(clip(random.Random(seed(world,'form_init',p['id'])).gauss(0,2.4),-6,6),6),fatigue=0.)

def daily(p,world,day):
    f=p['fitness'];a=p['attributes']; rec=clip(1+.010*(a['身体素质']-85)+.009*(a['体能耐力']-85),.55,1.40)
    f['residual']=round(f['residual']*math.exp(-.85*rec),6)
    f['chronic']=round(f['chronic']*math.exp(-.19*rec),6)
    # stationary SD 2.4, correlation decays over ~10 days; no result-driven ability boost
    rho=.91;r=random.Random(seed(world,'form_day',p['id'],day))
    f['form']=round(clip(rho*f['form']+r.gauss(0,2.4*math.sqrt(1-rho*rho)),-7,7),6)
    f['fatigue']=round(f['residual']+.35*f['chronic'],6)

def finish(p,m,i):
    f=p['fitness'];f['residual']=round(m.carry[i]+.35*m.strain[i],6)
    f['chronic']=round(f['chronic']+m.work[i]*.008,6)
    f['fatigue']=round(f['residual']+.35*f['chronic'],6)
