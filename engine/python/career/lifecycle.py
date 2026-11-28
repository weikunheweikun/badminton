"""Fictional youth cohorts and season-boundary retirement. No match probability modifiers."""
import copy, datetime as dt, random
from collections import Counter
from season import D,seed
from engine import clip
from career_setup import create as base_create
from attributes import ability,synthetic_profile
from fitness import initialize as fitness_init


def age_at(p,day):
    d,b=D(day),D(p['career_birthdate']);return d.year-b.year-((d.month,d.day)<(b.month,b.day))

def decimal_age(p,day):
    d,b=D(day),D(p['career_birthdate']);a=age_at(p,day)
    def birthday(y):return dt.date(y,b.month,min(b.day,28) if b.month==2 and b.day==29 and not __import__('calendar').isleap(y) else b.day)
    # use same Feb29 convention as age_at for non-leap years: March 1
    if b.month==2 and b.day==29:
        def birthday(y):return dt.date(y,2,29) if __import__('calendar').isleap(y) else dt.date(y,3,1)
    prev,nxt=birthday(b.year+a),birthday(b.year+a+1)
    return a+(d-prev).days/(nxt-prev).days

def init(s):
    s.update(retired_players=[],career_history=[],lifecycle_history=[],next_player_id=max(p['id'] for p in s['players'])+1)
    for p in s['players']:
        r=random.Random(seed(s['world_seed'],'birth75',p['id']));day=D(s['date'])
        if p.get('dob') and p.get('age_verified'):
            p['career_birthdate']=p['dob'];p['birthdate_source']='verified opening DOB';p['dob_source']=p.get('dob_source','opening roster')
        elif p.get('dob') and p.get('age_basis'):
            p['career_birthdate']=p['dob'];p['birthdate_source']='fictional opening DOB'
        else:
            # Choose a birthday consistent with the supplied opening age, not a claimed real DOB.
            month=r.randint(1,12);date=r.randint(1,28);year=day.year-p['age']-int((month,date)>(day.month,day.day))
            p['career_birthdate']=str(dt.date(year,month,date));p['birthdate_source']='simulated from opening age (unverified)'
        p['age']=age_at(p,s['date']);p['debut_date']=s['date'];p['debut_CA']=p['ability'];p['career_stats']={'wins':0,'losses':0,'titles':0,'seasons':0,'best_rank':p['rank'],'peak_CA':p['ability']};p['origin']='opening_roster';p['retirement_review']=None
    s['rules']['lifecycle']='annual fictional youth intake; seasonal retirement; permanent IDs; calendar-year statistics; exact birthday';return s

def retirement(p,s):
    """Annual retirement hazard, not a forecast for real athletes."""
    age=p['age'];a=p['ability'];g=p['development'];peak=p['career_stats']['peak_CA'];rank=p['rank'];f=p['fitness']
    if age>=42:return 1.,'age ceiling (simulation)'
    if age<29:return 0.,'young'
    base={29:.005,30:.01,31:.02,32:.035,33:.06,34:.10,35:.17,36:.26,37:.38,38:.52,39:.67,40:.80,41:.90}[age]
    recent=[x for x in s['v42']['injury_history'] if x['player_id']==p['id'] and x['date'][:4]==str(s['season_year']) and x['penalty']>=5]
    hazard=clip(base*(1+.035*max(0,peak-a))*(1+.025*max(0,75-a))*(1+.20*len(recent))*(.65 if rank<=20 else 1),0,.98)
    return hazard,'age / decline / injury risk'

def retire(s,p,day,prob,reason):
    pid=p['id'];c=s['club'];o=p.get('contract');p['age']=age_at(p,day)
    if pid in c['roster']:c['roster'].remove(pid)
    if o:
        s['contract_archive'].append({'player_id':pid,**copy.deepcopy(o),'end':min(day,o['end'])})
        c['annual_salary_commitment']-=o['salary'];c['annual_bonus_cap']-=o['bonus'];c['operating_budget']['annual_salary']-=o['salary'];c['operating_budget']['annual_bonus_max']-=o['bonus']
    p['contract']=None;p['employer']=None;p['npc_contract']=None;s['contract_offers'].pop(str(pid),None);s['v42']['injuries'].pop(str(pid),None)
    p.update(retired_date=day,retired_age=p['age'],retired_rank=p['rank'],retired_points=p['points'],retirement_probability=prob,retirement_reason=reason)
    s['retired_players'].append(p);s['players'].remove(p);s['lifecycle_history'].append({'type':'retirement','date':day,'id':pid,'name':p['name'],'age':p['age'],'CA':p['ability'],'rank':p['rank'],'probability':prob,'reason':reason})

COUNTRIES=('CHN','INA','JPN','DEN','MAS','IND','THA','TPE','KOR','FRA','HKG','SGP','CAN','ENG','ESP','VIE','GER','USA','NED','FIN')
WEIGHTS=(16,14,12,7,8,8,7,7,5,4,3,3,2,2,1,1,1,1,1,1)

