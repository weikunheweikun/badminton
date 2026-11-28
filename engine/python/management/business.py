"""V6.1 career economy and negotiation policy. Currency unit: yuan."""
import math, random, calendar
from season import D, seed
from engine import clip
from negotiate import evaluate
from career_setup_base import sign as original_sign

BASE_MONTHLY=150_000

def init(s):
    c=s['club'];c.update(arrears=0,finance_status='normal',finance_months=[],base_monthly_income=BASE_MONTHLY)
    s['rules']['management']='6.1';c['finance_status']='warning' if c['cash']<reserve(s) else 'normal';refresh_interest(s);return s

def refresh_interest(s):
    c=s['club']
    for p in s['players']:
        ca=p['ability'];base=62-.95*max(0,ca-65)-1.7*max(0,ca-85)
        variation=(random.Random(seed(s['world_seed'],'recruit61',p['id'])).random()-.5)*18
        p['market']['interest']=round(clip(base+variation+(c['reputation']-20)*(.55 if ca>=85 else .35)+(4 if p['age']<=22 else 0),5,95))
    return s

def pay(s,amount,kind,**extra):
    c=s['club']; amount=int(amount)
    if amount<0:
        paid=min(c['cash'],-amount); unpaid=-amount-paid
        if unpaid:c['arrears']+=unpaid
        c['cash']-=paid
        s['transactions'].append(dict(date=s['date'],type=kind,amount=-paid,assessed=amount,unpaid=unpaid,cash_after=c['cash'],**extra))
    else:
        c['cash']+=amount
        s['transactions'].append(dict(date=s['date'],type=kind,amount=amount,cash_after=c['cash'],**extra))
        repay=min(c['cash'],c['arrears'])
        if repay:
            c['cash']-=repay;c['arrears']-=repay
            s['transactions'].append(dict(date=s['date'],type='arrears_repayment',amount=-repay,cash_after=c['cash']))
    c['finance_status']='administration' if c['arrears'] else 'warning' if c['cash']<reserve(s) else 'normal'

def monthly_cost(s):
    b=s['club']['operating_budget'];return math.ceil(sum(b[k] for k in ('staff_facilities','travel','medical_admin','annual_salary'))/12)

def reserve(s,offer=None):
    o=offer or {'salary':0,'bonus':0};return max(0,3*(monthly_cost(s)+math.ceil(o['salary']/12)-BASE_MONTHLY)+s['club']['annual_bonus_cap']+o['bonus'])

def check_budget(s,o):
    c=s['club']
    if c['arrears'] or c['cash']-o['fee']<reserve(s,o):raise ValueError('财务限制：签约后须保留三个月净运营储备及奖金上限，且无欠款')

def score_offer(p,o):
    m=p['market'];return .9*math.log(o['fee']/m['signing_fee'])+1.5*math.log(o['salary']/m['annual_salary'])+.25*min(o['bonus']/m['annual_salary'],1)+.25*o['national_priority']-.18*abs(o['years']-p.get('preferred_contract_years',3))

def negotiation_status(s,pid):
    hist=[x for x in s['negotiation_history'] if x['player_id']==pid];last=hist[-1] if hist else None
    if not last:return {'remaining':3,'cooldown_until':None,'accepted':False}
    day=D(s['date']);expiry=last.get('expires');accepted=last['result']=='accepted_offer' and not last.get('executed') and expiry and s['date']<=expiry
    cool=last.get('cooldown_until');blocked=cool and s['date']<cool
    remaining=0 if blocked or accepted else (3 if cool else 3-last.get('session_round',1))
    return {'remaining':remaining,'cooldown_until':cool if blocked else None,'accepted':bool(accepted),'expires':expiry if accepted else None}

