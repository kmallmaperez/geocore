import React, { useState, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ── Color matrices ───────────────────────────────────────────────────
const ROCK = {
  0:[217,217,215],1:[197,90,15],2:[255,255,0],3:[248,203,171],4:[255,0,0],
  5:[255,102,255],6:[255,102,0],7:[237,125,47],8:[47,79,75],10:[153,255,99],
  11:[84,130,51],12:[0,0,255],13:[191,191,187],14:[0,255,255],15:[102,51,0],
  16:[112,48,159],17:[255,255,255],18:[153,0,0],19:[250,235,211],20:[173,255,43],
  21:[47,79,75],25:[218,227,239],26:[47,79,75],101:[127,127,123],102:[127,127,123],103:[47,79,75],
}
const ALTER = {
  0:[217,217,215],1:[255,255,255],2:[153,51,0],3:[0,255,151],4:[255,255,0],
  5:[248,203,171],6:[153,0,151],7:[237,125,47],8:[47,79,75],9:[0,102,0],
  10:[0,255,0],11:[97,103,227],12:[0,102,203],13:[47,79,75],15:[0,255,255],
  16:[166,166,163],17:[153,51,0],18:[0,0,203],19:[255,102,255],20:[47,79,75],
  25:[218,227,239],101:[127,127,123],102:[127,127,123],103:[47,79,75],
}

// ── Pure helpers ─────────────────────────────────────────────────────
const hexColor = (r,g,b) => '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')
const contrast  = (r,g,b) => (r*.299+g*.587+b*.114) > 140 ? '#111111' : '#ffffff'
const fmt = v => { const n=parseFloat(v); if(isNaN(n)) return v||''; return Number.isInteger(n)?n.toString():n.toFixed(2) }

function colKey(headers, name) {
  return headers.find(h => h.toLowerCase() === name.toLowerCase()) || name
}

function csvLine(line, d) {
  const r=[]; let cur='', q=false
  for (let i=0;i<line.length;i++) {
    const c=line[i]
    if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}
    else if(c===d&&!q){r.push(cur);cur=''}
    else cur+=c
  }
  r.push(cur); return r
}

function parseCSV(txt) {
  const lines = txt.split(/\r?\n/).filter(l=>l.trim())
  if(lines.length<2) throw new Error('CSV vacío o sin datos')
  const commas=(lines[0].match(/,/g)||[]).length
  const semis=(lines[0].match(/;/g)||[]).length
  const d = semis>commas ? ';' : ','
  const headers = csvLine(lines[0],d).map(h=>h.trim())
  const rows=[]
  for(let i=1;i<lines.length;i++){
    const v=csvLine(lines[i],d)
    if(v.every(x=>!x.trim())) continue
    const obj={}; headers.forEach((h,j)=>obj[h]=(v[j]||'').trim()); rows.push(obj)
  }
  if(!rows.length) throw new Error('Sin filas de datos')
  return {headers, rows}
}

function getSortedRows(rawData, headers, hole) {
  const hc=colKey(headers,'HOLE_NUMBER'), fc=colKey(headers,'Depth_From')
  return rawData.filter(r=>r[hc]===hole)
                .sort((a,b)=>parseFloat(a[fc]||0)-parseFloat(b[fc]||0))
}

