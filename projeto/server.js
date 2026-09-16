const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3000;
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const INTERNAL_AI_VERSION = 'People RH IA Interna 1.0';
const root = path.join(__dirname, 'banco_talentos');
const RETENTION_DAYS = 90;

if (!process.env.DATABASE_URL) {
  console.error('ERRO: variável DATABASE_URL não definida. Configure a conexão com o PostgreSQL (ex.: Neon) antes de iniciar.');
  process.exit(1);
}
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error('ERRO: defina ADMIN_EMAIL e ADMIN_PASSWORD nas variáveis de ambiente do servidor.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function ensureSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
}

async function sendResendEmail(to,subject,text){
  const key=process.env.RESEND_API_KEY, from=process.env.EMAIL_FROM;
  if(!key||!from) return {sent:false,provider:'email',reason:'RESEND_API_KEY ou EMAIL_FROM não configurado'};
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({from,to,subject,text})});
  const body=await r.text(); if(!r.ok) throw new Error(`Resend: ${body}`); return {sent:true,provider:'email'};
}
async function sendWhatsApp(phone,text){
  const token=process.env.WHATSAPP_TOKEN, phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  const digits=String(phone||'').replace(/\D/g,''); const normalized=digits.length<=11?'55'+digits:digits;
  if(!token||!phoneId||!normalized) return {sent:false,provider:'whatsapp',reason:'WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID ou telefone não configurado'};
  const r=await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({messaging_product:'whatsapp',to:normalized,type:'text',text:{body:text}})});
  const body=await r.text(); if(!r.ok) throw new Error(`WhatsApp Cloud API: ${body}`); return {sent:true,provider:'whatsapp'};
}