def offer(s,p,o):
    check_budget(s,o);refresh_interest(s)
    if not 1<=o['years']<=5 or o['fee']>10**9 or o['salary']>10**9 or o['bonus']>10**9:raise ValueError('合同年限1—5年，金额不可超过10亿元')
    hist=[x for x in s['negotiation_history'] if x['player_id']==p['id']];last=hist[-1] if hist else None
    state=negotiation_status(s,p['id'])
    if state['accepted']:raise ValueError('已有有效报价，请确认签约或等待到期')
    if state['cooldown_until']:raise ValueError('谈判冷却至 '+state['cooldown_until'])
    if any(x['offer']==o for x in hist):raise ValueError('本赛季已提交过相同报价，不会重新抽取谈判结果')
    utility=score_offer(p,o)
    if last and utility<last['utility']+.12:raise ValueError('新报价须实质改善球员待遇')
    session=1 if not last or last.get('cooldown_until') else last['session_round']+1
    # One fixed preference draw per player per season. Better terms, not RNG retries, change acceptance.
    result=evaluate(p,o,s['world_seed'],1);result['round']=len(hist)+1
    if o['fee']<.65*p['market']['signing_fee'] or o['salary']<.75*p['market']['annual_salary']:
        result.update(result='rejected',accept_probability=0,counter_probability=0)
    result.update(date=s['date'],utility=utility,session_round=session)
    import datetime as dt
    if result['result']=='accepted_offer':result['expires']=(D(s['date'])+dt.timedelta(days=14)).isoformat()
    if result['result']=='rejected' or session>=3 or result['result']=='accepted_offer':result['cooldown_until']=(D(s['date'])+dt.timedelta(days=30)).isoformat()
    s['negotiation_history'].append(result);return result

def sign(s,pid,o):
    check_budget(s,o)
    state=negotiation_status(s,pid);last=next((x for x in reversed(s['negotiation_history']) if x['player_id']==pid),None)
    if not state['accepted'] or last['offer']!=o:raise ValueError('没有当前有效的已接受报价')
    original_sign(s,pid,o);refresh_interest(s)

def sponsor_options(s):
    c=s['club'];r=c['reputation'];n=len(c['roster']);top=sum(p['rank']<=20 for p in s['players'] if p['id'] in c['roster'])
    if not n or c['sponsorships'] or s['date'].endswith('-12-31'):return []
    annual=round((1_800_000+65_000*r+550_000*n+500_000*top)/10000)*10000
    return [{'id':'stable','brand':'远航体育（虚构）','annual_cash':annual,'title_bonus':0}, {'id':'performance','brand':'凌峰运动（虚构）','annual_cash':round(annual*.72),'title_bonus':180000}]

def sign_sponsor(s,choice):
    o=next((x for x in sponsor_options(s) if x['id']==choice),None)
    if not o:raise ValueError('当前无此赞助方案或已签约')
    c=s['club'];o.update(start=s['date'],end=str(s['season_year'])+'-12-31');c['sponsorships'].append(o);c['annual_sponsor_income']=o['annual_cash']

def title_reward(s,e,p):
    for o in s['club']['sponsorships']:
        if o['start']<=s['date']<=o['end'] and o['title_bonus'] and e['level'] in ('500','750','1000','WC','FINALS'):
            pay(s,o['title_bonus'],'sponsor_title_bonus',brand=o['brand'],event_id=e['id'],player_id=p['id'])

def variable_commercial(s):
    # Merchandise, appearance and local partnership revenue. Not guaranteed, updates with reputation/rank.
    c=s['club'];roster=[p for p in s['players'] if p['id'] in c['roster']]
    if not roster:return 0
    return round(7500*max(0,c['reputation']-20)+60000*sum(p['rank']<=10 for p in roster)+25000*sum(10<p['rank']<=30 for p in roster))

def settle_month(s,day):
    c=s['club']; d=D(day); key=day[:7]
    if key in c['finance_months']:return
    days=calendar.monthrange(d.year,d.month)[1];start=d.replace(day=1)
    b=c['operating_budget'];base=round(sum(b[k] for k in ('staff_facilities','travel','medical_admin'))/12)
    salaries=sum(round(p['contract']['salary']/12*max(0,(d-max(start,D(p['contract']['start']))).days+1)/days) for p in s['players'] if p['contract'] and p['id'] in c['roster'])
    if 'contract_archive' in s:
        from contracts import salaries as accrued_salaries
        salaries=accrued_salaries(s,day)
    pay(s,BASE_MONTHLY,'commercial_income')
    variable=variable_commercial(s)
    if variable:pay(s,variable,'performance_commercial_income')
    for o in c['sponsorships']:
        active=max(0,(min(d,D(o['end']))-max(start,D(o['start']))).days+1)
        if active:pay(s,round(o['annual_cash']/12*active/days),'sponsor_payment',brand=o['brand'])
    pay(s,-base-salaries,'monthly_operations');c['finance_months'].append(key);c['finance_through']=day