function renderPages(rows, holeName, headers) {
  const PW=595, PH=842, MAR=22, SCALE=4, UW=PW-MAR*2
  const OBS_W=UW*0.40, R=UW-OBS_W
  const COLS=[
    {key:'hole',hdr:'HOLE_NUMBER',w:R*0.190},
    {key:'from',hdr:'From',       w:R*0.105},
    {key:'to',  hdr:'To',         w:R*0.105},
    {key:'int', hdr:'Intervalo',  w:R*0.130},
    {key:'rock',hdr:'Rock',       w:R*0.175,pal:ROCK},
    {key:'alt', hdr:'Alter',      w:R*0.165,pal:ALTER},
    {key:'est', hdr:'Estructura', w:R*0.130},
    {key:'obs', hdr:'Obs',        w:OBS_W},
  ]
  const totalW=COLS.reduce((s,c)=>s+c.w,0)
  COLS.forEach(c=>c.w=c.w/totalW*UW)
  const FS=7, LINE_H=FS+3, PAD=4, HDR_H=22, COL_HDR_H=15, ROW_MIN=16
  const mCv=document.createElement('canvas'), mCtx=mCv.getContext('2d')
  const obsCol=COLS.find(c=>c.key==='obs')
  function wrapLines(text,maxW){
    if(!text) return ['']
    mCtx.font=FS+'px "Courier New",monospace'
    const words=text.split(' '),out=[];let cur=''
    for(const w of words){const t=cur?cur+' '+w:w;if(mCtx.measureText(t).width>maxW-PAD*2&&cur){out.push(cur);cur=w}else cur=t}
    if(cur) out.push(cur); return out.length?out:['']
  }
  const fc=colKey(headers,'Depth_From'), tc=colKey(headers,'Depth_To')
  const hRows=rows.map(r=>({...r,_h:Math.max(ROW_MIN,wrapLines(r[colKey(headers,'obs')]||'',obsCol.w).length*LINE_H+PAD*2)}))
  const BODY=PH-MAR-HDR_H-COL_HDR_H-MAR-8
  const pages=[]; let curP=[],usedH=0
  for(const r of hRows){
    if(usedH+r._h>BODY&&curP.length){pages.push(curP);curP=[];usedH=0}
    curP.push(r);usedH+=r._h
  }
  if(curP.length) pages.push(curP)
  if(!pages.length) pages.push([])
  const dataURLs=[]
  for(let pi=0;pi<pages.length;pi++){
    const cv=document.createElement('canvas')
    cv.width=PW*SCALE; cv.height=PH*SCALE
    const c=cv.getContext('2d'); c.scale(SCALE,SCALE)
    c.fillStyle='#ffffff'; c.fillRect(0,0,PW,PH)
    c.fillStyle='#111111'; c.font='bold 12px Arial,sans-serif'; c.textAlign='left'
    c.fillText('Sondaje: '+holeName,MAR+4,MAR+14)
    c.strokeStyle='#555555'; c.lineWidth=0.8
    c.beginPath();c.moveTo(MAR,MAR+HDR_H);c.lineTo(MAR+UW,MAR+HDR_H);c.stroke()
    const chY=MAR+HDR_H
    c.fillStyle='#e8e8e8'; c.fillRect(MAR,chY,UW,COL_HDR_H)
    let xc=MAR
    COLS.forEach(cd=>{
      c.strokeStyle='#aaaaaa';c.lineWidth=0.5
      c.beginPath();c.moveTo(xc,chY);c.lineTo(xc,chY+COL_HDR_H);c.stroke()
      c.fillStyle='#222222';c.font='bold 6.5px Arial,sans-serif';c.textAlign='center'
      c.fillText(cd.hdr.toUpperCase(),xc+cd.w/2,chY+COL_HDR_H-4)
      xc+=cd.w
    })
    c.strokeStyle='#aaaaaa';c.lineWidth=0.5
    c.beginPath();c.moveTo(xc,chY);c.lineTo(xc,chY+COL_HDR_H);c.stroke()
    c.strokeStyle='#888888';c.lineWidth=0.6
    c.beginPath();c.moveTo(MAR,chY+COL_HDR_H);c.lineTo(MAR+UW,chY+COL_HDR_H);c.stroke()
    let ry=chY+COL_HDR_H
    pages[pi].forEach((row,ri)=>{
      const rh=row._h
      c.fillStyle=ri%2===0?'#ffffff':'#f3f3f3'; c.fillRect(MAR,ry,UW,rh)
      xc=MAR
      COLS.forEach(cd=>{
        let val=''
        switch(cd.key){
          case 'hole': val=holeName; break
          case 'from': val=fmt(row[fc]); break
          case 'to':   val=fmt(row[tc]); break
          case 'int':  val=fmt(parseFloat(row[tc]||0)-parseFloat(row[fc]||0)); break
          case 'rock': val=row[colKey(headers,'rock_type')]||''; break
          case 'alt':  val=row[colKey(headers,'alteracion')]||''; break
          case 'est':  val=row[colKey(headers,'estructura')]||''; break
          case 'obs':  val=row[colKey(headers,'obs')]||''; break
        }
        let textColor='#111111'
        if(cd.pal){const rgb=cd.pal[parseInt(val)];if(rgb!==undefined){c.fillStyle='rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')';c.fillRect(xc,ry,cd.w,rh);textColor=contrast(...rgb)}}
        c.fillStyle=textColor; c.font=(cd.pal?'bold ':'')+FS+'px "Courier New",monospace'
        if(cd.key==='obs'){
          const lines=wrapLines(val,cd.w),blockH=lines.length*LINE_H
          const startY=ry+Math.max(PAD,(rh-blockH)/2)+FS
          lines.forEach((ln,li)=>c.fillText(ln,xc+PAD,startY+li*LINE_H))
        } else {
          const maxW=cd.w-PAD*2; let txt=val
          while(txt.length>0&&c.measureText(txt).width>maxW) txt=txt.slice(0,-1)
          if(txt.length<val.length&&txt.length>0) txt=txt.slice(0,-1)+'…'
          const tw=c.measureText(txt).width; c.textAlign='left'
          c.fillText(txt,xc+(cd.w-tw)/2,ry+rh/2+FS*0.35)
        }
        c.strokeStyle='rgba(160,160,160,.55)';c.lineWidth=0.35
        c.strokeRect(xc+0.2,ry+0.2,cd.w-0.4,rh-0.4)
        xc+=cd.w
      })
      ry+=rh
    })
    c.strokeStyle='#444444';c.lineWidth=0.8
    c.strokeRect(MAR,MAR+HDR_H+COL_HDR_H,UW,ry-(MAR+HDR_H+COL_HDR_H))
    dataURLs.push(cv.toDataURL('image/jpeg',0.99))
  }
  return dataURLs
}

function buildPDF(dataURLs) {
  const enc=new TextEncoder()
  const PW=595, PH=842, SCALE=4
  const parts=[]; let off=0; const oOff={}
  function ws(s){const b=enc.encode(s);parts.push(b);off+=b.length}
  function wb(b){parts.push(b);off+=b.length}
  const jpegs=dataURLs.map(u=>{
    const bin=atob(u.split(',')[1]),buf=new Uint8Array(bin.length)
    for(let i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i); return buf
  })
  const N=jpegs.length
  ws('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')
  oOff[1]=off; ws('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  const kids=Array.from({length:N},(_,i)=>(3+i*3)+' 0 R').join(' ')
  oOff[2]=off; ws('2 0 obj\n<< /Type /Pages /Kids ['+kids+'] /Count '+N+' >>\nendobj\n')
  for(let p=0;p<N;p++){
    const pageId=3+p*3,imgId=3+p*3+1,csId=3+p*3+2,jpeg=jpegs[p]
    oOff[imgId]=off
    ws(imgId+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+(PW*SCALE)+' /Height '+(PH*SCALE)+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n')
    wb(jpeg); ws('\nendstream\nendobj\n')
    const csData='q '+PW+' 0 0 '+PH+' 0 0 cm /Im'+p+' Do Q',csBytes=enc.encode(csData)
    oOff[csId]=off; ws(csId+' 0 obj\n<< /Length '+csBytes.length+' >>\nstream\n'); wb(csBytes); ws('\nendstream\nendobj\n')
    oOff[pageId]=off
    ws(pageId+' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Resources << /XObject << /Im'+p+' '+imgId+' 0 R >> >> /Contents '+csId+' 0 R >>\nendobj\n')
  }
  const xrefOff=off,total=3+N*3
  let xref='xref\n0 '+(total+1)+'\n0000000000 65535 f \n'
  for(let i=1;i<=total;i++) xref+=(oOff[i]||0).toString().padStart(10,'0')+' 00000 n \n'
  ws(xref); ws('trailer\n<< /Size '+(total+1)+' /Root 1 0 R >>\nstartxref\n'+xrefOff+'\n%%EOF\n')
  const totalLen=parts.reduce((s,b)=>s+b.length,0),out=new Uint8Array(totalLen); let pos=0
  for(const b of parts){out.set(b,pos);pos+=b.length}
  return out
}

function triggerDownload(bytes, name) {
  const blob=new Blob([bytes],{type:'application/pdf'})
  const url=URL.createObjectURL(blob),a=document.createElement('a')
  a.href=url;a.download=name;a.click()
  setTimeout(()=>URL.revokeObjectURL(url),5000)
}

// ── Component ────────────────────────────────────────────────────────
export default function DrillLogPage() {
  const { user } = useAuth()

  const canAccess = user.role === 'ADMIN' ||
    (user.tables||[]).includes('all') ||
    (user.tables||[]).includes('drill_log')
  if (!canAccess) return <Navigate to="/dashboard" replace />

  const [rawData,      setRawData]      = useState([])
  const [headers,      setHeaders]      = useState([])
  const [fileLoaded,   setFileLoaded]   = useState(false)
  const [fileName,     setFileName]     = useState('')
  const [fileMeta,     setFileMeta]     = useState('')
  const [loadError,    setLoadError]    = useState('')
  const [selectedHole, setSelectedHole] = useState('')
  const [generating,   setGenerating]   = useState(false)
  const [genMsg,       setGenMsg]       = useState({ text:'', type:'' })
  const [dragging,     setDragging]     = useState(false)
  const fileRef = useRef()

  const holes = fileLoaded
    ? [...new Set(rawData.map(r => r[colKey(headers,'HOLE_NUMBER')]||'').filter(Boolean))].sort()
    : []

  const previewRows = selectedHole
    ? getSortedRows(rawData, headers, selectedHole).slice(0, 15)
    : []

  async function handleFile(f) {
    setLoadError('')
    try {
      const txt = await f.text()
      const { headers: h, rows } = parseCSV(txt)
      if (!h.some(hh => hh.toLowerCase() === 'hole_number'))
        throw new Error('No se encontró la columna HOLE_NUMBER en el CSV')
      setHeaders(h); setRawData(rows)
      setFileName(f.name)
      setFileMeta(rows.length.toLocaleString() + ' filas · ' + h.length + ' columnas')
      setFileLoaded(true); setSelectedHole(''); setGenMsg({ text:'', type:'' })
    } catch(e) {
      setLoadError(e.message)
    }
  }

  function resetFile() {
    setRawData([]); setHeaders([]); setFileLoaded(false)
    setFileName(''); setFileMeta(''); setLoadError(''); setSelectedHole(''); setGenMsg({ text:'', type:'' })
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleGenerate() {
    if (!selectedHole) return
    setGenerating(true); setGenMsg({ text:'', type:'' })
    await new Promise(r => setTimeout(r, 30))
    try {
      const rows = getSortedRows(rawData, headers, selectedHole)
      const pageURLs = renderPages(rows, selectedHole, headers)
      const pdfBytes = buildPDF(pageURLs)
      triggerDownload(pdfBytes, selectedHole + '_DrillLog.pdf')
      setGenMsg({ text: `✅ PDF generado · ${pageURLs.length} página(s) · ${rows.length} filas`, type: 'ok' })
    } catch(e) {
      setGenMsg({ text: '❌ Error: ' + e.message, type: 'err' })
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  const DISP_COLS = [
    { src:'HOLE_NUMBER', label:'HOLE' },
    { src:'Depth_From',  label:'From' },
    { src:'Depth_To',    label:'To' },
    { src:null,          label:'Intervalo' },
    { src:'rock_type',   label:'Rock',  pal:ROCK },
    { src:'alteracion',  label:'Alter', pal:ALTER },
    { src:'estructura',  label:'Estructura' },
    { src:'obs',         label:'Obs' },
  ]

  return (
    <div>
      <div className="ph-top">
        <div>
          <div className="page-title">🗂️ DrillLog PDF</div>
          <div className="page-desc">Generador de informes de sondajes · CSV → PDF con escala de colores</div>
        </div>
      </div>

      {/* ── PASO 1: Cargar CSV ─────────────────────────────────── */}
      <div style={{ background:'var(--sur,var(--surface,#13161e))', border:'1px solid var(--acc)', borderRadius:12, padding:24, marginBottom:20 }}>
        <div style={{ fontSize:10, fontFamily:'monospace', color:'var(--mut)', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
          ① Cargar archivo CSV
          <span style={{ flex:1, height:1, background:'var(--brd)', display:'block' }}/>
        </div>

        {!fileLoaded ? (
          <div
            style={{
              border: `2px dashed ${dragging ? 'var(--acc)' : 'var(--brd)'}`,
              borderRadius:10, padding:'44px 32px', textAlign:'center', cursor:'pointer',
              background: dragging ? 'rgba(74,240,160,.04)' : 'transparent',
              transition:'all .2s', position:'relative',
            }}
            onDragOver={e=>{e.preventDefault();setDragging(true)}}
            onDragLeave={()=>setDragging(false)}
            onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0])}}
            onClick={()=>fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }}
              onChange={e=>{if(e.target.files[0])handleFile(e.target.files[0])}}/>
            <div style={{ fontSize:38, marginBottom:10 }}>📂</div>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:5 }}>Arrastra tu archivo CSV aquí</div>
            <div style={{ color:'var(--mut)', fontSize:13, fontFamily:'monospace' }}>
              Columnas: HOLE_NUMBER · Depth_From · Depth_To · rock_type · alteracion · estructura · obs
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(74,240,160,.08)', border:'1px solid rgba(74,240,160,.3)', borderRadius:8, padding:'14px 18px' }}>
            <div style={{ fontSize:22 }}>📄</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:14 }}>{fileName}</div>
              <div style={{ fontSize:12, color:'var(--mut)', fontFamily:'monospace', marginTop:2 }}>{fileMeta}</div>
            </div>
            <button className="btn btn-out" style={{ padding:'7px 14px', fontSize:12 }} onClick={resetFile}>Cambiar</button>
          </div>
        )}

        {loadError && (
          <div className="alert a-err" style={{ marginTop:12 }}>❌ {loadError}</div>
        )}
      </div>

      {/* ── PASO 2: Seleccionar sondaje ────────────────────────── */}
      {fileLoaded && (
        <div style={{ background:'var(--sur,var(--surface,#13161e))', border:'1px solid var(--brd)', borderRadius:12, padding:24, marginBottom:20 }}>
          <div style={{ fontSize:10, fontFamily:'monospace', color:'var(--mut)', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
            ② Seleccionar sondaje
            <span style={{ flex:1, height:1, background:'var(--brd)', display:'block' }}/>
          </div>

          <div className="alert a-ok" style={{ marginBottom:14, fontSize:12 }}>
            ✓ {holes.length} sondajes · {rawData.length.toLocaleString()} filas totales
          </div>

          <div className="fg" style={{ marginBottom:20 }}>
            <label>HOLE_NUMBER</label>
            <select value={selectedHole} onChange={e=>{ setSelectedHole(e.target.value); setGenMsg({text:'',type:''}) }}>
              <option value="">— Seleccionar sondaje —</option>
              {holes.map(h=><option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          {/* Vista previa */}
          {selectedHole && previewRows.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:'var(--mut)', marginBottom:8, fontFamily:'monospace' }}>
                Vista previa <span style={{ color:'var(--acc)' }}>({getSortedRows(rawData,headers,selectedHole).length} filas)</span>
                {getSortedRows(rawData,headers,selectedHole).length>15 && <span style={{ color:'var(--mut)' }}> — mostrando primeras 15</span>}
              </div>
              <div className="ox" style={{ borderRadius:6, border:'1px solid var(--brd)', maxHeight:280 }}>
                <table className="tbl" style={{ fontSize:11 }}>
                  <thead>
                    <tr>{DISP_COLS.map(c=><th key={c.label}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row,ri)=>{
                      const fcol=colKey(headers,'Depth_From'), tcol=colKey(headers,'Depth_To')
                      const f=parseFloat(row[fcol]||0), t=parseFloat(row[tcol]||0)
                      return (
                        <tr key={ri}>
                          {DISP_COLS.map(cd=>{
                            const val = cd.src===null ? fmt(t-f) : (row[colKey(headers,cd.src)]||'')
                            if(cd.pal){
                              const rgb=cd.pal[parseInt(val)]
                              if(rgb) return (
                                <td key={cd.label}>
                                  <span style={{ display:'inline-block', width:13, height:13, borderRadius:2, background:hexColor(...rgb), border:'1px solid rgba(255,255,255,.15)', verticalAlign:'middle', marginRight:4 }}/>
                                  <strong>{val}</strong>
                                </td>
                              )
                            }
                            return <td key={cd.label}>{val}</td>
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            <button
              className="btn btn-acc"
              disabled={!selectedHole || generating}
              onClick={handleGenerate}
              style={{ minWidth:160 }}
            >
              {generating ? <><span style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(0,0,0,.3)', borderTopColor:'rgba(0,0,0,.8)', borderRadius:'50%', animation:'spin .7s linear infinite', marginRight:8, verticalAlign:'middle' }}/>Generando...</> : '📄 Generar PDF'}
            </button>
          </div>

          {genMsg.text && (
            <div className={`alert ${genMsg.type==='ok'?'a-ok':'a-err'}`} style={{ marginTop:14 }}>
              {genMsg.text}
            </div>
          )}
        </div>
      )}

      {/* ── LEYENDA DE COLORES ─────────────────────────────────── */}
      {fileLoaded && (
        <div style={{ background:'var(--sur,var(--surface,#13161e))', border:'1px solid var(--brd)', borderRadius:12, padding:24 }}>
          <div style={{ fontSize:10, fontFamily:'monospace', color:'var(--mut)', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
            Leyenda de colores
            <span style={{ flex:1, height:1, background:'var(--brd)', display:'block' }}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <LegendBox title="🪨 Rock Type" palette={ROCK}/>
            <LegendBox title="⚗️ Alteración" palette={ALTER}/>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function LegendBox({ title, palette }) {
  return (
    <div style={{ background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:8, padding:'12px 14px' }}>
      <div style={{ fontSize:11, fontFamily:'monospace', color:'var(--mut)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:8 }}>{title}</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
        {Object.entries(palette).map(([k,[r,g,b]])=>(
          <div key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, fontFamily:'monospace', color:'var(--mut)' }}>
            <div style={{ width:14, height:14, borderRadius:2, border:'1px solid rgba(255,255,255,.1)', background:hexColor(r,g,b), flexShrink:0 }}/>
            {k}
          </div>
        ))}
      </div>
    </div>
  )
}
