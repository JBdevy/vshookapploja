const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync(require('node:path').join(__dirname, '../vsdiretor.js'), 'utf8').replace(/\r\n/g, '\n')
function extract(name) {
 const start=source.indexOf(`  function ${name}(`)
 assert(start>=0,name)
 let end=source.indexOf('\n  function ',start+1)
 return source.slice(start,end<0?undefined:end).replace(/\n  let mixerCursorDrag = null\s*$/, '')
}
const sent=[]; let mounted=0; let scheduled=0; let hold
const grid={getBoundingClientRect:()=>({left:0,top:0,width:1000,height:1000}),getAttribute:k=>k.endsWith('start')?'100':'200'}
const viewport={querySelector:()=>grid,setPointerCapture(){},releasePointerCapture(){}}
const target={closest:()=>({closest:()=>viewport})}
const context=vm.createContext({state:{activeTab:'mixer',snapshot:{}}, now:()=>100, Date, Math, Number,
 isPlaying:()=>false, getTransportSeekPlaying:()=>false, getTransportSeekTarget:()=>null,
 postCommand:(command,args)=>{sent.push({command,args});return Promise.resolve({ok:true})},
 syncTransportSeekModalDom(){},syncMixerTimelineCursorDom(){},showPopup(){},stopMixerGridMomentum(){},
 document:{documentElement:{dataset:{directorDevice:'phone'}}},window:{matchMedia:()=>({matches:false}),setTimeout:fn=>{hold=fn;return 1},clearTimeout:()=>{hold=null}},
 IS_MUSICIAN_MONITOR:false,navigator:{},findMixerTimelineItemById:()=>({id:'a'}),
 root:{querySelector:()=>null,insertAdjacentHTML:()=>mounted++},renderMixerItemModal:()=>'<div>modal</div>',scheduleRender:()=>scheduled++})
vm.runInContext('let mixerCursorDrag=null, mixerItemHoldTimer=0, mixerItemHoldPointerId=null, mixerItemHoldTarget="", mixerItemHoldStartX=0, mixerItemHoldStartY=0;\n'+['setTransportSeekCursorRatio','handleMixerGridSeek','handleMixerCursorDrag','cancelMixerItemHold','openMixerItemModal','handleMixerItemHold'].map(extract).join('\n'),context)
const pointer=(type,x)=>({type,clientX:x,clientY:x,pointerId:1,button:0,pointerType:'touch',target,preventDefault(){},stopImmediatePropagation(){}})
context.handleMixerCursorDrag(pointer('pointerdown',0))
context.handleMixerCursorDrag(pointer('pointermove',500))
assert.equal(sent.length,2,'moves reach extension before release')
assert.equal(sent[0].command,'edit_cursor_move')
assert.equal(sent[0].args.position,100)
assert.equal(sent[1].args.position,150)
context.handleMixerCursorDrag(pointer('pointerup',1000))
assert.equal(sent[2].args.position,200)
assert.equal(context.state.transportSeekDragging,false)
context.handleMixerCursorDrag(pointer('pointermove',20))
assert.equal(sent.length,3,'finished gesture stops sending')
context.handleMixerCursorDrag(pointer('pointerdown',50))
context.handleMixerCursorDrag(pointer('pointercancel',80))
assert.equal(sent.length,4,'cancel does not seek')
context.document.documentElement.dataset.directorDevice='tablet'
context.window.matchMedia=()=>({matches:true})
context.handleMixerGridSeek(viewport,{clientX:0,clientY:500})
assert.equal(sent.at(-1).args.position,150,'rotated tablet follows same Grid axis')
context.isPlaying=()=>true
context.handleMixerCursorDrag(pointer('pointerdown',500))
assert.equal(sent.length,5,'playback prevents cursor editing')
context.isPlaying=()=>false
const item={closest:()=>({getAttribute:()=> 'a'})}
context.handleMixerItemHold({...pointer('pointerdown',0),target:item})
assert.equal(mounted,0)
hold()
assert.equal(mounted,1,'modal mounts while finger remains down, independently of deferred list renders')
assert.equal(scheduled,1)
context.handleMixerItemHold({...pointer('pointerup',0),target:item})
assert.equal(mounted,1)
console.log('TCP_POINTER_PARITY_OK: continuous seek, rotation, cancel, playback guard, immediate hold modal')
