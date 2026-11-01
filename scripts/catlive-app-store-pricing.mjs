import {createPrivateKey, sign} from 'node:crypto';
import https from 'node:https';

// App download pricing is independent from Native in-app purchase pricing.
const appID = '6822558735', bundleID = 'com.hookdeveloper.jaraslive';
const apply = process.env.MAKE_DOWNLOAD_FREE === 'true';
const check = (condition, message) => { if (!condition) throw Error(message); };
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const input = b64({alg:'ES256',kid:process.env.ASC_KEY_ID,typ:'JWT'})+'.'+b64({iss:process.env.ASC_ISSUER_ID,iat:now,exp:now+600,aud:'appstoreconnect-v1'});
const key = createPrivateKey(Buffer.from(process.env.ASC_KEY_BASE64,'base64'));
const token = input+'.'+sign('sha256',Buffer.from(input),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
function api(path, payload) {
  check(/^\/v[123]\//.test(path), 'Unexpected API path');
  check(!payload || (apply && path === '/v1/appPriceSchedules'), 'Only app download pricing may change');
  return new Promise((resolve,reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const request = https.request({hostname:'api.appstoreconnect.apple.com',path,method:body?'POST':'GET',
      headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})}}, response => {
      let text=''; response.setEncoding('utf8');
      response.on('data',part=>{text+=part;}); response.on('error',reject);
      response.on('end',()=>{
        try {
          const data=JSON.parse(text);
          check(response.statusCode>=200 && response.statusCode<300,JSON.stringify({status:response.statusCode,errors:data.errors?.map(e=>({code:e.code,detail:e.detail}))}));
          resolve(data);
        } catch(error) { reject(error); }
      });
    });
    request.setTimeout(30000,()=>request.destroy(Error('App Store API timed out')));
    request.on('error',reject); request.end(body);
  });
}
async function all(path) {
  const result={data:[],included:[]};
  for(let pages=0;path;pages++) {
    check(pages<30,'Unexpected pagination');
    const page=await api(path);
    result.data.push(...page.data); result.included.push(...(page.included??[]));
    path=null;
    if(page.links?.next) {
      const next=new URL(page.links.next);
      check(next.origin==='https://api.appstoreconnect.apple.com','Unexpected pagination host');
      path=next.pathname+next.search;
    }
  }
  return result;
}
function priceRows(result,pointType,relationship) {
  const points=new Map(result.included.filter(p=>p.type===pointType).map(p=>[p.id,p.attributes]));
  return result.data.map(row=>{
    const point=points.get(row.relationships[relationship].data.id);
    check(point && point.customerPrice!=null && Number.isFinite(Number(point.customerPrice)),'Missing price point');
    return {territory:row.relationships.territory.data.id,...row.attributes,price:point.customerPrice};
  });
}
async function purchaseSnapshot() {
  const products=await all(`/v1/apps/${appID}/inAppPurchasesV2?limit=200`);
  const native=products.data.find(p=>p.attributes.productId===`${bundleID}.ipad.native`);
  check(native?.attributes.inAppPurchaseType==='NON_CONSUMABLE','Native lifetime purchase is missing');
  const snapshot=[];
  for(const product of products.data) {
    const schedule=await api(`/v2/inAppPurchases/${product.id}/iapPriceSchedule`);
    const prices=await all(`/v1/inAppPurchasePriceSchedules/${schedule.data.id}/manualPrices?include=inAppPurchasePricePoint,territory&limit=200`);
    snapshot.push({id:product.id,...product.attributes,prices:priceRows(prices,'inAppPurchasePricePoints','inAppPurchasePricePoint')});
  }
  check(snapshot.find(p=>p.id===native.id).prices.some(p=>Number(p.price)>0),'Native lifetime purchase must stay paid');
  return snapshot;
}
const app=await api(`/v1/apps/${appID}`);
check(app.data.id===appID && app.data.attributes.bundleId===bundleID,'Wrong app');
const schedule=await api(`/v1/apps/${appID}/appPriceSchedule?include=baseTerritory`);
const base=schedule.data.relationships.baseTerritory.data.id;
check(base==='BRA','Unexpected base territory; refusing to change it');
const pricesPath=`/v1/appPriceSchedules/${schedule.data.id}/manualPrices?include=appPricePoint,territory&limit=200`;
const before=priceRows(await all(pricesPath),'appPricePoints','appPricePoint');
console.log('DOWNLOAD_BEFORE',JSON.stringify(before));
check(before.length===1 && before[0].territory===base && !before[0].startDate && !before[0].endDate,'Unexpected existing app price schedule');
const options=await all(`/v1/apps/${appID}/appPricePoints?filter[territory]=${base}&limit=200`);
const free=options.data.find(p=>p.attributes.customerPrice!=null && Number(p.attributes.customerPrice)===0);
check(free?.type==='appPricePoints','Apple did not return a free download price point');
console.log('FREE_DOWNLOAD_POINT',free.id);
const purchases=await purchaseSnapshot();
console.log('IN_APP_PURCHASES_BEFORE',JSON.stringify(purchases));
if(apply && Number(before[0].price)!==0) {
  const id='${newprice-0}';
  await api('/v1/appPriceSchedules',{
    data:{type:'appPriceSchedules',relationships:{app:{data:{type:'apps',id:appID}},
      baseTerritory:{data:{type:'territories',id:base}},manualPrices:{data:[{type:'appPrices',id}]}}},
    included:[{type:'appPrices',id,attributes:{startDate:null,endDate:null},
      relationships:{appPricePoint:{data:{type:'appPricePoints',id:free.id}}}}]
  });
}
const after=priceRows(await all(pricesPath),'appPricePoints','appPricePoint');
console.log('DOWNLOAD_AFTER',JSON.stringify(after));
if(apply) {
  check(after.length>0 && after.every(p=>Number(p.price)===0),'Free download has not been confirmed');
  check(JSON.stringify(await purchaseSnapshot())===JSON.stringify(purchases),'In-app purchase configuration changed during verification');
  const automatic=priceRows(await all(`/v1/appPriceSchedules/${schedule.data.id}/automaticPrices?include=appPricePoint,territory&limit=200`),'appPricePoints','appPricePoint');
  check(automatic.every(p=>Number(p.price)===0),'Some automatic territories are still paid');
  console.log('FREE_DOWNLOAD_CONFIRMED',JSON.stringify({appID,base,automaticTerritories:automatic.length,inAppPurchasesUnchanged:true}));
}
console.log('PRICING_CHECK_COMPLETE',apply?'applied':'read-only');