function clean(v){return String(v||'').trim()}
function firstName(name){return clean(name).split(/\s+/)[0]||'Candidato'}
function listAvailable(c){
  const fields=[];
  if(clean(c.role)) fields.push(`área de interesse em ${clean(c.role)}`);
  if(clean(c.education)||clean(c.course)) fields.push(`formação em ${[c.education,c.course].filter(Boolean).join(' — ')}`);
  if(clean(c.experience)) fields.push(`experiência informada de ${clean(c.experience)}`);
  if(clean(c.lastRole)||clean(c.lastCompany)) fields.push(`atuação mais recente como ${clean(c.lastRole)||'profissional'}${clean(c.lastCompany)?` na empresa ${clean(c.lastCompany)}`:''}`);
  if(clean(c.summary)) fields.push(`resumo profissional: ${clean(c.summary)}`);
  if(clean(c.languages)) fields.push(`idiomas: ${clean(c.languages)}`);
  if(clean(c.tools)) fields.push(`conhecimentos/ferramentas: ${clean(c.tools)}`);
  if(clean(c.availability)) fields.push(`disponibilidade: ${clean(c.availability)}`);
  if(clean(c.salary)) fields.push(`pretensão salarial: ${clean(c.salary)}`);
  return fields;
}
function internalVacancyDescription(v={}){
  const title=clean(v.title)||'Oportunidade em aberto';
  const area=clean(v.area), location=clean(v.location), type=clean(v.type), seniority=clean(v.seniority);
  const resp=clean(v.responsibilities), req=clean(v.requirements), diff=clean(v.differentials), benefits=clean(v.benefits), schedule=clean(v.schedule), salary=clean(v.salaryRange);
  const intro=[`Estamos buscando profissional para atuar como ${title}.`, area?`A posição está inserida na área de ${area}.`: '', location?`Localização: ${location}.`: '', seniority?`Nível: ${seniority}.`: '', type?`Tipo de contratação: ${type}.`: ''].filter(Boolean).join(' ');
  const out=[intro];
  if(resp) out.push(`\nPRINCIPAIS RESPONSABILIDADES\n${resp}`);
  if(req) out.push(`\nREQUISITOS\n${req}`);
  if(diff) out.push(`\nDIFERENCIAIS\n${diff}`);
  const conditions=[schedule&&`Horário: ${schedule}`,salary&&`Faixa salarial: ${salary}`,benefits&&`Benefícios: ${benefits}`].filter(Boolean);
  if(conditions.length) out.push(`\nCONDIÇÕES\n${conditions.join('\n')}`);
  out.push('\nA descrição foi organizada pela IA interna exclusivamente com base nas informações cadastradas, sem criação de requisitos não informados.');
  return out.join('\n');
}
function internalParecer(body){
  const c=body.candidate||{}, v=body.vacancy||{};
  const name=clean(c.name)||'Candidato';
  const available=listAvailable(c);
  const role=clean(c.role), vacancy=clean(v.title), requirements=clean(v.requirements), responsibilities=clean(v.responsibilities);
  const disc=clean(c.discPrimary);
  const exp1=[clean(c.exp1Company),clean(c.exp1Role),clean(c.exp1Activities)].filter(Boolean).join(' — ');
  const exp2=[clean(c.exp2Company),clean(c.exp2Role),clean(c.exp2Activities)].filter(Boolean).join(' — ');
  const extra=clean(body.extraText);
  const focus=clean(body.focus);
  const custom=clean(body.prompt);
  let fit='';
  if(vacancy){
    const matches=[];
    if(role) matches.push(`a área/cargo de interesse informado (${role})`);
    if(exp1) matches.push('a experiência profissional mais recente disponível no cadastro');
    if(requirements) matches.push('os requisitos registrados para a vaga');
    fit=matches.length?`Em relação à vaga de ${vacancy}, há elementos que permitem uma análise inicial de aderência, especialmente considerando ${matches.join(', ')}. ${requirements?'A comparação deve ser confirmada ponto a ponto com os requisitos cadastrados e com as informações obtidas na entrevista.':'Como a vaga possui informações parciais, a aderência deve ser aprofundada durante a entrevista.'}`:`Para a vaga de ${vacancy}, os dados disponíveis ainda não permitem concluir aderência de forma ampla. Recomenda-se utilizar a entrevista para validar requisitos e responsabilidades da posição.`;
  } else {
    fit='Sem uma vaga específica vinculada, o parecer considera o perfil cadastrado e aponta elementos úteis para triagem e definição de próximas etapas.';
  }
  const p1=`Parecer profissional — ${name}. A análise foi elaborada exclusivamente a partir das informações atualmente disponíveis no cadastro${vacancy?` e da vaga ${vacancy}`:''}. ${available.length?`Foram identificados os seguintes elementos: ${available.join('; ')}.`:'O cadastro apresenta informações limitadas neste momento; por isso, a análise é inicial e não penaliza a ausência de campos não preenchidos.'}`;
  const p2=`Quanto à trajetória, ${exp1?`a última experiência registrada é ${exp1}.`:''}${exp2?` Também consta experiência anterior: ${exp2}.`:''}${!exp1&&!exp2?(clean(c.lastRole)||clean(c.lastCompany)?`há registro de atuação como ${clean(c.lastRole)||'profissional'}${clean(c.lastCompany)?` em ${clean(c.lastCompany)}`:''}.`:'não há experiências detalhadas suficientes para uma avaliação aprofundada neste momento.') : ''} ${fit}`;
  const strengths=[];
  if(role) strengths.push(`clareza sobre a área/cargo de interesse (${role})`);
  if(clean(c.summary)) strengths.push('existência de resumo profissional para contextualização do perfil');
  if(exp1||exp2||clean(c.experience)) strengths.push('presença de histórico de experiência profissional');
  if(clean(c.education)||clean(c.course)) strengths.push('formação registrada');
  if(disc) strengths.push(`perfil DISC ${disc}, considerado apenas como referência comportamental não diagnóstica`);
  const p3=`Pontos favoráveis observáveis: ${strengths.length?strengths.join('; ')+'.':'os dados disponíveis ainda são insuficientes para apontar diferenciais objetivos.'} ${extra?`O contexto adicional informado pelo administrador também deve ser considerado: ${extra}`:''}`;
  const attention=[];
  if(!clean(c.email)) attention.push('e-mail não informado');
  if(!clean(c.phone)) attention.push('telefone/WhatsApp não informado');
  if(!exp1&&!exp2&&!clean(c.experience)) attention.push('detalhamento de experiências ainda não informado');
  if(!clean(c.education)&&!clean(c.course)) attention.push('formação não informada');
  if(!disc) attention.push('DISC ainda não concluído');
  const p4=`Pontos de atenção e recomendação: ${attention.length?`os campos que permanecem pendentes são ${attention.join('; ')}. A ausência dessas informações não impede a geração do parecer, mas indica pontos que podem ser validados posteriormente.`:'não foram identificadas lacunas relevantes entre os dados fornecidos para esta análise inicial.'} Recomenda-se avançar para entrevista${vacancy?' para validar aderência técnica, experiências e disponibilidade em relação à vaga.':' ou complementar o cadastro conforme a necessidade do processo.'}${focus?` Foco solicitado: ${focus}.`:''}${custom&&custom!==''?` Instrução considerada: ${custom}`:''}`;
  return [p1,p2,p3,p4].join('\n\n');
}
function internalAI(body){
  if(body.type==='vaga') return internalVacancyDescription(body.vacancy||{});
  return internalParecer(body);
}

