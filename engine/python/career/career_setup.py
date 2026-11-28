"""New careers only: V5.3 initialization and growth, V7.1 singles match rules."""
import argparse,json,secrets
from pathlib import Path
from career_setup_base import create as create_v53
from business import init,sign
from career_helpers import persist
from attributes import ability, synthetic_profile
from match_engine import VERSION
from fitness import initialize
def create(world_seed,year=2027,club_name="新俱乐部",city="未指定",cash=30_000_000,count=100,roster_input=None):
    s=create_v53(world_seed,year,club_name,city,cash,count,roster_input)
    for p in s['players']:
        initialize(p,world_seed)
        entry=roster_input[p['id']-1] if roster_input is not None else {}
        if 'attributes' not in entry:
            identity=(p['country'],p['name']) if roster_input is not None else (world_seed,p['id'])
            p['attributes'],p['synthetic_archetype']=synthetic_profile(identity,p['ability'])
            p['attributes_status']='stable synthetic profile; not verified athlete data'
        else:
            p['attributes_status']=entry.get('profile_provenance','supplied profile')
        for k in ('bwf_rank','bwf_points','dob','age_verified','zh','profile_style','profile_provenance','profile_sources','previous_reference_CA','dob_source','synthetic_archetype','age_basis','history_sample_count','profile_basis','height_cm','handedness','external_rating','profile_confidence','style_evidence'):
            if k in entry:p[k]=entry[k]
        if 'profile_style' in entry:p['profile_version']=entry.get('profile_version','10.9.2-ws')
        p['ability']=ability(p['attributes']);p['ability_anchor']=p['ability'];p['attribute_anchor_mean']=sum(p['attributes'].values())/16
        g=p['development'];g['potential_hidden']=max(g['potential_hidden'],p['ability']);g['v53_potential']['baseline']=g['potential_hidden']
        center=round(g['potential_hidden']);p['potential_estimate']=[max(35,center-3),min(99,center+3)]
    for i,p in enumerate(sorted(s['players'],key=lambda p:(-p['ability'],p['id'])),1):p['rank']=i
    s['rules']['scoring']='3x15 cap 21 interval 8; rally scoring';s['version']=VERSION;s['rules']['engine']=VERSION;s['rules']['ai_tactics']=False;s['rules']['match_decisions']='autonomous attribute-based';s['rules']['CA']='derived weighted attribute mean';s['rules']['profile_dataset']='WS sourced biographical data and modeled skill priors'   
    return init(s)
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",required=True);ap.add_argument("--seed",type=int)
    ap.add_argument("--year",type=int,default=2027);ap.add_argument("--club",default="新俱乐部")
    ap.add_argument("--city",default="未指定");ap.add_argument("--cash",type=int,default=30_000_000)
    ap.add_argument("--players",type=int,default=100);ap.add_argument("--roster-json")
    a=ap.parse_args();path=Path(a.output)
    if path.exists():ap.error("refusing to overwrite")
    roster=json.loads(Path(a.roster_json).read_text()) if a.roster_json else None
    n=len(roster) if roster is not None else a.players
    if not 64<=n<=1000 or not 1900<=a.year<=2090 or a.cash<0:ap.error("invalid settings")
    s=create(a.seed if a.seed is not None else secrets.randbits(128),a.year,a.club,a.city,a.cash,n,roster)
    persist(s,path);print(json.dumps({"created":str(path),"date":s["date"],"matches":0,"players":n,"version":VERSION,"seed":s["world_seed"]},ensure_ascii=False))
if __name__=="__main__":main()
