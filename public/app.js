const $=s=>document.querySelector(s);
const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!=null)n.textContent=txt;if(cls)n.className=cls;return n;};
const icon=k=>'<svg class="icon" aria-hidden="true"><use href="/icons.svg#'+k+'"/></svg>';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rupees=v=>'₹'+Number(v).toLocaleString('en-IN');
const duration=n=>[Math.floor(n/60)?Math.floor(n/60)+' hr':'',n%60?n%60+' min':''].filter(Boolean).join(' ');
const when=v=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'}).format(v)+' IST';
const day=v=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Kolkata'}).format(v);
const types={Airport:['airport','Airport transfer'],Local:['city','Local ride'],Hills:['mountain','Hill trip']};
let data={routes:[],settings:{}},type='Airport',all=false,generation=0;
const modal=$('#dialog'),body=$('#modal-body');
function show(title,html=''){generation++;$('#modal-title').textContent=title;body.innerHTML=html;if(!modal.open)modal.showModal();body.scrollTop=0;return generation;}
$('#close').onclick=()=>modal.close();modal.onclose=()=>generation++;modal.onclick=e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}};
async function api(path,options={}){const r=await fetch('/api/'+path,options);let j;try{j=await r.json();}catch{throw Error('The booking service is temporarily unavailable.');}if(!r.ok)throw Error(j.error||'Please try again.');return j;}
const post=(name,data,token)=>api(name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Booking-Token':token}:{})},body:JSON.stringify(data)});
const lookup=r=>api('booking?id='+encodeURIComponent(r.id),{headers:{'X-Booking-Token':r.token}});
function stored(){try{return JSON.parse(localStorage.getItem('fc-bookings')||'[]');}catch{return [];}}
function save(r){try{localStorage.setItem('fc-bookings',JSON.stringify([r,...stored().filter(x=>x.id!==r.id)].slice(0,50)));}catch{/* The receipt link is also available in the address bar. */}}
function opts(select,values,val){select.replaceChildren(...[...new Set(values)].map(s=>new Option(s,s)));if(values.includes(val))select.value=val;}
function dependent(dest){opts($('#destination'),data.routes.filter(r=>r.type===type&&r.origin===$('#origin').value).map(r=>r.destination),dest);}
function chooseType(next,origin,dest){
  type=next;
  document.querySelectorAll('#tabs button').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.type===next);b.disabled=!data.routes.some(r=>r.type===b.dataset.type);});
  opts($('#origin'),data.routes.filter(r=>r.type===type).map(r=>r.origin),origin);dependent(dest);$('#find').disabled=!$('#destination').value;
}
$('#tabs').onclick=e=>{const b=e.target.closest('button');if(b)chooseType(b.dataset.type);};$('#origin').onchange=()=>dependent();
function card(r){
  const b=el('button',null,'route-card');
  b.innerHTML='<div class="card-img"><img loading="lazy" src="'+esc(r.image||'/images/hero.jpg')+'" alt=""><span class="type-tag">'+icon(types[r.type][0])+esc(types[r.type][1])+'</span></div><div class="card-info"><h3>'+esc(r.origin)+' → '+esc(r.destination)+'</h3><div class="card-meta"><span>'+icon('clock')+'~'+duration(r.mins)+'</span><span>'+(r.approved?'Fare':'Sample')+' <strong>'+rupees(r.fare)+'</strong></span></div></div>';
  b.onclick=()=>detail(r);return b;
}
function renderCards(){let routes=all?data.routes:data.routes.slice(0,3);$('#route-grid').replaceChildren(...routes.map(card));if(!routes.length)$('#route-grid').append(el('div','Routes are being updated.','empty'));$('#viewall').hidden=data.routes.length<=3;$('#viewall').innerHTML=icon('filter')+(all?'Show fewer':'All routes');}
$('#viewall').onclick=()=>{all=!all;renderCards();};
function detail(r){show(r.origin+' → '+r.destination,'<img class="modal-photo" src="'+esc(r.image||'/images/hero.jpg')+'" alt=""><div class="entry"><strong>'+rupees(r.fare)+(r.approved?' per cab':' · Sample fare')+'</strong>'+esc(r.vehicle)+' · Up to '+r.seats+' passengers · Approx. '+duration(r.mins)+'</div><p>'+esc(r.terms)+'</p><button class="primary" id="pick-route">Choose pickup date</button>');$('#pick-route').onclick=()=>{chooseType(r.type,r.origin,r.destination);modal.close();$('#booking').scrollIntoView();$('#date').focus();};}
$('#spotlight').onclick=()=>{const r=data.routes.find(r=>r.id==='darjeeling');if(r)detail(r);};
$('#help').onclick=()=>{show('Booking help','<p>Choose your route and date to see departures released by the operator. Times are shown in Indian Standard Time.</p><h3>Payments and bookings</h3><p>After payment, open My bookings on this device to see your booking reference and payment status.</p>'+ (data.settings.policy?'<h3>Cancellation and refunds</h3><p>'+esc(data.settings.policy)+'</p>':'')+(data.settings.phone?'<a class="outline" href="tel:'+esc(data.settings.phone)+'">Call '+esc(data.settings.brand)+'</a>':''));};
function changeDate(){modal.close();$('#date').focus();try{$('#date').showPicker();}catch{}}
async function search(e){
  e.preventDefault();const matches=data.routes.filter(r=>r.type===type&&r.origin===$('#origin').value&&r.destination===$('#destination').value);
  const date=$('#date').value, after=Date.parse(date+'T'+($('#time').value||'00:00')+':00+05:30');const g=show('Available cabs','<p>Checking departures…</p>');
  try{const results=await Promise.all(matches.map(async r=>({r,slots:r.approved?(await api('slots?route='+encodeURIComponent(r.id)+'&date='+date)).filter(s=>s.start>=after):[]})));
    if(g!==generation)return;body.replaceChildren();body.append(el('h3',$('#origin').value+' → '+$('#destination').value),el('p',new Intl.DateTimeFormat('en-IN',{dateStyle:'full',timeZone:'Asia/Kolkata'}).format(after)));
    if(!results.some(x=>x.slots.length)){body.append(el('div','No departures are open for this selection. Try another pickup date.','notice'));const b=el('button','Change date','primary');b.onclick=changeDate;body.append(b);return;}
    results.forEach(({r,slots})=>slots.forEach(s=>{const box=el('div',null,'entry');box.append(el('strong',when(s.start)),el('p',r.vehicle+' · '+rupees(r.fare)+' per cab'));const b=el('button',data.payments?'Select cab':'Payments awaiting setup','outline');b.disabled=!data.payments;b.onclick=()=>passenger(r,s);box.append(b);body.append(box);}));
  }catch(err){if(g===generation)body.textContent=err.message;}
}
$('#search').onsubmit=search;
let checkoutJs;
function loadCheckout(){if(window.Razorpay)return Promise.resolve();if(checkoutJs)return checkoutJs;checkoutJs=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.onload=resolve;s.onerror=()=>{checkoutJs=null;reject(Error('Checkout could not load. Please try again.'));};document.head.append(s);});return checkoutJs;}
function passenger(r,s){show('Your booking','<div class="notice"><strong>'+esc(r.origin)+' → '+esc(r.destination)+'</strong><br>'+esc(when(s.start))+' · '+esc(r.vehicle)+'<br>Total '+rupees(r.fare)+'</div><p>'+esc(r.terms)+'</p><form class="form-stack" id="passenger"><label>Passenger name<input name="rider" maxlength="100" autocomplete="name" required></label><label>Mobile number<input name="phone" type="tel" inputmode="tel" pattern="[0-9]{10}" maxlength="10" autocomplete="tel-national" required></label><label>Pickup address or meeting point<input name="pickup" maxlength="240" required></label><label>Drop address<input name="dropoff" maxlength="240" required></label><label>Passengers<input type="number" name="passengers" value="1" min="1" max="'+r.seats+'" required></label><details><summary>Cancellation and refund terms</summary><p>'+esc(data.settings.policy)+'</p></details><label class="check"><input type="checkbox" required>I accept the fare and booking terms.</label><button class="primary">'+(data.mode==='test'?'Test checkout · ':'Pay ')+rupees(r.fare)+'</button><span role="alert" class="err"></span></form>');
  $('#passenger').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;const a=Object.fromEntries(new FormData(f));try{
    await loadCheckout();
    const o=await post('order',{...a,slot:s.id,fare:r.fare,terms:r.terms,policy:data.settings.policy});
    const rec={id:o.id,token:o.token};save(rec);history.replaceState(null,'','#receipt='+o.id+'.'+o.token);
    const checkout=new Razorpay({key:o.key,order_id:o.order,amount:o.amount,currency:'INR',name:data.settings.brand,description:r.origin+' to '+r.destination,prefill:{name:a.rider,contact:'+91'+a.phone},theme:{color:'#45682f'},timeout:Math.max(1,Math.floor((o.expires-Date.now())/1000)),handler:async p=>{try{await post('verify',{id:o.id,payment:p.razorpay_payment_id,signature:p.razorpay_signature},o.token);}finally{await receipt(rec);}},modal:{ondismiss:()=>receipt(rec)}});
    modal.close();checkout.open();
  }catch(err){if(f.isConnected)f.querySelector('.err').textContent=err.message;}finally{b.disabled=false;}};
}
const statusLabel={confirmed:'Ride confirmed',completed:'Ride completed',pending:'Awaiting payment confirmation',expired:'Payment window ended',payment_review:'Payment received · operator review'};
async function receipt(rec){
  const g=show('Booking details','<p>Checking your booking…</p>');
  try{const b=await lookup(rec);if(g!==generation)return;save(rec);
  body.innerHTML='<div class="entry receipt"><strong>'+esc(statusLabel[b.status]||b.status)+'</strong><p>'+esc(b.route)+'<br>'+esc(when(b.start))+'<br>'+esc(b.vehicle)+' · '+rupees(b.price)+'</p>Booking reference <b>'+esc(b.id)+'</b></div><p>'+(b.status==='payment_review'?'The operator needs to arrange an alternative or refund.':b.status==='pending'?'Refresh to check whether payment has been captured.':'Save this private receipt link for access from another device.')+'</p><div class="toolbar"><button class="outline" id="copy">Copy receipt link</button><button class="outline" id="refresh">Refresh status</button></div>';
  $('#refresh').onclick=()=>receipt(rec);$('#copy').onclick=async()=>{const link=location.origin+'/#receipt='+rec.id+'.'+rec.token;try{await navigator.clipboard.writeText(link);$('#copy').textContent='Copied';}catch{body.append(el('p',link,'receipt'));}};
  if(data.settings.phone){const a=el('a','Call operator','outline');a.href='tel:'+data.settings.phone;body.append(a);}
  }catch(err){if(g===generation)body.textContent=err.message;}
}
$('#bookings').onclick=()=>{show('My bookings');const list=stored();if(!list.length){body.append(el('p','Bookings made on this device will appear here. You can also open a saved receipt link.'));return;}for(const rec of list){const b=el('button',rec.id,'outline');b.onclick=()=>receipt(rec);body.append(b);}};
(async()=>{const today=day(Date.now());$('#date').min=today;$('#date').value=today;try{data=await api('catalogue');}catch{try{data.routes=await (await fetch('/routes.json')).json();}catch{}$('#search').append(el('p','Live availability is temporarily unavailable.','error-line'));}
if(data.settings.brand){document.querySelectorAll('[data-brand]').forEach(n=>n.textContent=data.settings.brand);document.title=data.settings.brand+' · Cab booking';}
chooseType(data.routes[0]?.type||'Airport');renderCards();$('#spotlight').hidden=!data.routes.some(r=>r.id==='darjeeling');const m=location.hash.match(/^#receipt=(FC-[A-Z0-9-]+)\.([a-f0-9]{48})$/);if(m)receipt({id:m[1],token:m[2]});})();