function pdfEscape(str){
  return String(str||'').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/\r?\n/g,' ')
    .replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/—/g,'-').replace(/–/g,'-').replace(/…/g,'...').replace(/[😊🍀🌐📱📅⏰💻🔗📌🚫❌✅]/g,'');
}
function makeSimplePDF(title, sections, candidate, applications){
  const lines=[];
  lines.push(title||'Perfil profissional');
  lines.push('People RH ATS - Recrutamento & Selecao');
  lines.push('');
  const add=(heading,items)=>{lines.push(heading.toUpperCase()); for(const [k,v] of items){ if(v!==undefined && v!==null && String(v).trim()) lines.push(`${k}: ${v}`); } lines.push('');};
  const c=candidate||{};
  if(sections.includes('summary')) add('Resumo profissional',[['Candidato',c.name],['Resumo',c.summary]]);
  if(sections.includes('personal')) add('Dados pessoais e contato',[['Nome',c.name],['E-mail',c.email],['Telefone / WhatsApp',c.phone],['Cidade',c.city],['Estado',c.state],['LinkedIn',c.linkedin],['Portfólio',c.portfolio]]);
  if(sections.includes('professional')) add('Formação e perfil profissional',[['Área de interesse',c.role],['Escolaridade',c.education],['Curso / formação',c.course],['Experiência',c.experience],['Último cargo',c.lastRole],['Última empresa',c.lastCompany],['Pretensão salarial',c.salary],['Disponibilidade',c.availability]]);
  if(sections.includes('exp1')) add('Última experiência profissional',[['Empresa',c.exp1Company],['Cargo',c.exp1Role],['Período',`${c.exp1Start||'-'} a ${c.exp1End||'-'}`],['Atividades',c.exp1Activities]]);
  if(sections.includes('exp2')) add('Penúltima experiência profissional',[['Empresa',c.exp2Company],['Cargo',c.exp2Role],['Período',`${c.exp2Start||'-'} a ${c.exp2End||'-'}`],['Atividades',c.exp2Activities]]);
  if(sections.includes('additional')) add('Informações complementares',[['Idiomas',c.languages],['Conhecimentos e ferramentas',c.tools],['Disponibilidade para viagens',c.travel],['CNH',c.cnh]]);
  if(sections.includes('disc')) add('Perfil comportamental DISC',[['Perfil predominante',c.discPrimary],['Distribuição D/I/S/C',JSON.stringify(c.discScores||{})],['Leitura',c.discPrimary?'Referência comportamental, não diagnóstica.':'Não concluído']]);
  if(sections.includes('applications')) add('Candidaturas e etapas',(applications||[]).map(a=>['Vaga / etapa',`${a.vacancy||'-'} - ${a.status||'-'} (${a.createdAt?new Date(a.createdAt).toLocaleDateString('pt-BR'):'-'})`]));
  if(sections.includes('parecer') && candidate?.lastAIParecer) add('Parecer com IA',[['Parecer',candidate.lastAIParecer],['Gerado em',candidate.lastAIParecerAt?new Date(candidate.lastAIParecerAt).toLocaleString('pt-BR'):'-']]);
  lines.push('Documento gerado pelo administrador para avaliação do cliente.');
  const pageLines=[]; let page=[]; const wrap=(text,max=92)=>{const words=String(text||'').split(/\s+/);let cur='';for(const w of words){if((cur+' '+w).trim().length>max){page.push(cur);cur=w;}else cur=(cur+' '+w).trim();}if(cur)page.push(cur);};
  for(const line of lines) wrap(line);
  const pages=[]; const per=46; for(let i=0;i<page.length;i+=per) pages.push(page.slice(i,i+per));
  const objs=[]; const addObj=x=>{objs.push(x);return objs.length;};
  const catalog=addObj(''); const pagesObj=addObj(''); const font=addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageRefs=[];
  for(const pg of pages){let stream='BT /F1 10 Tf 48 790 Td 14 TL '; for(let i=0;i<pg.length;i++){const text=pdfEscape(pg[i]); if(i===0)stream+=`(${text}) Tj `; else stream+=`T* (${text}) Tj `;} stream+='ET'; const streamObj=addObj(`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`); const pageObj=addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${streamObj} 0 R >>`); pageRefs.push(pageObj);}
  objs[0]='<< /Type /Catalog /Pages 2 0 R >>'; objs[1]=`<< /Type /Pages /Kids [${pageRefs.map(n=>n+' 0 R').join(' ')}] /Count ${pageRefs.length} >>`;
  let pdf='%PDF-1.4\n'; const offsets=[0]; for(let i=0;i<objs.length;i++){offsets[i+1]=Buffer.byteLength(pdf,'latin1');pdf+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf,'latin1'); pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`; for(let i=1;i<=objs.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n'; pdf+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf,'latin1');
}

const SESSION_DAYS = 30;

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setSessionCookie(res, sid, maxAgeSeconds) {
  const parts = [`sid=${sid}`, 'HttpOnly', 'Path=/', `Max-Age=${maxAgeSeconds}`, 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  const parts = ['sid=', 'HttpOnly', 'Path=/', 'Max-Age=0', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function loadSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies.sid;
  if (!sid) return null;
  const { rows } = await pool.query('SELECT * FROM sessions WHERE id=$1 AND expires_at > NOW()', [sid]);
  if (!rows.length) return null;
  return rows[0];
}

async function createSession(res, type, candidateId) {
  const sid = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await pool.query(
    'INSERT INTO sessions (id, session_type, candidate_id, expires_at) VALUES ($1,$2,$3,$4)',
    [sid, type, candidateId || null, expiresAt]
  );
  setSessionCookie(res, sid, SESSION_DAYS * 86400);
  return sid;
}

async function requireAdmin(req, res, next) {
  const session = await loadSession(req);
  if (!session || session.session_type !== 'admin') return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
  req.session = session;
  next();
}

async function requireCandidate(req, res, next) {
  const session = await loadSession(req);
  if (!session || session.session_type !== 'candidate') return res.status(401).json({ error: 'Sessão de candidato inválida ou expirada.' });
  req.session = session;
  next();
}

async function getState() {
  const { rows } = await pool.query('SELECT payload FROM app_state WHERE id=1');
  const payload = rows[0]?.payload || { candidates: [], vacancies: [], applications: [], history: [] };
  payload.candidates = payload.candidates || [];
  payload.vacancies = payload.vacancies || [];
  payload.applications = payload.applications || [];
  payload.history = payload.history || [];
  return payload;
}

async function saveState(payload) {
  await pool.query('UPDATE app_state SET payload=$1, updated_at=NOW() WHERE id=1', [JSON.stringify(payload)]);
}

function newId() { return crypto.randomUUID(); }

const app = express();
app.use(express.json({ limit: '15mb' }));

// ---------- Autenticação ----------

app.post('/api/auth/login', async (req, res) => {
  try {
    const { area, email, password } = req.body || {};
    const em = String(email || '').trim().toLowerCase();
    const pass = String(password || '');
    if (!em || !pass) return res.status(400).json({ error: 'Informe e-mail e senha.' });

    if (area === 'admin') {
      if (em !== String(process.env.ADMIN_EMAIL).trim().toLowerCase() || pass !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'E-mail ou senha administrativa inválidos.' });
      }
      await createSession(res, 'admin', null);
      return res.json({ ok: true, type: 'admin', email: em });
    }

    const { rows } = await pool.query('SELECT * FROM candidate_credentials WHERE email=$1', [em]);
    const cred = rows[0];
    if (!cred || !(await bcrypt.compare(pass, cred.password_hash))) {
      return res.status(401).json({ error: 'Cadastro não encontrado ou senha incorreta.' });
    }
    await createSession(res, 'candidate', cred.id);
    return res.json({ ok: true, type: 'candidate', id: cred.id, email: cred.email });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const cookies = parseCookies(req);
    if (cookies.sid) await pool.query('DELETE FROM sessions WHERE id=$1', [cookies.sid]);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const session = await loadSession(req);
    if (!session) return res.json({ type: null });
    if (session.session_type === 'admin') return res.json({ type: 'admin', email: process.env.ADMIN_EMAIL });
    const state = await getState();
    const candidate = state.candidates.find(c => c.id === session.candidate_id);
    return res.json({ type: 'candidate', id: session.candidate_id, email: candidate?.email, name: candidate?.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Candidato ----------

app.post('/api/candidates/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body || {};
    const em = String(email || '').trim().toLowerCase();
    const nm = String(name || '').trim();
    if (!nm || !em || !password) return res.status(400).json({ error: 'Preencha nome, e-mail e senha.' });
    if (String(password).length < 6) return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres.' });

    const existing = await pool.query('SELECT id FROM candidate_credentials WHERE email=$1', [em]);
    if (existing.rows.length) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });

    const id = newId();
    const hash = await bcrypt.hash(String(password), 10);
    await pool.query('INSERT INTO candidate_credentials (id, email, password_hash) VALUES ($1,$2,$3)', [id, em, hash]);

    const now = new Date().toISOString();
    const state = await getState();
    state.candidates.push({
      id, name: nm, email: em, phone: phone || '', city: '', role: '', status: 'Disponível',
      notes: '', resume: '', discAnswers: [], createdAt: now,
      expiresAt: new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString(),
    });
    state.history.push({ id: newId(), candidateId: id, action: 'Cadastro criado', details: 'Conta de candidato criada na plataforma.', actor: 'Candidato', at: now });
    await saveState(state);

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/candidates/me', requireCandidate, async (req, res) => {
  try {
    const state = await getState();
    const candidate = state.candidates.find(c => c.id === req.session.candidate_id);
    if (!candidate) return res.status(404).json({ error: 'Cadastro não encontrado.' });
    const history = state.history.filter(h => h.candidateId === req.session.candidate_id);
    return res.json({ candidate, history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/candidates/me', requireCandidate, async (req, res) => {
  try {
    const { candidate, history } = req.body || {};
    if (!candidate || typeof candidate !== 'object') return res.status(400).json({ error: 'Dados inválidos.' });
    const state = await getState();
    const idx = state.candidates.findIndex(c => c.id === req.session.candidate_id);
    const merged = { ...(idx >= 0 ? state.candidates[idx] : {}), ...candidate, id: req.session.candidate_id };
    if (idx >= 0) state.candidates[idx] = merged; else state.candidates.push(merged);

    if (Array.isArray(history)) {
      const existingIds = new Set(state.history.map(h => h.id));
      for (const h of history) {
        if (h && h.candidateId === req.session.candidate_id && !existingIds.has(h.id)) {
          state.history.push(h);
          existingIds.add(h.id);
        }
      }
    }
    await saveState(state);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/vacancies', async (req, res) => {
  try {
    const state = await getState();
    const open = state.vacancies.filter(v => v && v.status === 'Aberta');
    res.json(open);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Compatível com a página pública /vagas, que já consome este endpoint
app.get('/api/public/vagas', async (req, res) => {
  try {
    const state = await getState();
    res.json(state.vacancies.filter(v => v && v.status === 'Aberta'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/applications', requireCandidate, async (req, res) => {
  try {
    const { vacancyId } = req.body || {};
    const state = await getState();
    const vacancy = state.vacancies.find(v => v.id === vacancyId);
    if (!vacancy) return res.status(404).json({ error: 'Vaga não encontrada.' });
    const already = state.applications.some(a => a.vacancyId === vacancyId && a.candidateId === req.session.candidate_id);
    if (already) return res.status(409).json({ error: 'Você já se candidatou a esta vaga.' });

    const now = new Date().toISOString();
    const application = { id: newId(), candidateId: req.session.candidate_id, vacancyId, status: 'Recebida', createdAt: now, updatedAt: now };
    state.applications.push(application);

    const candidate = state.candidates.find(c => c.id === req.session.candidate_id);
    if (candidate && candidate.status === 'Disponível') candidate.status = 'Em processo';
    state.history.push({ id: newId(), candidateId: req.session.candidate_id, action: 'Candidatura recebida', details: 'Candidato se candidatou à vaga.', actor: 'Candidato', at: now });

    await saveState(state);
    res.json({ ok: true, application });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/applications/me', requireCandidate, async (req, res) => {
  try {
    const state = await getState();
    const apps = state.applications.filter(a => a.candidateId === req.session.candidate_id);
    res.json(apps);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Administrador ----------

app.get('/api/admin/state', requireAdmin, async (req, res) => {
  try {
    res.json(await getState());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/state', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const payload = {
      candidates: Array.isArray(body.candidates) ? body.candidates : [],
      vacancies: Array.isArray(body.vacancies) ? body.vacancies : [],
      applications: Array.isArray(body.applications) ? body.applications : [],
      history: Array.isArray(body.history) ? body.history : [],
    };
    await saveState(payload);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- IA interna, PDF, e-mail/WhatsApp e utilitários ----------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: true, model: INTERNAL_AI_VERSION, provider: 'internal' });
});

app.get('/api/ai-test', (req, res) => {
  res.json({ ok: true, text: 'CONEXAO_IA_INTERNA_OK', provider: 'internal' });
});

app.post('/api/candidate-pdf', (req, res) => {
  try {
    const body = req.body || {};
    const pdf = makeSimplePDF(body.title, Array.isArray(body.sections) ? body.sections : [], body.candidate || {}, body.applications || []);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="perfil-candidato.pdf"', 'Cache-Control': 'no-store' });
    res.end(pdf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/notify', async (req, res) => {
  try {
    const body = req.body || {};
    const c = body.candidate || {}, v = body.vacancy || {}, stage = body.stage || 'Recebida';
    const first = (c.name || 'candidato').trim().split(/\s+/)[0], job = v.title || 'nossa oportunidade';
    const text = body.message || `Olá, ${first}! Temos uma atualização sobre sua candidatura para a vaga de ${job}. Você avançou para a etapa ${stage} do processo seletivo. Em breve enviaremos os próximos passos.`;
    const emailSubject = `Atualização da sua candidatura — ${job}`;
    const emailText = `Olá, ${first}!\n\nTemos uma atualização sobre sua candidatura para a vaga de ${job}.\n\nNova etapa: ${stage}.\n\n${text}\n\nMarcelly Chagas — Recrutamento`;
    const results = {};
    if (c.email) { try { results.email = await sendResendEmail(c.email, emailSubject, emailText); } catch (e) { results.email = { sent: false, provider: 'email', reason: e.message }; } }
    if (c.phone) { try { results.whatsapp = await sendWhatsApp(c.phone, text); } catch (e) { results.whatsapp = { sent: false, provider: 'whatsapp', reason: e.message }; } }
    res.json({ ok: true, results, configured: { email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM), whatsapp: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cep', async (req, res) => {
  const cep = String(req.query.cep || '').replace(/\D/g, '');
  if (cep.length !== 8) return res.status(400).json({ error: 'CEP deve conter 8 dígitos.' });
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: 'application/json' } });
    const d = await r.json();
    if (!r.ok) throw new Error(`ViaCEP HTTP ${r.status}`);
    if (d.erro) return res.status(404).json({ error: 'CEP não encontrado.', notFound: true });
    return res.json(d);
  } catch (e) {
    try {
      const r2 = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { headers: { Accept: 'application/json' } });
      if (r2.ok) {
        const d2 = await r2.json();
        return res.json({ cep: d2.cep, logradouro: d2.street || '', bairro: d2.neighborhood || '', localidade: d2.city || '', uf: d2.state || '' });
      }
    } catch {}
    return res.status(502).json({ error: 'Não foi possível consultar o CEP no momento.' });
  }
});

app.post('/api/ai', (req, res) => {
  try {
    const text = internalAI(req.body || {});
    res.json({ text, provider: 'internal' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Arquivos estáticos ----------

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

app.get(/.*/, (req, res) => {
  let url = req.path;
  if (url === '/') url = '/index.html';
  if (url === '/vagas') url = '/public_vagas.html';
  const file = path.normalize(path.join(root, url));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.set('Cache-Control', 'no-store');
  res.type(mime[path.extname(file)] || 'application/octet-stream');
  res.send(fs.readFileSync(file));
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`People RH ATS: http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Falha ao preparar o banco de dados:', err.message);
    process.exit(1);
  });
