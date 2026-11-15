"""Independent normal erfc, direct call formula, and 60-step inverse. Standard library only."""
import math,subprocess,os
n=0;maxprice=0;maxiv=0
Phi=lambda z:.5*math.erfc(-z/math.sqrt(2))
def call(k,t,s):
 if s==0:return max(100-k,0)
 z=s*math.sqrt(t);d=math.log(100/k)/z+z/2
 return 100*Phi(d)-k*Phi(d-z)
def inv(k,t,c):
 lo,hi=0.,3.
 for _ in range(60):
  mid=(hi+lo)/2
  if call(k,t,mid)<c:lo=mid
  else:hi=mid
 return (hi+lo)/2
for a in [.18,.29,.4]:
 for s in [-.3,0,.3]:
  for c in [-.25,0,.25]:
   for term in [-.5,0,.5]:
    lines=subprocess.check_output([os.getenv('JAVA','java'),'-cp','build/classes','Dump',str(a),str(s),str(c),str(term)],text=True).strip().splitlines()
    qs=[];js=[]
    for line in lines[1:]:
     k,t,truth,quote,iv,reprice,res,lo,hi,steps,vg=map(float,line.split(','));x=(k-100)/15
     expected=a*math.exp(s*x+c*x*x+term*(t-1));p=call(k,t,expected);v=inv(k,t,quote)
     d=math.log(100/k)/(iv*math.sqrt(t))+iv*math.sqrt(t)/2
     values=[(truth,expected,2e-15),(quote,p,1e-11),(iv,v,2e-8),(reprice,call(k,t,iv),1e-11),(res,reprice-quote,0),(vg,100/math.sqrt(2*math.pi)*math.exp(-d*d/2)*math.sqrt(t),1e-10)]
     for actual,want,tol in values:
      assert abs(actual-want)<=tol,(line,actual,want,tol);n+=1
     maxprice=max(maxprice,abs(quote-p));maxiv=max(maxiv,abs(iv-v));qs.append(quote)
    vertical=sum(not(-1-1e-9<=(qs[j*7+i]-qs[j*7+i-1])/5<=1e-9)for j in range(5)for i in range(1,7))
    butterfly=sum(qs[j*7+i]-2*qs[j*7+i-1]+qs[j*7+i-2]<-1e-9 for j in range(5)for i in range(2,7))
    calendar=sum(qs[j*7+i]<qs[(j-1)*7+i]-1e-9 for j in range(1,5)for i in range(7))
    got=list(map(float,lines[0].split(',')));assert got[:3]==[vertical,butterfly,calendar];n+=3
print(f'{n} independent Python comparisons; max price error {maxprice:.3e}; max IV error {maxiv:.3e}')
