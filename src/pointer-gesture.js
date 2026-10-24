/**
 * Ein Tap ist genau ein Zeiger ohne vorherige Mehrfinger-Geste oder Bewegung.
 * Das Ergebnis wird am ursprünglichen pointerup-Ereignis festgehalten, bevor
 * Controls oder Mess-Handler es verarbeiten. pointercancel erzeugt keinen Tap.
 * @param {HTMLElement} element @param {number} threshold
 */
export function createTapGuard(element,threshold=6) {
  const pointers=new Map(),results=new WeakMap(),controller=new AbortController();
  let multiple=false;
  const options={capture:true,signal:controller.signal};
  element.addEventListener('pointerdown',e=>{
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,moved:false,button:e.button});
    if(pointers.size>1)multiple=true;
  },options);
  element.addEventListener('pointermove',e=>{
    const p=pointers.get(e.pointerId);if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>threshold)p.moved=true;
  },options);
  const end=(e,cancelled)=>{
    const p=pointers.get(e.pointerId);
    results.set(e,!!p&&!cancelled&&!multiple&&!p.moved&&p.button===0&&Math.hypot(e.clientX-p.x,e.clientY-p.y)<=threshold);
    pointers.delete(e.pointerId);if(!pointers.size)multiple=false;
  };
  element.addEventListener('pointerup',e=>end(e,false),options);
  element.addEventListener('pointercancel',e=>end(e,true),options);
  return {wasTap:e=>results.get(e)===true,isMultiple:()=>multiple,count:()=>pointers.size,reset:()=>{pointers.clear();multiple=false},dispose:()=>controller.abort()};
}
