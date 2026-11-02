(()=>{'use strict';
const D=window.LESSON_DATA, TYPES=['listen','translate','qa','spell','reorder','phonics'];
const names={listen:'聽音選單字',translate:'情境翻譯',qa:'情境問答',spell:'單字拼寫',reorder:'句型重組',phonics:'自然發音辨識'};
const examCounts={listen:6,translate:3,qa:3,spell:3,reorder:3,phonics:5};
const infiniteCounts={listen:6,translate:3,qa:3,spell:3,reorder:3,phonics:2};
const points={listen:5,translate:5,qa:5,spell:5,reorder:5,phonics:2};
const key='english_review_v2_heigebao';
let db;try{db=JSON.parse(localStorage.getItem(key))||{}}catch{db={}};
db.stats=db.stats||{};db.records=db.records||[];db.version=2;
const $=s=>document.querySelector(s), root=$('#app');
let screen='home',game=null,dialog=null,feedbackTimer=null,currentAudio=null,audioTimer=null,filter='全部',returnView='home';
const all=[...D.words,...D.sentences];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rand=a=>a[Math.floor(Math.random()*a.length)];
const shuffle=a=>[...a].sort(()=>Math.random()-.5);
const save=()=>{try{localStorage.setItem(key,JSON.stringify(db))}catch(e){alert('學習紀錄儲存失敗：'+e.message)}};
const shortDate=iso=>new Date(iso).toLocaleString('zh-TW',{hour12:false});
const duration=ms=>{let s=Math.floor(ms/1000);return `${Math.floor(s/60)}分${String(s%60).padStart(2,'0')}秒`};
const stats=id=>db.stats[id]||{total:0,correct:0,recent:[]};
const accuracy=id=>{let a=stats(id).recent;return a.length?Math.round(a.filter(Boolean).length/a.length*100):null};
const weight=id=>{let s=stats(id),p=accuracy(id);return !s.total?10:(p<100?6:2)/(1+.1*s.total)};
function weighted(items){let total=items.reduce((a,x)=>a+weight(x.id),0),r=Math.random()*total;for(let x of items){r-=weight(x.id);if(r<=0)return x}return items.at(-1)}
function updateStats(q,ok){let s=stats(q.itemId);s.total++;if(ok)s.correct++;s.recent.push(ok);s.recent=s.recent.slice(-5);db.stats[q.itemId]=s;save()}
// 音檔在顯示題目時預先查詢並預載；播放時不再臨時等待字典查詢。
let voiceSeq=0, currentFinish=null;
const audioCache=new Map(), audioPromises=new Map(), audioElements=new Map();
function voiceStop(){voiceSeq++;if(currentAudio){currentAudio.pause();currentAudio.currentTime=0;currentAudio=null}if(window.speechSynthesis)window.speechSynthesis.cancel();if(audioTimer){clearTimeout(audioTimer);audioTimer=null}if(currentFinish){const done=currentFinish;currentFinish=null;done()}}
function primeSpeech(){if(!('speechSynthesis' in window))return;window.speechSynthesis.getVoices();}
function getDictionaryAudio(text){
 const word=String(text).trim();if(!/^[a-z]+$/i.test(word))return Promise.resolve(null);
 const id=word.toLowerCase();if(audioPromises.has(id))return audioPromises.get(id);
 const promise=(async()=>{let timer;try{
  const ctl=new AbortController();timer=setTimeout(()=>ctl.abort(),2400);
  const res=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(id),{signal:ctl.signal});
  if(!res.ok)return null;const data=await res.json();
  const entries=data.flatMap(v=>v.phonetics||[]).filter(v=>v.audio);
  const us=entries.find(v=>/_us(?:_|\.|\b)|us_pron|american/i.test(v.audio)||/us|american/i.test(v.text||''));
  if(!us)return null;
  let url=us.audio.startsWith('//')?'https:'+us.audio:us.audio;
  if(!/^https:\/\//i.test(url))return null;
  audioCache.set(id,url);const audio=new Audio();audio.preload='auto';audio.src=url;audio.load();audioElements.set(id,audio);return url;
 }catch{return null}finally{clearTimeout(timer)}})();
 audioPromises.set(id,promise);return promise;
}
function prefetchQuestion(q){
 primeSpeech();
 const texts=[q.correct,...(q.options||[]).map(x=>typeof x==='string'?x:x.text)];
 if(q.question)texts.push(q.question);
 for(const text of new Set(texts))if(/^[a-z]+$/i.test(text))getDictionaryAudio(text);
 // 預先初始化語音引擎，避免首按字母時才初始化。
}
function speakFallback(text,finish){
 if(!('speechSynthesis' in window)){finish();return}
 let u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=1;
 let voices=speechSynthesis.getVoices();u.voice=voices.find(v=>v.lang.toLowerCase()==='en-us')||null;
 u.onend=finish;u.onerror=finish;speechSynthesis.speak(u);
 audioTimer=setTimeout(finish,12000);
}
async function playVoice(text,autoplay=false){
 voiceStop();const seq=voiceSeq,id=String(text).trim().toLowerCase();
 // 只使用已預先取得的字典音檔；查詢尚未完成時立即使用語音後備，避免阻塞點擊。
 const file=audioCache.get(id);
 return new Promise(resolve=>{
  let finished=false;const finish=()=>{if(finished)return;finished=true;if(currentFinish===finish)currentFinish=null;if(audioTimer){clearTimeout(audioTimer);audioTimer=null}currentAudio=null;resolve()};
  currentFinish=finish;
  if(seq!==voiceSeq){finish();return}
  if(file){
   const a=audioElements.get(id)||new Audio(file);currentAudio=a;
   try{a.pause();a.currentTime=0}catch{}
   a.onended=finish;a.onerror=()=>{if(seq!==voiceSeq)return finish();speakFallback(text,finish)};
   a.play().catch(()=>{if(seq!==voiceSeq)return finish();speakFallback(text,finish)});
   audioTimer=setTimeout(finish,12000);
  }else speakFallback(text,finish);
 });
}
function shell(content){root.innerHTML=`<div class="shell"><header class="top"><div class="brand" data-nav="home">🌟 英文複習小勇士</div></header>${content}</div>`}
function home(){screen='home';voiceStop();shell(`<div class="card hero"><div style="font-size:52px">📚🎧</div><h1>今天也來練習英文！</h1><p>聽單字、選句型、拼字母，看看自己進步多少！</p></div><div class="menu"><button data-nav="exam">📝 考試模式<small>23 題，滿分 100 分</small></button><button data-nav="infinite" style="background:#269d91">🚀 無限模式<small>持續挑戰，累積分數</small></button><button data-nav="book" style="background:#d48a39">📖 題庫寶典<small>查單字、聽發音、看正確率</small></button><button data-nav="ranking" style="background:#836bc5">🏆 排行榜<small>歷史最佳的 5 次挑戰</small></button></div><div class="card"><h3>教材使用說明</h3><p class="muted">已匯入海格堡三年級教材，保留原課次及翻譯。題型將由系統動態組合；題庫檢查可查看尚待確認的音檔與項目。</p></div>`)}
// 文法功能詞以可驗證的單一答案情境呈現；未能形成明確情境者不參加拼字題。
const grammarContexts={
 'am':{context:'I ___ happy.',translation:'我很快樂。'},
 'is':{context:'He ___ strong.',translation:'他很強壯。'},
 'are':{context:'You ___ tall.',translation:'你很高。'},
 'my':{context:'___ name is Ken.',translation:'我的名字是 Ken。'},
 'your':{context:"What's ___ name?",translation:'你叫什麼名字？'},
 'he':{context:'___ is strong.',translation:'他很強壯。'},
 'she':{context:'___ is thin.',translation:'她很瘦。'},
 'you':{context:'How old are ___?',translation:'你幾歲？'},
 'i':{context:'___ can help you.',translation:'我可以幫你。'},
 'not':{context:"I'm ___ tall.",translation:'我並不是很高。'},
 'what':{context:'___ is your name?',translation:'你叫什麼名字？'},
 'yes':{context:'Are you tired? ___, I am.',translation:'你累了嗎？是的，我是。'},
 'no':{context:"Are you tired? ___, I'm not.",translation:'你累了嗎？不，我不累。'}
};
const ambiguousChinese=new Set();
{const byZh={};for(const w of D.words){if(w.displayOnly)continue;let zh=String(w.zh).trim();(byZh[zh]??=new Set()).add(w.en.toLowerCase())}for(const [zh,english] of Object.entries(byZh))if(english.size>1)ambiguousChinese.add(zh)}
function spellingContext(word){let en=word.en.toLowerCase();if(grammarContexts[en])return grammarContexts[en];if(ambiguousChinese.has(String(word.zh).trim()))return null;return {translation:word.zh,context:null}}
// 問答題干擾選項經教材語意審查：不得拿同樣可以回答問題的句子當錯誤答案。
const qaDistractors={
 'Thank you.':["My name is Ken.","I'm nine years old."],
 'Nice to meet you.':["I'm nine years old.","You're welcome."],
 "What's your name?":["I'm nine years old.","You're welcome."],
 'How old are you?':["My name is Ken.","You're welcome."],
 'How old are you, Alan?':["My name is Ken.","You're welcome."],
 'How are you?':["My name is Ken.","You're welcome."],
 'Are you tired?':["My name is Ken.","I'm nine years old."],
 'Are you angry, Mike?':["My name is Ken.","I'm nine years old."],
 'How old are you, Owen?':["My name is Ken.","You're welcome."],
 'Are you happy, Owen?':["My name is Ken.","I'm nine years old."],
 'Can you help me?':["I'm nine years old.","You're welcome."]
};
function validQaPairs(){const allowed=new Set(D.sentences.map(x=>x.en));return D.qa.filter(([question,answer])=>qaDistractors[question]?.length===2&&allowed.has(answer)&&qaDistractors[question].every(x=>allowed.has(x)&&x!==answer));}
function pools(type){if(type==='listen')return D.words.filter(w=>!w.displayOnly);if(type==='spell')return D.words.filter(w=>!w.displayOnly&&/^[A-Za-z-]+$/.test(w.en)&&spellingContext(w)!==null); if(type==='translate')return D.sentences.filter(s=>!s.displayOnly);if(type==='reorder')return D.sentences.filter(s=>!s.displayOnly);if(type==='qa')return validQaPairs().map(([question,answer],i)=>({id:'qa_'+i,en:question,answer,question,topic:'問答',itemId:D.sentences.find(s=>s.en===question)?.id}));if(type==='phonics')return D.phonics.filter(([word])=>D.words.some(w=>w.en===word)).map(([word,other],i)=>({id:'p_'+i,en:word,other,itemId:D.words.find(w=>w.en===word)?.id,topic:'自然發音'}));return[]}
function idFor(t,item){return item.itemId||item.id}
function buildQuestion(type,item){let itemId=idFor(type,item),q={type,itemId,correct:item.en,zh:item.zh||'',visual:item.visual||'',topic:item.topic||'',tried:0,choice:null,selected:[],stage:'question',step:1};
 if(type==='listen'){let alternatives=shuffle(D.words.filter(w=>w.en!==item.en)).slice(0,2).map(x=>x.en);q.options=shuffle([item.en,...alternatives]);}
 if(type==='translate'){q.options=shuffle([item.en,...shuffle(pools(type).filter(x=>x.en!==item.en&&x.zh!==item.zh)).slice(0,2).map(x=>x.en)]);}
 if(type==='qa'){q.correct=item.answer;q.question=item.question;q.options=shuffle([item.answer,...qaDistractors[item.question]]);}
 if(type==='phonics'){q.options=shuffle([item.en,item.other]);}
 if(type==='reorder'){q.tokens=item.en.match(/[A-Za-z]+(?:'[A-Za-z]+)?|[?.!,]/g)||[];q.options=shuffle(q.tokens.map((t,i)=>({text:t,id:i})));}
 if(type==='spell'){q.spellingPrompt=spellingContext(item);let chars=[...new Set(item.en.toLowerCase().split(''))];let alphabet='abcdefghijklmnopqrstuvwxyz'.split('').filter(c=>!chars.includes(c));let extras=shuffle(alphabet).slice(0,Math.max(3,Math.min(6,10-chars.length)));q.options=shuffle([...chars,...extras].map((t,i)=>({text:t,id:i})));}
 return q;
}
function generateExam(){let order=[];for(let type of TYPES){let pool=pools(type);if(pool.length<examCounts[type])return {error:`${names[type]} 需要 ${examCounts[type]} 題，但題庫只有 ${pool.length} 題。`};order.push(...shuffle(pool).slice(0,examCounts[type]).map(item=>buildQuestion(type,item)))}return {order:shuffle(order)}}
function infiniteType(){if(!game.cycle.length){game.cycle=shuffle(TYPES.flatMap(t=>Array(infiniteCounts[t]).fill(t)))}let candidates=game.cycle.filter(t=>getEligible(t,true).length);if(!candidates.length)candidates=game.cycle.filter(t=>pools(t).length);let type=rand(candidates);let i=game.cycle.indexOf(type);if(i!==-1)game.cycle.splice(i,1);return type}
function getEligible(type,strict){let pool=pools(type);if(!strict)return pool;return pool.filter(x=>{let k=type+':'+idFor(type,x);let prev=game.recentKeys[k];return prev==null||game.completed-prev>=30})}
function nextInfinite(){let type=infiniteType(),pool=getEligible(type,true);if(!pool.length)pool=pools(type);if(!pool.length){alert('目前題庫不足，請補充教材。');home();return}let item=weighted(pool.map(x=>({...x,id:idFor(type,x)})));game.current=buildQuestion(type,item);game.qIndex=game.completed+1;storeGame();renderGame()}
function start(mode){voiceStop();if(mode==='exam' && db.activeExam){game=db.activeExam;screen='game';renderGame();return}
 if(mode==='exam'){let result=generateExam();if(result.error){alert('無法開始考試：'+result.error);return}game={mode,order:result.order,position:0,current:result.order[0],score:0,completed:0,results:[],start:Date.now()}}
 else game={mode,cycle:[],score:0,completed:0,results:[],start:Date.now(),recentKeys:{},qIndex:1};screen='game';if(mode==='infinite')nextInfinite();else{storeGame();renderGame()}}
function storeGame(){if(game&&game.mode==='exam'){db.activeExam=game;save()}}
function fmtTokens(t){let result='';for(const token of t){if(/^[?.!,]$/.test(token)){result+=token}else{result+=(result?' ':'')+token}}return result}
function normalizedSentence(s){return String(s).toLowerCase().replace(/[.,!?]/g,'').replace(/\s+/g,' ').trim()}
function renderGame(){if(!game)return home();screen='game';let q=game.current;if(!q)return;let isExam=game.mode==='exam';let html=`<div class="stats"><span class="pill">${isExam?'📝 考試模式':'🚀 無限模式'}</span><span class="pill">${isExam?`第 ${game.position+1} / 23 題`:`⭐ ${game.score} 分`}</span><button class="danger" data-action="quit">${isExam?'結束考試':'結束挑戰'}</button></div>${isExam?`<div class="progress"><span style="width:${game.position/23*100}%"></span></div>`:''}<div class="card question"><div class="pill" style="display:inline-block;margin-bottom:16px">${names[q.type]}</div>`;
 let prompt={listen:'聽一聽，選出正確的英文單字',translate:'他的英文是什麼？',qa:'這個問題該怎麼回答？',spell:'請拼出正確的英文單字',reorder:'請排列出正確的英文句子',phonics:'仔細聽，選出正確單字'}[q.type];
 html+=`<div class="prompt">${prompt}</div>`;
 if(q.type==='listen'||q.type==='phonics'||q.type==='qa')html+=`<div style="margin:28px 0"><button class="audio" data-action="audio">🔊 播放英文</button><div class="sub" style="margin-top:10px">可不限次數重播</div></div>`;
 if(q.type==='translate'||q.type==='reorder')html+=`<div class="target">${escape(q.zh||D.words.find(x=>x.id===q.itemId)?.zh||D.sentences.find(x=>x.id===q.itemId)?.zh)}</div>`;
 if(q.type==='spell'){const sp=q.spellingPrompt||{};html+=sp.context?`<div class="target">${escape(sp.context)}</div><div class="sub">${escape(sp.translation)}</div>`:`<div class="target">${escape(sp.translation||q.zh)}</div>`;}
 if(q.type==='listen'&&q.step===2)html+=`<div class="hint">💡 中文提示：<strong>${escape(q.zh||D.words.find(x=>x.id===q.itemId)?.zh||"再聽一次發音")}</strong>，請再試一次。</div>`;
 if(['listen','translate','qa','phonics'].includes(q.type))html+=`<div class="choices ${q.type==='phonics'?'two':''}">${q.options.map((v,i)=>`<button class="choice" data-choose="${i}">${escape(v)}</button>`).join('')}</div>`;
 else html+=`<div class="answerbox">${q.selected.length?escape(fmtTokens(q.selected.map(i=>q.options[i].text))):'<span class="muted">點擊下方字母或單字，組成答案</span>'}</div><div class="wordbank">${q.options.map((v,i)=>`<button class="token" data-token="${i}" ${q.type==='reorder'&&q.selected.includes(i)?'disabled':''}>${escape(v.text)}</button>`).join('')}</div><div class="actions"><button class="ghost" data-action="undo" ${q.selected.length?'':'disabled'}>↩ 上一步</button><button class="ghost" data-action="clear" ${q.selected.length?'':'disabled'}>清除重排</button><button data-action="submit" ${q.selected.length?'':'disabled'}>確認答案</button></div>`;
 html+=`</div>`;shell(html);prefetchQuestion(q);if(q.stage==='question'&&['listen','qa','phonics'].includes(q.type)&&!automaticQuestionAudio.has(q)){automaticQuestionAudio.add(q);q.audioStarted=true;playVoice(q.type==='qa'?q.question:q.correct,true);}}
async function choose(i){
 if(!game||!game.current)return;
 const q=game.current;
 if(q.stage!=='question')return;
 const selected=q.options[i];
 q.stage='answer-audio';
 root.querySelectorAll('[data-choose]').forEach(b=>{b.disabled=true});
 // The selected English option is spoken once before evaluating the answer.
 await playVoice(selected,true);
 if(game?.current!==q||q.stage!=='answer-audio')return;
 q.stage='question';
 q.choice=selected;
 q.tried++;
 if(q.type==='listen'&&selected!==q.correct&&q.step===1){
   q.step=2;
   q.options=shuffle([q.correct,...shuffle(D.words.filter(x=>x.en!==q.correct&&x.en!==selected&&!x.displayOnly)).slice(0,2).map(x=>x.en)]);
   renderGame();
   return;
 }
 complete(selected===q.correct);
}
function submit(){let q=game?.current;if(!q||!q.selected.length)return;let submitted=q.type==='reorder'?fmtTokens(q.selected.map(i=>q.options[i].text)):q.selected.map(i=>q.options[i].text).join('');q.choice=submitted;complete(q.type==='reorder'?normalizedSentence(submitted)===normalizedSentence(q.correct):submitted.toLowerCase()===q.correct.toLowerCase())}
function complete(ok){let q=game.current;q.stage='feedback';q.ok=ok;q.earned=ok?(q.type==='listen'&&q.step===2?3:points[q.type]):0;game.score+=q.earned;game.completed++;game.results.push({type:q.type,itemId:q.itemId,correct:q.correct,chosen:q.choice,ok,earned:q.earned,question:q.question||q.zh||'',zh:q.zh});updateStats(q,ok);if(game.mode==='infinite'){game.recentKeys[q.type+':'+q.itemId]=game.completed;}storeGame();feedback(q)}
async function feedback(q){
 voiceStop();clearTimeout(feedbackTimer);let detail='';
 let original=D.words.find(x=>x.id===q.itemId)||D.sentences.find(x=>x.id===q.itemId);
 if(q.type==='spell'||q.type==='reorder'){
  let intended=q.correct,got=q.choice||'';let wrong=[...got].map((c,i)=>c===intended[i]?escape(c):`<span class="markbad">${escape(c)}</span>`).join('');
  detail=`<div>你的答案：${wrong||'（未填寫）'}</div><div>正確答案：<strong>${escape(intended)}</strong></div>`;
 }else detail=`<div style="font-size:27px;font-weight:850">${escape(q.correct)}</div>`;
 if(original?.visual)detail+=`<div class="visual">${escape(original.visual)}</div>`;
 if(original?.zh)detail+=`<div>${escape(original.zh)}</div>`;
 let showPlus=game.mode==='infinite'&&q.earned?`<h2 class="green">+${q.earned} 分</h2>`:'';
 const progress=game.mode==='exam'?`第 ${game.position+1} / ${game.order.length} 題`:`第 ${game.completed} 題`;
 shell(`<div class="stats"><span class="pill">${game.mode==='exam'?'考試中':'目前 '+game.score+' 分'}</span><span class="pill">${progress}</span><button class="danger" data-action="quit">${game.mode==='exam'?'結束考試':'結束挑戰'}</button></div>${game.mode==='exam'?`<div class="progress"><span style="width:${(game.position+1)/game.order.length*100}%"></span></div>`:''}<div class="card"><div class="feedback ${q.ok?'ok':'no'}"><div class="feedback-title ${q.ok?'green':'red'}">${q.ok?'✓ 答對了！':'✗ 答錯了'}</div>${showPlus}${q.type==='qa'?`<div class="muted">題目：${escape(q.question)}</div>`:''}${detail}<div class="actions"><button class="ghost" data-action="replay-feedback">🔊 再聽一次</button><button data-action="next-feedback">下一題 →</button></div></div></div>`);
 await replayFeedback(q);
}
async function replayFeedback(q){
 if(!game||game.current!==q||q.stage!=='feedback')return;
 const voiceList=q.type==='qa'?[q.question,q.correct]:[q.correct];
 for(const t of voiceList){if(!game||game.current!==q||q.stage!=='feedback')return;await playVoice(t,true)}
}
function advanceFeedback(){
 if(!game||game.current?.stage!=='feedback')return;
 voiceStop();clearTimeout(feedbackTimer);
 if(game.mode==='exam'){
  game.position++;
  if(game.position>=game.order.length){finishExam();return}
  game.current=game.order[game.position];storeGame();renderGame();
 }else nextInfinite();
}

function finishExam(early=false){voiceStop();clearTimeout(feedbackTimer);let result={mode:'exam',score:game.score,start:new Date(game.start).toISOString(),duration:Date.now()-game.start,results:game.results,early,completed:game.completed,total:game.order.length};db.lastExam=result;delete db.activeExam;save();game=null;screen='examResult';renderExamResult(result)}
function renderExamResult(r){screen='examResult';let rows=TYPES.map(t=>{let all=r.results.filter(x=>x.type===t),c=all.filter(x=>x.ok).length;return `<tr><td>${names[t]}</td><td>${c}/${all.length}</td><td>${all.length?Math.round(c/all.length*100)+'%':'—'}</td></tr>`}).join('');let wrong=r.results.filter(x=>!x.ok);shell(`<div class="card"><h2>📝 考試結果</h2>${r.early?`<p class="muted">提前結束 · 已完成 ${r.completed} / ${r.total||23} 題，未作答題目不列入正確率</p>`:''}<div class="result">${r.score} <span style="font-size:22px">/ 100</span></div><h3>題型表現</h3><div class="scroll"><table class="table"><thead><tr><th>題型</th><th>答對／題數</th><th>正確率</th></tr></thead><tbody>${rows}</tbody></table></div><h3 style="margin-top:25px">錯題明細（${wrong.length} 題）</h3>${wrong.length?wrong.map((x,i)=>`<div class="list-row"><div><strong>${i+1}. ${escape(names[x.type])}</strong><div class="muted tiny">${escape(x.question||'')}</div><div class="red">你的答案：${escape(x.chosen||'未完成')}</div><div class="green">正確答案：${escape(x.correct)}</div></div><button class="ghost" data-play="${escape(x.correct)}">🔊</button></div>`).join(''):'<p class="green">全部答對！</p>'}<div class="actions"><button data-nav="home">回首頁</button></div></div>`)}
function askQuit(){dialog='quit';const isExam=game.mode==='exam';root.insertAdjacentHTML('beforeend',`<div class="dialogmask"><div class="dialog"><h2>確定要結束${isExam?'考試':'挑戰'}嗎？</h2><p>目前累積分數</p><div class="result">${game.score} ${isExam?'/ 100':'分'}</div><p class="muted">已完成 ${game.completed} ${isExam?'/ 23 ':''}題。尚未完成的題目不計分、不計入答題次數或正確率。</p><div class="actions"><button class="ghost" data-action="cancelQuit">繼續${isExam?'考試':'挑戰'}</button><button data-action="confirmQuit">確認結束</button></div></div></div>`)}
function endInfinite(){voiceStop();clearTimeout(feedbackTimer);let r={score:game.score,start:new Date(game.start).toISOString(),duration:Date.now()-game.start,completed:game.completed,correct:game.results.filter(x=>x.ok).length};dialog=null;game=null;screen='enterName';shell(`<div class="card question"><h2>🏆 挑戰結束</h2><div class="result">${r.score} 分</div><p>完成 ${r.completed} 題 · 答對 ${r.correct} 題<br>挑戰時間 ${duration(r.duration)}</p><label for="player">挑戰者名字</label><div style="margin:15px"><input id="player" maxlength="20" placeholder="輸入名字" value="小勇士"></div><button id="saveRecord">儲存挑戰紀錄</button></div>`);$('#saveRecord').onclick=()=>{let name=$('#player').value.trim()||'小勇士';db.records.push({...r,name});db.records.sort((a,b)=>b.score-a.score||a.duration-b.duration||new Date(a.start)-new Date(b.start));db.records=db.records.slice(0,5);save();ranking()}}
function ranking(){screen='ranking';let entries=db.records.map((r,i)=>`<tr><td>${i+1}</td><td>${escape(r.name)}</td><td><b>${r.score} 分</b></td><td>${duration(r.duration)}</td><td>${shortDate(r.start)}</td></tr>`).join('');shell(`<div class="card ranking-board"><h2>🏆 歷史高分排行榜</h2><p class="sub">僅保留歷史最高分的 5 次挑戰；同分時由完成時間較短者優先。</p><div class="scroll"><table class="table"><thead><tr><th>名次</th><th>名字</th><th>分數</th><th>持續時間</th><th>開始日期</th></tr></thead><tbody>${entries||'<tr><td colspan="5">尚無挑戰紀錄</td></tr>'}</tbody></table></div><button class="ghost" data-nav="home">回首頁</button></div>`)}
function book(){screen='book';let topics=['全部',...D.sections.map(s=>s.章節)];let list=all.filter(x=>filter==='全部'||x.sections?.includes(filter));let unfinished=all.filter(x=>!stats(x.id).total).length;
 shell(`<div class="card"><div class="stats"><h2>📖 題庫寶典</h2><button class="ghost" data-nav="home">回首頁</button></div><p class="sub">${D.words.length} 個單字 · ${D.sentences.length} 個句型 · ${unfinished} 個項目未作答</p><div class="filter">${topics.map((t,i)=>`<button class="${filter===t?'primary':'ghost'}" data-filter="${i}">${escape(t)}</button>`).join('')}</div>${list.map(x=>{let p=accuracy(x.id),s=stats(x.id);return `<div class="list-row"><div><div style="font-size:18px;font-weight:800">${escape(x.visual||'')} ${escape(x.en)}</div><div class="muted">${escape(x.zh)}　<span class="tag">${escape(x.topic)}</span> <span class="tag">${x.id.startsWith('w')?'單字':'句型'}</span></div><div class="tiny muted">已作答 ${s.total} 次</div></div><div style="display:flex;align-items:center;gap:10px"><b class="${p===null?'muted':p===100?'markgood':'markbad'}">${p===null?'-':p+'%'}</b><button class="ghost" data-play="${escape(x.en)}">🔊</button></div></div>`}).join('')}</div><div class="card"><h2>🧩 題庫檢查</h2><p class="muted">正式教材已匯入。音檔目前採線上字典與瀏覽器語音後備，尚未完成逐筆人工發音驗證。多個英文姓名或替代句型的原始合併條目保留供查閱，但不直接用於拼字及聽力測驗。</p><div class="notice">⚠️ 尚待人工確認：音檔正確性及使用授權；自然發音配對中的課外干擾詞僅為練習選項。題庫內合併條目不會直接參與不適合的題型；中文翻譯無法唯一指定答案且未建立情境的單字會略過拼字題。</div></div><div class="card"><h2>💾 學習紀錄備份</h2><div class="actions"><button data-action="export">匯出 JSON 備份</button><button class="ghost" data-action="import">匯入 JSON 備份</button><input type="file" id="importFile" accept="application/json,.json" hidden></div><p class="sub">匯入會取代目前的學習紀錄及排行榜；教材資料不會被修改。</p></div>`);
 root.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=topics[+b.dataset.filter];book()});}
function exportBackup(){let blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),stats:db.stats,records:db.records},null,2)],{type:'application/json'});let url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='英文複習遊戲-紀錄-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
async function importBackup(file){try{let obj=JSON.parse(await file.text());if(!obj||typeof obj.stats!=='object'||!Array.isArray(obj.records)||Array.isArray(obj.stats))throw Error('格式不正確');if(!confirm('確定要使用備份取代目前的學習紀錄與排行榜嗎？'))return;db.stats=obj.stats;db.records=obj.records.slice(0,5);save();alert('匯入完成');book()}catch(e){alert('無法匯入：'+e.message)}}
root.addEventListener('click',e=>{let el=e.target.closest('[data-nav],[data-choose],[data-token],[data-action],[data-play]');if(!el)return;if(el.dataset.nav){let nav=el.dataset.nav;if(game?.mode==='exam'&&nav!=='exam')return;if(nav==='home')home();if(nav==='exam')start('exam');if(nav==='infinite')start('infinite');if(nav==='book')book();if(nav==='ranking')ranking();return}
 if(el.dataset.play){playVoice(el.dataset.play);return}if(el.dataset.choose!==undefined){choose(+el.dataset.choose);return}if(el.dataset.token!==undefined){let q=game?.current,i=+el.dataset.token;if(q&&q.stage==='question'&&(q.type==='spell'||!q.selected.includes(i))){const t=q.options[i].text;q.selected.push(i);renderGame();if(/[A-Za-z]/.test(t))playVoice(t,true)}return}
 switch(el.dataset.action){case'replay-feedback':replayFeedback(game?.current);break;case'next-feedback':advanceFeedback();break;case'audio':playVoice(game.current.type==='qa'?game.current.question:game.current.correct);break;case'undo':game.current.selected.pop();renderGame();break;case'clear':game.current.selected=[];renderGame();break;case'submit':submit();break;case'quit':askQuit();break;case'cancelQuit':dialog=null;$('.dialogmask')?.remove();break;case'confirmQuit':if(game?.mode==='exam'){dialog=null;finishExam(true)}else endInfinite();break;case'export':exportBackup();break;case'import':$('#importFile').click();break;}});
root.addEventListener('change',e=>{if(e.target.id==='importFile'&&e.target.files[0])importBackup(e.target.files[0])});
window.addEventListener('beforeunload',()=>{if(game?.mode==='exam')storeGame()});
if(db.activeExam){shell(`<div class="card hero"><h1>📝 你有尚未完成的考試</h1><p>考試進度已自動保存，必須完成考試才能返回首頁。</p><button data-nav="exam">繼續考試</button></div>`)}else home();
})();
