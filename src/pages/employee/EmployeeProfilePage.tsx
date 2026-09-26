import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import AvatarUpload from '@/components/shared/AvatarUpload';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type FormState = { full_name:string; phone:string; address:string; state:string; lga:string; country:string; bank_name:string; account_number:string; account_name:string; };
const empty: FormState = {full_name:'',phone:'',address:'',state:'',lga:'',country:'Nigeria',bank_name:'',account_number:'',account_name:''};

export default function EmployeeProfilePage() {
 const user=useAuthStore(s=>s.user); const [form,setForm]=useState<FormState>(empty);
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
 useEffect(()=>{(async()=>{if(!user?.id)return; setLoading(true); const [{data:p},{data:s}] = await Promise.all([
   supabase.from('profiles').select('full_name,phone').eq('id',user.id).maybeSingle(),
   supabase.from('staff_profiles').select('address,state,lga,country,bank_name,account_number,account_name').eq('user_id',user.id).maybeSingle()
 ]); setForm({...empty,full_name:p?.full_name??user.full_name??'',phone:p?.phone??user.phone??'',...(s??{})});setLoading(false)})()},[user?.id]);
 const change=(key:keyof FormState)=>(e:React.ChangeEvent<HTMLInputElement>)=>setForm(v=>({...v,[key]:e.target.value}));
 async function submit(e:FormEvent){e.preventDefault();if(!user)return;setSaving(true);setMessage('');setError('');
  const {error:pe}=await supabase.from('profiles').update({full_name:form.full_name,phone:form.phone,updated_at:new Date().toISOString()}).eq('id',user.id);
  const {error:se}=await supabase.from('staff_profiles').upsert({user_id:user.id,address:form.address,state:form.state,lga:form.lga,country:form.country,bank_name:form.bank_name,account_number:form.account_number,account_name:form.account_name,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  setSaving(false); if(pe||se){setError(pe?.message||se?.message||'Could not save changes.');return;} setMessage('Your profile and payout details have been saved.'); await useAuthStore.getState().initializeAuth();
 }
 if(loading)return <section><PageHeader eyebrow="Your account" title="Profile" description="Loading your saved details…" /><div className="content-card">Loading profile…</div></section>;
 return <section><PageHeader eyebrow="Your account" title="Profile" description="Keep your personal, address and salary-payment details up to date."/>
 <form className="dashboard-grid two-col" onSubmit={submit}>
  <div className="content-card"><h2>Profile photo</h2><AvatarUpload name={form.full_name || user?.full_name || 'Employee'} /></div>
  <div className="content-card"><h2>Personal details</h2><div className="form">{[['full_name','Full name'],['phone','Phone number']].map(([k,l])=><label key={k}>{l}<input value={form[k as keyof FormState]} onChange={change(k as keyof FormState)} required={k==='full_name'}/></label>)}</div></div>
  <div className="content-card"><h2>Address</h2><div className="form">{[['address','Residential address'],['lga','LGA'],['state','State'],['country','Country']].map(([k,l])=><label key={k}>{l}<input value={form[k as keyof FormState]} onChange={change(k as keyof FormState)} required/></label>)}</div></div>
  <div className="content-card span-2"><h2>Bank and payout details</h2><p className="muted">These details are used for salary payments after deployment.</p><div className="form three-col">{[['bank_name','Bank name'],['account_number','Account number'],['account_name','Account name']].map(([k,l])=><label key={k}>{l}<input value={form[k as keyof FormState]} onChange={change(k as keyof FormState)} required/></label>)}</div></div>
  <div className="content-card span-2">{message&&<p className="success-message"><CheckCircle2 size={15}/> {message}</p>}{error&&<p className="error">{error}</p>}<button className="btn btn-primary" disabled={saving}>{saving?<><Loader2 className="spin" size={16}/> Saving…</>:'Save changes'}</button></div>
 </form></section>;
}