# Fictional name pools, used only for new youth cohorts. Independent RNG avoids altering ability draws.
NAME_POOLS={
 'CHN':('林 许 唐 沈 周 顾 温 叶','若宁 芷晴 予安 诗妍 芮琪 嘉禾 清妤 映岚'),
 'TPE':('江 邱 许 蔡 苏 赖 卓 魏','语晴 昕妤 恬羽 若葳 芷安 语彤 以柔 映蓁'),
 'HKG':('梁 何 罗 陈 黄 余 邓 叶','咏晴 欣澄 芷瑜 嘉凝 颖彤 语欣 思岚 晴心'),
 'JPN':('Akiyama Mizuno Sakurai Fujino Morikawa Asano','Rina Yuna Mio Saki Ayane Hikari'),
 'KOR':('Yoon Kang Seo Bae Moon Chae','Ji-na Yu-ri Ha-rin Min-seo Eun-ha Su-bin'),
 'INA':('Prameswari Maheswari Nirmala Wulandari Pertiwi Sasmita','Alya Kirana Nabila Citra Laras Ayunda'),
 'THA':('Sirikul Chansiri Rattanai Pongsiri Thanasin','Nalin Pimlada Kanya Arisa Nicha'),
 'IND':('Mehra Rana Anand Desai Sethi Nair','Anika Kavya Mira Riya Ishani Tara'),
 'MAS':('Tan Lim Teoh Liew Ng Chan','Jia-Rou Xin-Ling Hui-Yan Mei-Rin Li-Qing Su-En'),
 'SGP':('Tan Koh Goh Lim Teo Ong','Xin-Yu Hui-Lin Jia-Rin Mei-Qi Su-Min Li-En'),
 'VIE':('Nguyen Tran Le Pham Hoang Vo','Mai Linh Thao An Ngoc Ha'),
 'DEN':('Lund Madsen Vestergaard Nissen Holst Berg','Freja Liv Alma Signe Thea Maja'),
 'FRA':('Morel Laurent Perrin Renard Dumas Petit','Lina Elise Manon Jade Lucie Celia'),
 'GER':('Keller Vogt Brandt Fuchs Winter Braun','Lena Mara Juna Nele Elisa Frieda'),
 'ESP':('Vega Ruiz Soler Rios Mora Vidal','Alba Ines Lia Clara Sara Lucia'),
 'NED':('Bakker Visser deVries Smit Vos Bos','Lotte Noor Fiene Mila Juna Sara'),
 'FIN':('Laine Aalto Niemi Salmi Kivi Ranta','Aino Iida Lumi Ella Siiri Emma'),
}
def youth_name(s,country,pid,used):
    r=random.Random(seed(s['world_seed'],'youth-name157',pid));last,first=NAME_POOLS.get(country,('Brooks Reed Hale Hayes Nolan Ellis','Maya Elena Iris Eva Nora Lia'))
    names=[(a+b if country in ('CHN','TPE','HKG') else a+' '+b if country in ('JPN','KOR','VIE') else b+' '+a) for a in last.split() for b in first.split()]
    r.shuffle(names);return next((x for x in names if x not in used),f'{names[0]} {pid}')

def intake(s,day,n):
    """Seeded independently per cohort/player. Newcomers have no fabricated points/results."""
    r=random.Random(seed(s['world_seed'],'youth75',day));entries=[];meta=[];used={p.get('name') for p in s['players']+s['retired_players']}
    for j in range(n):
        pid=s['next_player_id']+j;country=r.choices(COUNTRIES,WEIGHTS)[0];age=r.choices([17,18,19,20,21],[8,29,35,23,5])[0]
        tier=r.choices(['regular','prospect','elite','exceptional'],[48,36,14,2])[0]
        ca_range,pa_range={'regular':((64,73),(77,85)),'prospect':((71,79),(85,92)),'elite':((77,85),(92,96)),'exceptional':((83,89),(96,99))}[tier]
        ca=round(r.uniform(*ca_range),4);pa=round(max(ca,r.uniform(*pa_range)),4)
        # IDs are world-unique; names intentionally visibly fictional, not real players.
        name=youth_name(s,country,pid,used);used.add(name)
        attrs,style=synthetic_profile((s['world_seed'],'youth75',pid),ca)
        entries.append({'name':name,'country':country,'age':age,'ability':ability(attrs),'attributes':attrs,'potential_hidden':pa,'growth_factor':r.uniform(1.15,1.65),'decline_factor':r.uniform(.75,1.35),'peak_age':r.randint(24,29),'real':False})
        month,date=r.randint(1,12),r.randint(1,28);birth=str(dt.date(int(day[:4])-age-int((month,date)>(1,1)),month,date));meta.append((pid,birth,tier,style))
    if not entries:return []
    # Reuse the standard player initializer, then give permanent IDs and independent fitness streams.
    batch=base_create(seed(s['world_seed'],'youth_batch75',day),int(day[:4]),count=n,roster_input=entries)['players']
    for p,(pid,birth,tier,style) in zip(batch,meta):
        p.update(id=pid,career_birthdate=birth,birthdate_source='fictional generated DOB',dob=birth,age_verified=False,origin='fictional_youth',debut_date=day,debut_CA=p['ability'],synthetic_archetype=style,attributes_status='fictional youth profile',employer=None,npc_contract=None,opening_rank_credits=[],career_stats={'wins':0,'losses':0,'titles':0,'seasons':0,'best_rank':None,'peak_CA':p['ability']},retirement_review=None)
        p['rank']=len(s['players'])+1;p['age']=age_at(p,day);fitness_init(p,s['world_seed']);s['players'].append(p)
        s['lifecycle_history'].append({'type':'debut','date':day,'id':pid,'name':p['name'],'country':p['country'],'age':p['age'],'CA':p['ability'],'potential_tier':tier})
    s['next_player_id']+=n;return batch
