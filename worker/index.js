const utf = new TextEncoder();
const moneyReady = env => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
const baseSettings = {brand:"Foothill Cabs",phone:"",policy:""};
function fail(status,message){throw Object.assign(new Error(message),{status});}
function json(value,status=200,headers={}){return Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});}
function field(value,max=100){return String(value??"").trim().slice(0,max);}
function number(value,min,max){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)fail(400,"Check the number you entered.");return n;}
function hex(buf){return [...new Uint8Array(buf)].map(n=>n.toString(16).padStart(2,"0")).join("");}
function token(){return hex(crypto.getRandomValues(new Uint8Array(24)));}
async function digest(str){return hex(await crypto.subtle.digest("SHA-256",utf.encode(str)));}
async function hmac(secret,data){const key=await crypto.subtle.importKey("raw",utf.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",key,utf.encode(data)));}
function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function owner(req,env){
  if(env.PREVIEW_OWNER_EMAIL && req.headers.get("oai-authenticated-user-id") && req.headers.get("oai-authenticated-user-email")?.toLowerCase()===env.PREVIEW_OWNER_EMAIL.toLowerCase())return true;
  if(!env.OWNER_PASSWORD)return false;
  const match=(req.headers.get("Cookie")||"").match(/(?:^|; )fc_owner=(\d+)\.([a-f0-9]{64})(?:;|$)/);
  return Boolean(match && +match[1]>Date.now() && equal(match[2],await hmac(env.OWNER_PASSWORD,"owner:"+match[1])));
}
async function catalogue(db){
  const overrides=(await db.prepare("SELECT id,data FROM routes").all()).results;
  const map=new Map(seed.map(r=>[r.id,r]));
  let settings={...baseSettings};
  for(const row of overrides){const item=JSON.parse(row.data);if(row.id==="@settings"){settings={...settings,...item};continue;}map.set(row.id,item);}
  return {routes:[...map.values()],settings};
}
async function gateway(env,path,body){
  const response=await fetch("https://api.razorpay.com/v1/"+path,{method:body?"POST":"GET",headers:{Authorization:"Basic "+btoa(env.RAZORPAY_KEY_ID+":"+env.RAZORPAY_KEY_SECRET),"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
  if(!response.ok)fail(502,"Razorpay could not complete the request. Please check your booking before retrying.");
  return response.json();
}
const available="s.closed=0 AND s.start>? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.slot=s.id AND (b.status IN ('confirmed','completed') OR (b.status='pending' AND b.expires>?)))";
function safeRoute(item){
  const r={id:field(item.id)||crypto.randomUUID(),origin:field(item.origin),destination:field(item.destination),type:field(item.type),vehicle:field(item.vehicle),terms:field(item.terms,800),image:field(item.image,600),fare:number(item.fare,1,100000),mins:number(item.mins,10,2880),seats:number(item.seats,1,15),active:item.active===true,approved:item.approved===true};
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(r.id)||!r.origin||!r.destination||!r.vehicle||!["Airport","Hills","Local"].includes(r.type))fail(400,"Enter both locations, a car type and a service category.");
  if(r.image&&!/^\/(?:images\/[a-zA-Z0-9_.-]+|media\/[a-f0-9-]+)$/.test(r.image)&&!/^https:\/\//i.test(r.image))fail(400,"Choose an uploaded photo or an HTTPS image URL.");
  return r;
}
async function captured(env,pay){
  if(pay.status!=="captured")return;
  const db=env.DB, b=await db.prepare("SELECT * FROM bookings WHERE order_id=?").bind(pay.order_id).first();
  if(!b)return;
  if(pay.currency!=="INR"||pay.amount!==b.price*100)fail(409,"Payment amount needs review.");
  // A delayed capture can occupy the original departure only while it is still free.
  await db.prepare(`UPDATE bookings SET payment_id=?,status=CASE WHEN start>? AND EXISTS(SELECT 1 FROM slots WHERE id=bookings.slot AND closed=0) AND NOT EXISTS(SELECT 1 FROM bookings other WHERE other.slot=bookings.slot AND other.id<>bookings.id AND (other.status IN ('confirmed','completed') OR (other.status='pending' AND other.expires>?))) THEN 'confirmed' ELSE 'payment_review' END WHERE id=? AND status='pending'`).bind(pay.id,Date.now(),Date.now(),b.id).run();
}
async function findBooking(req,db,id){
  const b=await db.prepare("SELECT * FROM bookings WHERE id=?").bind(id).first();
  if(!b||!equal(b.token_hash,await digest(req.headers.get("X-Booking-Token")||"")))fail(404,"This booking link is unavailable.");
  return b;
}
function displayBooking(b){
  const {id,start,route,vehicle,price,status,expires,passengers}=b;
  return {id,start,route,vehicle,price,passengers,status:status==="pending"&&expires<Date.now()?"expired":status};
}
async function api(req,env,path){
  const db=env.DB, url=new URL(req.url), post=req.method==="POST";
  const now=Date.now();
  if(post&&path!=="/api/webhook"&&req.headers.get("Origin")!==url.origin)fail(403,"Open this page again to continue.");
  if(req.method!=="GET"&&!post)fail(405,"Method unavailable.");
  if(path==="/api/webhook"&&post){
    if(!env.RAZORPAY_WEBHOOK_SECRET)fail(503,"Payments are not connected.");
    const raw=await req.text();if(!equal(await hmac(env.RAZORPAY_WEBHOOK_SECRET,raw),req.headers.get("x-razorpay-signature")))fail(403,"Invalid signature.");
    const event=JSON.parse(raw);
    if(event.event==="payment.captured"||event.event==="order.paid")await captured(env,event.payload.payment.entity);
    return json({ok:true});
  }
  if(path==="/api/login"&&post){
    const {password}=await req.json();
    if(!env.OWNER_PASSWORD||!equal(await digest(String(password)),await digest(env.OWNER_PASSWORD)))fail(403,"Owner sign-in details were not recognised.");
    const expires=now+12*3600000;
    return json({ok:true},200,{"Set-Cookie":"fc_owner="+expires+"."+await hmac(env.OWNER_PASSWORD,"owner:"+expires)+"; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200"});
  }
  if(path==="/api/logout"&&post)return json({ok:true},200,{"Set-Cookie":"fc_owner=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"});
  if(path.startsWith("/api/admin")&&!await owner(req,env))fail(401,"Sign in to manage your cab service.");
  if(!db)fail(503,"The booking database is being connected.");
  if(path==="/api/catalogue"&&!post){const {routes,settings}=await catalogue(db);return json({routes:routes.filter(r=>r.active),settings,payments:moneyReady(env),mode:env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")?"test":"live"});}
  if(path==="/api/slots"&&!post){
    const date=url.searchParams.get("date")||"";
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))fail(400,"Choose a pickup date.");
    const start=Date.parse(date+"T00:00:00+05:30");
    const rows=await db.prepare("SELECT s.id,s.start FROM slots s WHERE s.route=? AND s.start>=? AND s.start<? AND "+available+" ORDER BY s.start").bind(url.searchParams.get("route"),start,start+86400000,now,now).all();
    return json(rows.results);
  }
  if(path==="/api/order"&&post){
    if(!moneyReady(env))fail(503,"Online payments are awaiting setup.");
    const a=await req.json(), {routes,settings}=await catalogue(db);
    const slot=await db.prepare("SELECT * FROM slots WHERE id=?").bind(field(a.slot)).first();
    const route=routes.find(r=>r.id===slot?.route && r.active && r.approved);
    if(!route || (slot.finish-slot.start)<route.mins*60000)fail(409,"This departure is unavailable. Select another pickup time.");
    if(!settings.policy||!settings.phone)fail(409,"The operator is still setting up booking terms.");
    if(a.fare!==route.fare||a.terms!==route.terms||a.policy!==settings.policy)fail(409,"The fare or terms changed. Refresh and review before paying.");
    const rider=field(a.rider),phone=field(a.phone),pickup=field(a.pickup,240),drop=field(a.dropoff,240),passengers=number(a.passengers,1,route.seats);
    if(!rider||!/^\d{10}$/.test(phone)||!pickup||!drop)fail(400,"Enter your name, 10-digit mobile and pickup and drop addresses.");
    const id="FC-"+crypto.randomUUID().slice(0,8).toUpperCase()+"-"+crypto.randomUUID().slice(0,4).toUpperCase();
    const secret=token(),expires=now+10*60000;
    const hold=await db.prepare("INSERT INTO bookings (id,token_hash,slot,route,start,price,rider,phone,pickup,dropoff,passengers,vehicle,status,expires,created) SELECT ?,?,s.id,?,s.start,?,?,?,?,?,?,?,'pending',?,? FROM slots s WHERE s.id=? AND "+available).bind(id,await digest(secret),route.origin+" → "+route.destination,route.fare,rider,phone,pickup,drop,passengers,route.vehicle,expires,now,slot.id,now,now).run();
    if(!hold.meta.changes)fail(409,"Someone has taken this departure. Choose another time.");
    const order=await gateway(env,"orders",{amount:route.fare*100,currency:"INR",receipt:id});
    await db.prepare("UPDATE bookings SET order_id=? WHERE id=?").bind(order.id,id).run();
    return json({id,token:secret,order:order.id,key:env.RAZORPAY_KEY_ID,amount:route.fare*100,expires});
  }
  if(path==="/api/verify"&&post){
    const a=await req.json(),b=await findBooking(req,db,field(a.id));
    if(!b.order_id||!/^pay_[A-Za-z0-9]+$/.test(a.payment)||!equal(await hmac(env.RAZORPAY_KEY_SECRET,b.order_id+"|"+a.payment),a.signature))fail(400,"Payment verification failed.");
    const pay=await gateway(env,"payments/"+a.payment);
    if(pay.order_id!==b.order_id||pay.id!==a.payment)fail(400,"The payment does not match this booking.");
    await captured(env,pay);return json(displayBooking(await findBooking(req,db,b.id)));
  }
  if(path==="/api/booking"&&!post)return json(displayBooking(await findBooking(req,db,url.searchParams.get("id")||"")));
  if(path==="/api/admin"&&!post){
    const data=await catalogue(db);
    const slots=(await db.prepare("SELECT s.*, (SELECT count(*) FROM bookings b WHERE b.slot=s.id AND (b.status IN ('confirmed','completed') OR (b.status='pending' AND b.expires>?))) AS occupied FROM slots s WHERE s.start>? AND s.closed=0 ORDER BY s.start").bind(now,now).all()).results;
    const page=Math.max(0,Math.min(100000,parseInt(url.searchParams.get("page"))||0));
    const bookings=(await db.prepare("SELECT id,route,start,price,rider,phone,pickup,dropoff,passengers,vehicle,status,expires,payment_id FROM bookings ORDER BY created DESC LIMIT 51 OFFSET ?").bind(page*50).all()).results;
    return json({...data,slots,bookings:bookings.slice(0,50),more:bookings.length>50,payments:moneyReady(env),mode:env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")?"test":"live"});
  }
  if(path==="/api/admin/image"&&post){
    const bytes=new Uint8Array(await req.arrayBuffer());
    if(bytes.length>600000)fail(413,"Choose a photo below 600 KB.");
    const mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?"image/png":String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP"?"image/webp":null;
    if(!mime)fail(400,"Choose a JPG, PNG or WebP photo.");
    const id=crypto.randomUUID();await db.prepare("INSERT INTO images VALUES(?,?,?)").bind(id,mime,bytes.buffer).run();return json({url:"/media/"+id});
  }
  if(path.startsWith("/api/admin/")&&post){
    const a=await req.json();
    if(path==="/api/admin/route"||path==="/api/admin/settings"){
      let id,value;
      if(path.endsWith("/route")){value=safeRoute(a);id=value.id;}
      else{id="@settings";value={brand:field(a.brand,50),phone:field(a.phone,15),policy:field(a.policy,1500)};if(!value.brand||value.phone&&!/^\+?\d{10,13}$/.test(value.phone))fail(400,"Enter a business name and valid support number.");}
      await db.prepare("INSERT INTO routes VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(id,JSON.stringify(value)).run();
    }else if(path.endsWith("/slot")){
      const route=(await catalogue(db)).routes.find(r=>r.id===a.route&&r.active&&r.approved);
      if(!route)fail(400,"Approve this route and fare first.");
      const start=Date.parse(field(a.time)+"+05:30"),vehicle=field(a.vehicle,60).toLowerCase().replace(/\s+/g,"");
      if(!vehicle||!Number.isFinite(start)||start<=now)fail(400,"Enter a vehicle registration and a future pickup time.");
      const finish=start+number(a.blockMinutes,route.mins,10080)*60000;
      const insert=await db.prepare("INSERT INTO slots (id,route,vehicle,start,finish) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM slots WHERE vehicle=? AND closed=0 AND start<? AND finish>?)").bind(crypto.randomUUID(),route.id,vehicle,start,finish,vehicle,finish,start).run();
      if(!insert.meta.changes)fail(409,"That vehicle is already scheduled during this time.");
    }else if(path.endsWith("/close")){
      const change=await db.prepare("UPDATE slots AS s SET closed=1 WHERE s.id=? AND "+available).bind(field(a.id),now,now).run();
      if(!change.meta.changes)fail(409,"This departure is held, booked or already closed.");
    }else if(path.endsWith("/complete")){
      const change=await db.prepare("UPDATE bookings SET status='completed' WHERE id=? AND status='confirmed' AND start<=?").bind(field(a.id),now).run();
      if(!change.meta.changes)fail(409,"Only confirmed rides after pickup can be completed.");
    }else fail(404,"Unknown action.");
    return json({ok:true});
  }
  fail(404,"Page unavailable.");
}
export default {async fetch(req,env){
  const path=new URL(req.url).pathname;
  try{
    if(path.startsWith("/api/"))return await api(req,env,path);
    if(path.startsWith("/media/")){
      const img=await env.DB.prepare("SELECT mime,body FROM images WHERE id=?").bind(path.slice(7)).first();
      return img?new Response(new Uint8Array(img.body),{headers:{"Content-Type":img.mime,"X-Content-Type-Options":"nosniff","Cache-Control":"public,max-age=86400"}}):new Response(null,{status:404});
    }
    const asset=assets[path==="/" ? "/index.html" : ["/admin","/admin/"].includes(path)?"/admin.html":path];
    if(!asset)return new Response("Page not found",{status:404});
    return new Response(Uint8Array.from(atob(asset[1]),c=>c.charCodeAt(0)),{headers:{"Content-Type":asset[0],"X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Cache-Control":"no-cache"}});
  }catch(e){return json({error:e.status?e.message:"The booking service is temporarily unavailable."},e.status||500);}
}};
