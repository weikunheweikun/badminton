"""Reproducible protected draws. Group formats are SMASH-specific except Finals.
Seed order uses frozen world ranking; qualification/invitation priority unchanged.
"""
def seed_count(n):
    return 16 if n>=64 else 8 if n>=32 else 4 if n>=16 else 2 if n>=2 else n

def protected_positions(size,count,rr):
    if count==0:return []
    pos=[0]
    if count==1:return pos
    pos.append(size-1)
    band=4
    while len(pos)<count:
        width=size//band
        free=[i for i in range(band) if not any(i*width<=j<(i+1)*width for j in pos)]
        rr.shuffle(free)
        pos.extend(i*width if i<band//2 else (i+1)*width-1 for i in free[:count-len(pos)])
        band*=2
    return pos

def main_slots(entries,size,rr,count=None,placeholders=(),country=None):
    count=min(seed_count(len(entries)+len(placeholders)) if count is None else count,len(entries),size//2)
    slots=[None]*size; pos=protected_positions(size,count,rr)
    for j,p in zip(pos,entries):slots[j]=p
    seeds={str(p):i+1 for i,p in enumerate(entries[:count])}
    byes=size-len(entries)-len(placeholders)
    free=[i for i in range(size) if slots[i] is None]
    preferred=[i^1 for i in pos if slots[i^1] is None]
    other=[rr.choice((i,i+1)) for i in range(0,size,2) if slots[i] is None and slots[i+1] is None];rr.shuffle(other)
    empty=set((preferred+other)[:byes]);free=[i for i in free if i not in empty]
    rest=list(entries[count:])+list(placeholders)
    assert len(free)==len(rest)
    rr.shuffle(rest)
    # Avoid same-association first rounds where feasible; qualifiers drawn without association constraints.
    if country and not placeholders:
        best=None;best_cost=10**9
        for _ in range(120):
            rr.shuffle(rest);trial=slots.copy()
            for j,p in zip(free,rest):trial[j]=p
            cost=sum(a is not None and b is not None and country(a)==country(b) for a,b in zip(trial[::2],trial[1::2]))
            if cost<best_cost:best=trial;best_cost=cost
            if cost==0:break
        return best,seeds
    for j,p in zip(free,rest):slots[j]=p
    return slots,seeds

def groups_draw(entries,ng,rr,country,finals=False,modern=False,worlds=False):
    if finals and modern and ng==2:
        groups=[[entries[0]],[entries[1]]]
        for j in range(2,len(entries),2):
            pot=entries[j:j+2].copy();rr.shuffle(pot)
            for g,p in zip(groups,pot):g.append(p)
        return groups,{str(p):i+1 for i,p in enumerate(entries[:4])}
    n=len(entries);count=min(ng if modern and not finals else seed_count(n),ng);positions=protected_positions(ng,count,rr)
    groups=[[] for _ in range(ng)]
    for j,p in zip(positions,entries):groups[j].append(p)
    seeds={str(p):i+1 for i,p in enumerate(entries[:count])}
    # First pot fills remaining group heads. All subsequent ranking pots contribute at most one per group.
    heads=entries[count:ng].copy();rr.shuffle(heads)
    for g,p in zip((g for g in groups if not g),heads):g.append(p)
    for j in range(ng,n,ng):
        pot=entries[j:j+ng].copy();best=None;cost=10**9
        for _ in range(1 if finals or (modern and not worlds) else 150):
            rr.shuffle(pot);indices=list(range(ng));rr.shuffle(indices);targets=sorted(indices,key=lambda k:len(groups[k]))[:len(pot)]
            c=sum(sum(country(x)==country(y) for x in groups[k]) for k,y in zip(targets,pot))
            if c<cost:best=list(zip(targets,pot));cost=c
            if c==0:break
        for k,p in best:groups[k].append(p)
    return groups,seeds

def group_schedule(g,country):
    padded=g+[None]*(4-len(g))
    rounds=[[(padded[a],padded[b]) for a,b in pairs if padded[a] is not None and padded[b] is not None] for pairs in [((0,3),(1,2)),((0,2),(3,1)),((0,1),(2,3))]]
    # Prioritize same-country matches without introducing a second match on the same day.
    rounds.sort(key=lambda pairs:-sum(country(a)==country(b) for a,b in pairs))
    return rounds

def group_routes(orders,k,rr):
    if k==2:
        winners=[o[0] if o else None for o in orders];runners=[o[1] if len(o)>1 else None for o in orders]
        rr.shuffle(winners);rr.shuffle(runners)
        return list(zip(winners,runners))
    # Groups are already positioned in protected bracket order. No re-seeding after upsets.
    winners=[o[0] if o else None for o in orders]
    return list(zip(winners[::2],winners[1::2]))


def standings84(group,results,withdrawn,lot):
    matches=[m for m in results if m['stage'].startswith('G') and m['a'] in group and m['b'] in group]
    def completed(pid):
        return len([m for m in matches if pid in (m['a'],m['b']) and (m.get('outcome')=='played' or m.get('outcome')=='walkover' and m.get('winner')==pid)])>=len(group)-1
    eligible=[i for i in group if str(i) not in withdrawn or completed(i)]
    stats={i:dict(id=i,played=0,wins=0,losses=0,gd=0,pd=0,rank=None) for i in group};head={}
    for m in matches:
        a,b,w=m['a'],m['b'],m.get('winner')
        if a not in eligible or b not in eligible or w not in (a,b) or m.get('outcome') in ('bye','void'):continue
        h=m.get('history',[]);gd=sum((x>y)-(x<y) for x,y in h);pd=sum(x-y for x,y in h)
        for i,sign in ((a,1),(b,-1)):
            z=stats[i];z['played']+=1;z['wins']+=int(i==w);z['losses']+=int(i!=w);z['gd']+=sign*gd;z['pd']+=sign*pd
        head[frozenset((a,b))]=w
    def resolve(ids,level):
        if len(ids)<2:return ids
        if level>0 and len(ids)==2 and frozenset(ids) in head:return sorted(ids,key=lambda i:i!=head[frozenset(ids)])
        if level>=3:return sorted(ids,key=lot)
        field=('wins','gd','pd')[level];out=[]
        for value in sorted({stats[i][field] for i in ids},reverse=True):out+=resolve([i for i in ids if stats[i][field]==value],level+1)
        return out
    order=resolve(eligible,0)
    for j,i in enumerate(order,1):stats[i]['rank']=j
    return order,[stats[i] for i in order+[i for i in group if i not in order]]
