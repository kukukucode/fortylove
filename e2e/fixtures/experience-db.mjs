// Isolated browser-test database boundary. Never forwards requests to Supabase.
import { createServer } from 'node:http';
const faqs = [
  { id:'10000000-0000-4000-8000-000000000001',question:'初心者でも参加できますか？',answer:'初心者も歓迎しています。',category:'参加について',sort_order:0,is_published:true,updated_at:'2026-09-06T00:00:00Z' },
  { id:'10000000-0000-4000-8000-000000000002',question:'ラケットの貸し出しについて',answer:'参加予約時にお知らせください。',category:'参加について',sort_order:1,is_published:true,updated_at:'2026-09-06T00:00:00Z' },
];
const events = [
  { id:'30000000-0000-4000-8000-000000000001',title:'初心者歓迎 テニス練習会',location:'早稲田大学テニスコート',starts_at:'2030-09-12T05:00:00Z',ends_at:'2030-09-12T07:00:00Z',capacity:12,description:'初めてラケットを握る方も歓迎する練習会です。運動しやすい服装でお越しください。',event_type:'tennis',reservations:[{id:'reservation-1',status:'reserved'},{id:'reservation-2',status:'reserved'}] },
  { id:'30000000-0000-4000-8000-000000000002',title:'新歓交流イベント',location:'早稲田キャンパス',starts_at:'2030-09-19T09:00:00Z',ends_at:'2030-09-19T11:00:00Z',capacity:20,description:'Fortyloveの雰囲気を知れる交流イベントです。学年やテニス経験を問わず参加できます。',event_type:'event',reservations:[{id:'reservation-3',status:'reserved'}] },
  { id:'30000000-0000-4000-8000-000000000003',title:'秋季ダブルス練習',location:'戸山公園テニスコート',starts_at:'2030-09-26T04:00:00Z',ends_at:'2030-09-26T07:00:00Z',capacity:8,description:'試合形式を中心にしたダブルス練習です。',event_type:'tennis',reservations:[] },
];
createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  let body=''; for await(const chunk of req)body+=chunk;
  res.setHeader('content-type','application/json');
  let data=[];
  if(url.pathname.endsWith('/users')) {
    const id=(url.searchParams.get('id') ?? '').replace('eq.','');
    const user={id,name:'動作確認ユーザー',role:id.endsWith('002')?'member':'super_admin',session_version:1,university:'早稲田大学',faculty:'法学部',grade:1};
    data=req.headers.accept?.includes('object')?user:[user];
  } else if(url.pathname.endsWith('/app_settings')) data=req.headers.accept?.includes('object')?{id:1,recruiting_open:false,chatbot_admin_enabled:false,chatbot_member_enabled:true,chatbot_admin_sources:['admin.md'],chatbot_member_sources:['member.md']}:[{id:1,recruiting_open:false,chatbot_admin_enabled:false,chatbot_member_enabled:true,chatbot_admin_sources:['admin.md'],chatbot_member_sources:['member.md']}];
  else if(url.pathname.endsWith('/events')) data=events;
  else if(url.pathname.endsWith('/reservations')) data=[{event_id:events[0].id,status:'reserved'}];
  else if(url.pathname.endsWith('/event_documents')) data=[];
  else if(url.pathname.endsWith('/faqs')) data=faqs;
  else if(url.pathname.endsWith('/faq_categories'))data=[{id:'category',name:'参加について',sort_order:0}];
  else if(url.pathname.endsWith('/rpc/reorder_faqs')) { const {p_ids}=JSON.parse(body); faqs.sort((a,b)=>p_ids.indexOf(a.id)-p_ids.indexOf(b.id)); data=null; }
  else if(url.pathname.endsWith('/rpc/chatbot_source_inventory'))data=[{source_name:'member.md',record_count:1000,embedded_count:1000,updated_at:'2026-09-06T00:00:00Z'}];
  if(req.headers.prefer?.includes('count=exact'))res.setHeader('content-range',`0-0/${Array.isArray(data)?data.length:1}`);
  res.end(JSON.stringify(data));
}).listen(54329,'127.0.0.1');
